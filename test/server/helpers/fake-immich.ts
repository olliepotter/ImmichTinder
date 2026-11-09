import { vi } from 'vitest'
import { ImmichError, type ImmichAsset, type ImmichSearchFilters } from '../../../server/utils/immich'

let counter = 0

/** Deterministic UUID-shaped id for tests. */
export function uuid(n?: number) {
  const value = n ?? ++counter
  return `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`
}

export function makeAsset(overrides: Partial<ImmichAsset> = {}) {
  const asset: ImmichAsset = {
    id: uuid(),
    type: 'IMAGE',
    originalFileName: 'IMG_0001.jpg',
    fileCreatedAt: '2024-01-01T10:00:00.000Z',
    localDateTime: '2024-01-01T11:00:00.000Z',
    isFavorite: false,
    isTrashed: false,
    width: 4000,
    height: 3000,
    exifInfo: {
      dateTimeOriginal: '2024-01-01T09:00:00.000Z',
      city: 'Berlin',
      state: null,
      country: 'Germany',
      latitude: 52.5,
      longitude: 13.4,
      make: 'Canon',
      model: 'EOS R5',
      exifImageWidth: null,
      exifImageHeight: null,
      description: null,
    },
    ...overrides,
  }
  return asset
}

export function immichHttpError(status: number) {
  return new ImmichError({ kind: 'http', status, method: 'X', path: '/x', message: `Immich failed: HTTP ${status}` })
}

/** In-memory fake of the Immich client: a library of assets with trash and favourite state. */
export function createFakeImmich(assets: ImmichAsset[] = []) {
  const library = new Map(assets.map((asset) => [asset.id, { ...asset }]))

  const get = (id: string) => {
    const asset = library.get(id)
    if (!asset) throw immichHttpError(404)
    return { ...asset }
  }
  const visible = () => [...library.values()].filter((a) => !a.isTrashed)

  const immich = {
    getMe: vi.fn(async () => ({ id: 'user-1', name: 'Me', email: null })),
    getAsset: vi.fn(async (id: string) => get(id)),
    trashAssets: vi.fn(async (ids: string[]) => {
      for (const id of ids) {
        const asset = library.get(id)
        if (asset) asset.isTrashed = true
      }
    }),
    restoreAssets: vi.fn(async (ids: string[]) => {
      let count = 0
      for (const id of ids) {
        const asset = library.get(id)
        if (asset?.isTrashed) {
          asset.isTrashed = false
          count++
        }
      }
      return { count }
    }),
    setFavorite: vi.fn(async (id: string, isFavorite: boolean) => {
      const asset = library.get(id)
      if (!asset) throw immichHttpError(404)
      asset.isFavorite = isFavorite
      return { ...asset }
    }),
    searchRandom: vi.fn(async (params: { size: number }) => {
      const pool = visible()
      // Deterministic "random": rotate by call count.
      const offset = immich.searchRandom.mock.calls.length % Math.max(1, pool.length)
      const rotated = [...pool.slice(offset), ...pool.slice(0, offset)]
      return rotated.slice(0, params.size)
    }),
    searchMetadata: vi.fn(
      async (params: { page: number; size: number; order: 'asc' | 'desc'; albumIds?: string[]; withDeleted?: boolean }) => {
        const pool = (params.withDeleted ? [...library.values()] : visible()).sort((a, b) =>
          (a.fileCreatedAt ?? '').localeCompare(b.fileCreatedAt ?? ''),
        )
        if (params.order === 'desc') pool.reverse()
        const start = (params.page - 1) * params.size
        const items = pool.slice(start, start + params.size).map((a) => ({ ...a }))
        const nextPage = start + params.size < pool.length ? String(params.page + 1) : null
        return { items, nextPage }
      },
    ),
    // Album/date filters are not modelled; tests override this where they matter.
    searchStatistics: vi.fn(async (_filters?: ImmichSearchFilters) => ({ total: visible().length })),
  }
  return { immich, library }
}
