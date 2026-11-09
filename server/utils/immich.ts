import type { H3Event } from 'h3'
import { z } from 'zod'

/**
 * Typed client for the subset of the Immich API listed in docs/DESIGN.md
 * ("Immich API usage"). All server code talks to Immich through this module.
 *
 * Safety rules enforced here:
 * - `trashAssets` always sends `force: false` (move to trash, never permanent delete).
 * - The API key is only ever sent in the `x-api-key` header and is redacted from
 *   every error message.
 */

export type ImmichErrorKind = 'config' | 'network' | 'timeout' | 'http' | 'invalid_response'

export class ImmichError extends Error {
  override readonly name = 'ImmichError'
  /** HTTP status returned by Immich, or null when no response was received. */
  readonly status: number | null
  readonly kind: ImmichErrorKind
  readonly method: string
  readonly path: string

  constructor(options: { kind: ImmichErrorKind; status: number | null; method: string; path: string; message: string }) {
    super(options.message)
    this.kind = options.kind
    this.status = options.status
    this.method = options.method
    this.path = options.path
  }
}

// ---------------------------------------------------------------------------
// Response schemas (minimal: only the fields the app uses; unknown keys are stripped)
// ---------------------------------------------------------------------------

const nullableString = z
  .string()
  .nullish()
  .transform((value) => value ?? null)
const nullableNumber = z
  .number()
  .nullish()
  .transform((value) => value ?? null)

const userSchema = z.object({
  id: z.string(),
  name: nullableString,
  email: nullableString,
})

const versionSchema = z.object({
  major: z.number(),
  minor: z.number(),
  patch: z.number(),
  prerelease: nullableNumber,
})

const albumSchema = z.object({
  id: z.string(),
  albumName: z.string(),
  assetCount: z.number(),
  albumThumbnailAssetId: nullableString,
})

const exifSchema = z
  .object({
    dateTimeOriginal: nullableString,
    city: nullableString,
    state: nullableString,
    country: nullableString,
    latitude: nullableNumber,
    longitude: nullableNumber,
    make: nullableString,
    model: nullableString,
    exifImageWidth: nullableNumber,
    exifImageHeight: nullableNumber,
    description: nullableString,
  })
  .nullish()
  .transform((value) => value ?? null)

const assetSchema = z.object({
  id: z.string(),
  type: z.string(),
  originalFileName: nullableString,
  fileCreatedAt: nullableString,
  localDateTime: nullableString,
  isFavorite: z.boolean(),
  isTrashed: z.boolean().default(false),
  width: nullableNumber,
  height: nullableNumber,
  exifInfo: exifSchema,
})

const searchMetadataSchema = z.object({
  assets: z.object({
    items: z.array(assetSchema),
    nextPage: nullableString,
  }),
})

const statisticsSchema = z.object({ total: z.number() })
const trashResponseSchema = z.object({ count: z.number() })
const errorBodySchema = z.object({ message: z.union([z.string(), z.array(z.string())]) })

export type ImmichUser = z.output<typeof userSchema>
export type ImmichVersion = z.output<typeof versionSchema>
export type ImmichAlbum = z.output<typeof albumSchema>
export type ImmichExif = NonNullable<z.output<typeof exifSchema>>
export type ImmichAsset = z.output<typeof assetSchema>

// ---------------------------------------------------------------------------
// Request parameter types
// ---------------------------------------------------------------------------

export type ImmichSearchFilters = {
  albumIds?: string[]
  /** ISO date-time, inclusive lower bound. */
  takenAfter?: string | null
  /** ISO date-time, upper bound. */
  takenBefore?: string | null
}

export type ImmichThumbnailSize = 'preview' | 'thumbnail'

