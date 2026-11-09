import type { AnyServerRouteMethod } from '#app'
import type {
  Album,
  Decision,
  QueueQuery,
  QueueResponse,
  ResetResponse,
  ReviewResponse,
  ReviewScope,
  SessionResponse,
  Stats,
  UndoResponse,
} from '~/types/api'

/** Error thrown by every API call: `message` is what the UI shows. */
export class ApiError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function readString(source: unknown, key: string) {
  if (source && typeof source === 'object' && key in source) {
    const value: unknown = Reflect.get(source, key)
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

function readNumber(source: unknown, key: string) {
  if (source && typeof source === 'object' && key in source) {
    const value: unknown = Reflect.get(source, key)
    if (typeof value === 'number') return value
  }
  return null
}

const FALLBACK_MESSAGES: Record<number, string> = {
  400: 'Invalid request',
  401: 'Not signed in',
  404: 'Not found',
  409: 'Already reviewed',
  429: 'Too many attempts, try again shortly',
  502: 'Immich did not respond',
  503: 'Service unavailable',
}

/**
 * Normalises a $fetch (ofetch FetchError) failure. The h3 error body carries
 * `statusMessage`, which is preferred; the HTTP status text is the fallback.
 */
export function toApiError(error: unknown) {
  if (error instanceof ApiError) return error
  const data: unknown = error && typeof error === 'object' ? Reflect.get(error, 'data') : null
  const status = readNumber(error, 'statusCode') ?? readNumber(error, 'status') ?? readNumber(data, 'statusCode')
  const message
    = readString(data, 'statusMessage')
      ?? readString(data, 'statusText')
      ?? readString(error, 'statusMessage')
      ?? (status !== null ? FALLBACK_MESSAGES[status] : undefined)
      ?? (status === null ? 'Network error, check your connection' : `Request failed (${status})`)
  return new ApiError(message, status)
}

type Fetcher = ReturnType<typeof useRequestFetch>
type Method = 'GET' | 'POST' | 'PUT'
type RequestOptions = {
  method?: Method
  body?: Record<string, unknown>
  query?: Record<string, string | number>
}

/**
 * Every scope field is sent explicitly ('' = null): the server falls back to
 * the saved scope for absent fields, and the client's scope must win.
 */
function scopeQuery(scope: ReviewScope) {
  return {
    albumId: scope.albumId ?? '',
    order: scope.order,
    takenAfter: scope.takenAfter ?? '',
    takenBefore: scope.takenBefore ?? '',
  }
}

export function createApi(fetcher: Fetcher, hooks: { onUnauthorized?: () => void } = {}) {
  async function call<T>(url: string, options: RequestOptions = {}) {
    try {
      return await fetcher<T, string, AnyServerRouteMethod>(url, options)
    }
    catch (error) {
      const apiError = toApiError(error)
      if (apiError.status === 401 && !url.startsWith('/api/auth/')) hooks.onUnauthorized?.()
      throw apiError
    }
  }

  return {
    session: () => call<SessionResponse>('/api/auth/session'),
    login: (password: string) => call<{ ok: true }>('/api/auth/login', { method: 'POST', body: { password } }),
    logout: () => call<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
    albums: () => call<{ albums: Album[] }>('/api/albums'),
    getScope: () => call<ReviewScope>('/api/scope'),
    putScope: (scope: ReviewScope) => call<ReviewScope>('/api/scope', { method: 'PUT', body: { ...scope } }),
    queue: (q: QueueQuery) => {
      const query: Record<string, string | number> = { ...scopeQuery(q), size: q.size }
      if (q.exclude.length) query.exclude = q.exclude.join(',')
      if (q.page) query.page = q.page
      return call<QueueResponse>('/api/queue', { query })
    },
    review: (assetId: string, decision: Decision) =>
      call<ReviewResponse>('/api/review', { method: 'POST', body: { assetId, decision } }),
    undo: () => call<UndoResponse>('/api/review/undo', { method: 'POST' }),
    stats: (scope: ReviewScope) => call<Stats>('/api/stats', { query: scopeQuery(scope) }),
    reset: () => call<ResetResponse>('/api/review/reset', { method: 'POST', body: { confirm: 'RESET' } }),
  }
}

export type Api = ReturnType<typeof createApi>

/** Typed API bound to the current Nuxt app. Any 401 sends the user to /login. */
export function useApi() {
  const nuxtApp = useNuxtApp()
  return createApi(useRequestFetch(), {
    onUnauthorized: () => {
      if (import.meta.client) void nuxtApp.runWithContext(() => navigateTo('/login'))
    },
  })
}
