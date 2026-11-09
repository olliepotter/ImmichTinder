import { describe, expect, it, vi } from 'vitest'
import { createImmichClient, ImmichError } from '../../server/utils/immich'

const API_KEY = 'super-secret-api-key-123'
const BASE_URL = 'http://immich.test:2283'
const ASSET_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function asset(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSET_ID,
    type: 'IMAGE',
    originalFileName: 'IMG_0001.jpg',
    fileCreatedAt: '2024-01-01T10:00:00.000Z',
    localDateTime: '2024-01-01T11:00:00.000Z',
    isFavorite: false,
    isTrashed: false,
    width: 4000,
    height: 3000,
    exifInfo: { city: 'Berlin', country: 'Germany', make: 'Canon', model: 'EOS R5', latitude: 52.5, longitude: 13.4 },
    unusedField: 'stripped',
    ...overrides,
  }
}

function setup(response: () => Response | Promise<Response>) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => response())
  const client = createImmichClient({ baseUrl: `${BASE_URL}/`, apiKey: API_KEY, fetch })
  function call(index = 0) {
    const [url, init] = fetch.mock.calls[index] ?? []
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    return { url: String(url), init, body, headers: new Headers(init?.headers) }
  }
  return { fetch, client, call }
}

async function captureError(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected promise to reject')
}