export type ImmichClientOptions = {
  /** Immich base URL without `/api`, e.g. `http://immich-server:2283`. */
  baseUrl: string
  apiKey: string
  /** Injectable for tests; defaults to the global `fetch`. */
  fetch?: typeof globalThis.fetch
  /** Per-request timeout in milliseconds (default 15000). */
  timeoutMs?: number
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export function createImmichClient(options: ImmichClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, '')
  const apiKey = options.apiKey
  const fetchImpl = options.fetch ?? globalThis.fetch
  const timeoutMs = options.timeoutMs ?? 15_000

  function redact(text: string) {
    return apiKey ? text.split(apiKey).join('[redacted]') : text
  }

  function fail(kind: ImmichErrorKind, status: number | null, method: string, path: string, detail: string) {
    return new ImmichError({
      kind,
      status,
      method,
      path,
      message: redact(`Immich ${method} ${path} failed: ${detail}`),
    })
  }

  async function send(method: string, path: string, init: { body?: unknown; accept?: string } = {}) {
    if (!baseUrl || !apiKey) {
      throw fail('config', null, method, path, 'Immich URL or API key is not configured')
    }

    const headers: Record<string, string> = {
      'x-api-key': apiKey,
      accept: init.accept ?? 'application/json',
    }
    if (init.body !== undefined) headers['content-type'] = 'application/json'

    let response: Response
    try {
      response = await fetchImpl(`${baseUrl}/api${path}`, {
        method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      const isTimeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
      const reason = error instanceof Error ? error.message : 'unknown error'
      throw fail(isTimeout ? 'timeout' : 'network', null, method, path, isTimeout ? 'request timed out' : reason)
    }

    if (!response.ok) {
      const detail = await readErrorDetail(response)
      throw fail('http', response.status, method, path, `HTTP ${response.status}${detail ? ` (${detail})` : ''}`)
    }
    return response
  }

  async function sendJson<T extends z.ZodType>(method: string, path: string, schema: T, body?: unknown) {
    const response = await send(method, path, { body })
    let data: unknown
    try {
      data = await response.json()
    } catch {
      throw fail('invalid_response', response.status, method, path, 'response is not valid JSON')
    }
    const parsed = schema.safeParse(data)
    if (!parsed.success) {
      throw fail('invalid_response', response.status, method, path, 'unexpected response shape')
    }
    return parsed.data
  }

  function filterBody(filters: ImmichSearchFilters) {
    return {
      type: 'IMAGE',
      ...(filters.albumIds && filters.albumIds.length > 0 ? { albumIds: filters.albumIds } : {}),
      ...(filters.takenAfter ? { takenAfter: filters.takenAfter } : {}),
      ...(filters.takenBefore ? { takenBefore: filters.takenBefore } : {}),
    }
  }

  const assetPath = (id: string) => `/assets/${encodeURIComponent(id)}`

  return {
    /** GET /api/users/me */
    getMe: () => sendJson('GET', '/users/me', userSchema),

    /** GET /api/server/version */
    getVersion: () => sendJson('GET', '/server/version', versionSchema),

    /** GET /api/albums */
    listAlbums: () => sendJson('GET', '/albums', z.array(albumSchema)),

    /** POST /api/search/random (images only, with EXIF) */
    searchRandom: (params: ImmichSearchFilters & { size: number }) =>
      sendJson('POST', '/search/random', z.array(assetSchema), {
        ...filterBody(params),
        size: params.size,
        withExif: true,
      }),

    /**
     * POST /api/search/metadata (images only, with EXIF), page-number pagination.
     * `withDeleted: true` also returns trashed assets, which keeps page offsets and
     * scope membership stable while the user trashes photos.
     */
    searchMetadata: async (
      params: ImmichSearchFilters & { page: number; size: number; order: 'asc' | 'desc'; withDeleted?: boolean },
    ) => {
      const result = await sendJson('POST', '/search/metadata', searchMetadataSchema, {
        ...filterBody(params),
        page: params.page,
        size: params.size,
        order: params.order,
        withExif: true,
        ...(params.withDeleted ? { withDeleted: true } : {}),
      })
      return { items: result.assets.items, nextPage: result.assets.nextPage }
    },

    /** POST /api/search/statistics (images only) */
    searchStatistics: (params: ImmichSearchFilters = {}) =>
      sendJson('POST', '/search/statistics', statisticsSchema, filterBody(params)),

    /** GET /api/assets/{id} */
    getAsset: (id: string) => sendJson('GET', assetPath(id), assetSchema),

    /** GET /api/assets/{id}/thumbnail?size=preview|thumbnail */
    fetchThumbnail: async (id: string, size: ImmichThumbnailSize = 'preview') => {
      const response = await send('GET', `${assetPath(id)}/thumbnail?size=${size}`, { accept: 'image/*' })
      return {
        body: await response.arrayBuffer(),
        contentType: response.headers.get('content-type') ?? 'application/octet-stream',
      }
    },

    /**
     * DELETE /api/assets with `force: false`: moves assets to the Immich trash.
     * There is deliberately no way to request a permanent delete.
     */
    trashAssets: async (ids: string[]) => {
      if (ids.length === 0) return
      await send('DELETE', '/assets', { body: { ids, force: false } })
    },

    /** POST /api/trash/restore/assets */
    restoreAssets: async (ids: string[]) => {
      if (ids.length === 0) return { count: 0 }
      return sendJson('POST', '/trash/restore/assets', trashResponseSchema, { ids })
    },

    /** PUT /api/assets/{id} { isFavorite } */
    setFavorite: (id: string, isFavorite: boolean) => sendJson('PUT', assetPath(id), assetSchema, { isFavorite }),
  }
}

export type ImmichClient = ReturnType<typeof createImmichClient>

/** Immich client configured from runtime config (see server/utils/config.ts). */
export function useImmichClient(event?: H3Event) {
  const config = useServerConfig(event)
  return createImmichClient({ baseUrl: config.immichUrl, apiKey: config.immichApiKey })
}

async function readErrorDetail(response: Response) {
  try {
    const parsed = errorBodySchema.safeParse(await response.json())
    if (!parsed.success) return ''
    const message = parsed.data.message
    return (Array.isArray(message) ? message.join('; ') : message).slice(0, 200)
  } catch {
    return ''
  }
}
