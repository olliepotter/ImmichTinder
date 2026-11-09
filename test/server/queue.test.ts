import { describe, expect, it } from 'vitest'
import { AppError } from '../../server/services/errors'
import { buildQueue, decodeCursor, encodeCursor, RANDOM_BATCH_SIZE, RANDOM_MAX_ATTEMPTS } from '../../server/services/queue'
import { defaultScope, type ReviewScope } from '../../server/services/scope'
import { createFakeImmich, immichHttpError, makeAsset } from './helpers/fake-immich'

function library(count: number) {
  return Array.from({ length: count }, (_, i) =>
    makeAsset({ fileCreatedAt: new Date(Date.UTC(2020, 0, 1 + i)).toISOString() }),
  )
}

const random: ReviewScope = { ...defaultScope, order: 'random' }
const oldest: ReviewScope = { ...defaultScope, order: 'oldest' }
const newest: ReviewScope = { ...defaultScope, order: 'newest' }

describe('random queue', () => {
  it('excludes reviewed and client-excluded ids', async () => {
    const assets = library(10)
    const { immich } = createFakeImmich(assets)
    const skip = new Set([assets[0]!.id, assets[3]!.id, assets[7]!.id])
    const result = await buildQueue(immich, { scope: random, size: 50, skip, cursor: null })
    const ids = result.items.map((i) => i.id)
    expect(ids).toHaveLength(7)
    for (const id of skip) expect(ids).not.toContain(id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(result.nextCursor).toBeNull()
  })

  it('is exhausted when everything in scope is reviewed', async () => {
    const assets = library(5)
    const { immich } = createFakeImmich(assets)
    const result = await buildQueue(immich, { scope: random, size: 10, skip: new Set(assets.map((a) => a.id)), cursor: null })
    expect(result).toEqual({ items: [], nextCursor: null, exhausted: true })
  })

  it('retries a bounded number of times, then reports exhaustion', async () => {
    const assets = library(RANDOM_BATCH_SIZE)
    const { immich } = createFakeImmich(assets)
    const result = await buildQueue(immich, { scope: random, size: 10, skip: new Set(assets.map((a) => a.id)), cursor: null })
    expect(immich.searchRandom).toHaveBeenCalledTimes(RANDOM_MAX_ATTEMPTS)
    expect(result.exhausted).toBe(true)
    expect(result.items).toEqual([])
  })

  it('is not exhausted when a small scope has more candidates than `size`', async () => {
    const { immich } = createFakeImmich(library(25))
    const result = await buildQueue(immich, { scope: random, size: 10, skip: new Set(), cursor: null })
    expect(result.items).toHaveLength(10)
    expect(result.exhausted).toBe(false)
  })

  it('is exhausted when the last candidates of a small scope fit into `size`', async () => {
    const assets = library(12)
    const { immich } = createFakeImmich(assets)
    const skip = new Set([assets[0]!.id, assets[1]!.id])
    const result = await buildQueue(immich, { scope: random, size: 10, skip, cursor: null })
    expect(result.items).toHaveLength(10)
    expect(result.exhausted).toBe(true)
  })

  it('returns at most `size` items and is not exhausted with a large scope', async () => {
    const { immich } = createFakeImmich(library(120))
    const result = await buildQueue(immich, { scope: random, size: 10, skip: new Set(), cursor: null })
    expect(result.items).toHaveLength(10)
    expect(result.exhausted).toBe(false)
    expect(immich.searchRandom).toHaveBeenCalledTimes(1)
  })

  it('skips trashed and non-image assets and maps QueueItem fields', async () => {
    const good = makeAsset({ isFavorite: true })
    const { immich } = createFakeImmich([good, makeAsset({ type: 'VIDEO' })])
    immich.searchRandom.mockResolvedValueOnce([good, makeAsset({ isTrashed: true }), makeAsset({ type: 'VIDEO' })])
    const result = await buildQueue(immich, { scope: random, size: 10, skip: new Set(), cursor: null })
    expect(result.items).toEqual([
      {
        id: good.id,
        takenAt: '2024-01-01T09:00:00.000Z',
        fileName: 'IMG_0001.jpg',
        isFavorite: true,
        width: 4000,
        height: 3000,
        location: { text: 'Berlin, Germany', city: 'Berlin', state: null, country: 'Germany', latitude: 52.5, longitude: 13.4 },
        camera: 'Canon EOS R5',
      },
    ])
  })

  it('passes album and date filters to Immich', async () => {
    const { immich } = createFakeImmich(library(1))
    const albumId = '11111111-1111-4111-8111-111111111111'
    await buildQueue(immich, {
      scope: { albumId, order: 'random', takenAfter: '2020-01-01', takenBefore: null },
      size: 5,
      skip: new Set(),
      cursor: null,
    })
    expect(immich.searchRandom).toHaveBeenCalledWith({
      albumIds: [albumId],
      takenAfter: '2020-01-01T00:00:00.000Z',
      size: RANDOM_BATCH_SIZE,
    })
  })

  it('maps Immich failures to 502', async () => {
    const { immich } = createFakeImmich(library(1))
    immich.searchRandom.mockRejectedValueOnce(immichHttpError(500))
    const error = await buildQueue(immich, { scope: random, size: 5, skip: new Set(), cursor: null }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AppError)
    expect(error instanceof AppError && error.statusCode).toBe(502)
  })
})

describe('ordered queue', () => {
  it('oldest pages in ascending order, skipping reviewed ids, with a resumable cursor', async () => {
    const assets = library(250)
    const { immich } = createFakeImmich(assets)
    const skip = new Set([assets[0]!.id, assets[1]!.id])

    const first = await buildQueue(immich, { scope: oldest, size: 10, skip, cursor: null })
    expect(first.items.map((i) => i.id)).toEqual(assets.slice(2, 12).map((a) => a.id))
    expect(first.exhausted).toBe(false)
    expect(first.nextCursor).toBe(encodeCursor(1))

    // Client holds the first batch and excludes it.
    const held = new Set([...skip, ...first.items.map((i) => i.id)])
    const second = await buildQueue(immich, { scope: oldest, size: 10, skip: held, cursor: first.nextCursor })
    expect(second.items.map((i) => i.id)).toEqual(assets.slice(12, 22).map((a) => a.id))
  })

  it('newest returns descending order', async () => {
    const assets = library(5)
    const { immich } = createFakeImmich(assets)
    const result = await buildQueue(immich, { scope: newest, size: 2, skip: new Set(), cursor: null })
    expect(result.items.map((i) => i.id)).toEqual([assets[4]!.id, assets[3]!.id])
    expect(immich.searchMetadata.mock.calls[0]?.[0]).toMatchObject({ order: 'desc', withDeleted: true })
  })

  it('moves past fully reviewed pages and reports exhaustion at the end', async () => {
    const assets = library(230)
    const { immich } = createFakeImmich(assets)
    const skip = new Set(assets.slice(0, 225).map((a) => a.id))
    const result = await buildQueue(immich, { scope: oldest, size: 10, skip, cursor: null })
    expect(result.items.map((i) => i.id)).toEqual(assets.slice(225).map((a) => a.id))
    expect(result.exhausted).toBe(true)
    expect(result.nextCursor).toBeNull()
  })

  it('does not lose assets when earlier photos were trashed (withDeleted keeps offsets stable)', async () => {
    const assets = library(150)
    const { immich, library: lib } = createFakeImmich(assets)
    const first = await buildQueue(immich, { scope: oldest, size: 100, skip: new Set(), cursor: null })
    for (const item of first.items) lib.get(item.id)!.isTrashed = true
    const skip = new Set(first.items.map((i) => i.id))
    const second = await buildQueue(immich, { scope: oldest, size: 100, skip, cursor: first.nextCursor })
    expect(second.items.map((i) => i.id)).toEqual(assets.slice(100).map((a) => a.id))
    expect(second.exhausted).toBe(true)
  })

  it('rejects invalid cursors with 400', () => {
    expect(decodeCursor(null)).toBe(1)
    expect(decodeCursor(encodeCursor(7))).toBe(7)
    for (const bad of ['garbage', encodeCursor(0), Buffer.from('{"page":"2"}').toString('base64url')]) {
      expect(() => decodeCursor(bad)).toThrow(AppError)
    }
  })
})