describe('trashAssets', () => {
  it('sends DELETE /api/assets with force:false', async () => {
    const { client, call } = setup(() => new Response(null, { status: 204 }))
    await client.trashAssets([ASSET_ID])

    const { url, init, body } = call()
    expect(url).toBe(`${BASE_URL}/api/assets`)
    expect(init?.method).toBe('DELETE')
    expect(body).toEqual({ ids: [ASSET_ID], force: false })
    expect(body.force).toBe(false)
  })

  it('accepts no option that could enable a permanent delete', () => {
    const { client } = setup(() => new Response(null, { status: 204 }))
    expect(client.trashAssets.length).toBe(1)
  })

  it('does not call Immich for an empty id list', async () => {
    const { client, fetch } = setup(() => new Response(null, { status: 204 }))
    await client.trashAssets([])
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('authentication and errors', () => {
  it('sends the API key only in the x-api-key header', async () => {
    const { client, call } = setup(() => jsonResponse({ id: 'user-1', name: 'Me', email: 'me@example.com' }))
    await client.getMe()

    const { url, headers } = call()
    expect(url).toBe(`${BASE_URL}/api/users/me`)
    expect(url).not.toContain(API_KEY)
    expect(headers.get('x-api-key')).toBe(API_KEY)
  })

  it('wraps HTTP failures in ImmichError with the status and without the API key', async () => {
    // Immich echoing the key back must still not leak it.
    const { client } = setup(() => jsonResponse({ message: `Invalid API key ${API_KEY}`, statusCode: 401 }, 401))
    const error = await captureError(client.getAsset(ASSET_ID))

    expect(error).toBeInstanceOf(ImmichError)
    if (!(error instanceof ImmichError)) return
    expect(error.status).toBe(401)
    expect(error.kind).toBe('http')
    expect(error.message).not.toContain(API_KEY)
    expect(error.stack ?? '').not.toContain(API_KEY)
    expect(JSON.stringify(error)).not.toContain(API_KEY)
    expect(error.message).toContain('[redacted]')
  })

  it('wraps network failures without leaking the API key', async () => {
    const { client } = setup(() => {
      throw new TypeError(`fetch failed for key ${API_KEY}`)
    })
    const error = await captureError(client.getVersion())

    expect(error).toBeInstanceOf(ImmichError)
    if (!(error instanceof ImmichError)) return
    expect(error.status).toBeNull()
    expect(error.kind).toBe('network')
    expect(error.message).not.toContain(API_KEY)
  })

  it('rejects unexpected response shapes', async () => {
    const { client } = setup(() => jsonResponse({ nope: true }))
    const error = await captureError(client.searchStatistics())
    expect(error).toBeInstanceOf(ImmichError)
    if (error instanceof ImmichError) expect(error.kind).toBe('invalid_response')
  })

  it('fails with a config error when not configured', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    const client = createImmichClient({ baseUrl: '', apiKey: '', fetch })
    const error = await captureError(client.getMe())
    expect(error).toBeInstanceOf(ImmichError)
    if (error instanceof ImmichError) expect(error.kind).toBe('config')
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('endpoints', () => {
  it('searchRandom sends images-only filters with EXIF', async () => {
    const { client, call } = setup(() => jsonResponse([asset()]))
    const result = await client.searchRandom({ size: 10, albumIds: ['album-1'], takenAfter: '2020-01-01T00:00:00.000Z' })

    expect(call().url).toBe(`${BASE_URL}/api/search/random`)
    expect(call().body).toEqual({
      type: 'IMAGE',
      albumIds: ['album-1'],
      takenAfter: '2020-01-01T00:00:00.000Z',
      size: 10,
      withExif: true,
    })
    expect(result[0]?.id).toBe(ASSET_ID)
    expect(result[0]?.exifInfo?.city).toBe('Berlin')
    expect(result[0]?.exifInfo?.state).toBeNull()
    expect(result[0]).not.toHaveProperty('unusedField')
  })

  it('searchMetadata paginates by page number and returns items + nextPage', async () => {
    const { client, call } = setup(() =>
      jsonResponse({ albums: { items: [] }, assets: { items: [asset()], nextPage: '2', count: 1, total: 1, facets: [] } }),
    )
    const result = await client.searchMetadata({ page: 1, size: 50, order: 'asc' })

    expect(call().body).toEqual({ type: 'IMAGE', page: 1, size: 50, order: 'asc', withExif: true })
    expect(result.nextPage).toBe('2')
    expect(result.items).toHaveLength(1)
  })

  it('searchStatistics returns total', async () => {
    const { client, call } = setup(() => jsonResponse({ total: 42 }))
    expect(await client.searchStatistics({ takenBefore: '2021-01-01T00:00:00.000Z' })).toEqual({ total: 42 })
    expect(call().body).toEqual({ type: 'IMAGE', takenBefore: '2021-01-01T00:00:00.000Z' })
  })

  it('listAlbums maps album fields', async () => {
    const { client } = setup(() =>
      jsonResponse([{ id: 'a1', albumName: 'Holiday', assetCount: 3, albumThumbnailAssetId: null, shared: false }]),
    )
    expect(await client.listAlbums()).toEqual([
      { id: 'a1', albumName: 'Holiday', assetCount: 3, albumThumbnailAssetId: null },
    ])
  })

  it('getVersion tolerates a missing prerelease field (Immich v2)', async () => {
    const { client } = setup(() => jsonResponse({ major: 2, minor: 7, patch: 5 }))
    expect(await client.getVersion()).toEqual({ major: 2, minor: 7, patch: 5, prerelease: null })
  })

  it('fetchThumbnail returns bytes and the upstream content type', async () => {
    const { client, call } = setup(
      () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/webp' } }),
    )
    const image = await client.fetchThumbnail(ASSET_ID, 'thumbnail')

    expect(call().url).toBe(`${BASE_URL}/api/assets/${ASSET_ID}/thumbnail?size=thumbnail`)
    expect(image.contentType).toBe('image/webp')
    expect(new Uint8Array(image.body)).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('restoreAssets posts ids to /api/trash/restore/assets', async () => {
    const { client, call } = setup(() => jsonResponse({ count: 1 }))
    expect(await client.restoreAssets([ASSET_ID])).toEqual({ count: 1 })
    expect(call().url).toBe(`${BASE_URL}/api/trash/restore/assets`)
    expect(call().init?.method).toBe('POST')
    expect(call().body).toEqual({ ids: [ASSET_ID] })
  })

  it('setFavorite sends PUT /api/assets/{id} with isFavorite', async () => {
    const { client, call } = setup(() => jsonResponse(asset({ isFavorite: true })))
    const result = await client.setFavorite(ASSET_ID, true)
    expect(call().url).toBe(`${BASE_URL}/api/assets/${ASSET_ID}`)
    expect(call().init?.method).toBe('PUT')
    expect(call().body).toEqual({ isFavorite: true })
    expect(result.isFavorite).toBe(true)
  })

  it('encodes asset ids in paths', async () => {
    const { client, call } = setup(() => jsonResponse(asset()))
    await client.getAsset('../users/me')
    expect(call().url).toBe(`${BASE_URL}/api/assets/..%2Fusers%2Fme`)
  })
})
