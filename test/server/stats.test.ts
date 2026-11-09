import { describe, expect, it } from 'vitest'
import { openDatabase } from '../../server/database/connection'
import { insertReview } from '../../server/database/repository'
import { createReviewService } from '../../server/services/review'
import { defaultScope, type ReviewScope } from '../../server/services/scope'
import { buildStats, createStatsService, percentOf } from '../../server/services/stats'
import { createFakeImmich, immichHttpError, makeAsset } from './helpers/fake-immich'

const USER = 'user-1'
const ALBUM = '22222222-2222-4222-8222-222222222222'

function setup(count: number) {
  const assets = Array.from({ length: count }, () => makeAsset())
  const { immich, library } = createFakeImmich(assets)
  const db = openDatabase(':memory:')
  let t = 0
  const clock = { now: () => t, advance: (ms: number) => (t += ms) }
  const stats = createStatsService({ db, immich, now: clock.now, pageSize: 2 })
  const review = createReviewService({ db, immich, getUserId: async () => USER, onChange: (id) => stats.noteReviewed(id) })
  return { db, immich, library, stats, review, ids: assets.map((a) => a.id), clock }
}

describe('percent and stats math', () => {
  it('rounds to one decimal and is 0 for an empty scope', () => {
    expect(percentOf(0, 0)).toBe(0)
    expect(percentOf(1, 3)).toBe(33.3)
    expect(percentOf(2, 3)).toBe(66.7)
    expect(percentOf(1, 8)).toBe(12.5)
    expect(percentOf(3, 3)).toBe(100)
  })

  it('total = remaining + reviewed and remaining never goes negative', () => {
    expect(buildStats({ kept: 2, trashed: 3, favourited: 1 }, 10)).toEqual({
      total: 13,
      reviewed: 6,
      kept: 2,
      trashed: 3,
      favourited: 1,
      remaining: 7,
      percent: 46.2,
    })
    expect(buildStats({ kept: 5, trashed: 0, favourited: 0 }, 2).remaining).toBe(0)
  })
})

describe('whole-library stats', () => {
  it('moves counters with each decision without double counting favourites', async () => {
    const { stats, review, ids } = setup(10)
    expect(await stats.compute(USER, defaultScope)).toMatchObject({ total: 10, reviewed: 0, remaining: 10, percent: 0 })

    await review.decide(ids[0]!, 'keep')
    await review.decide(ids[1]!, 'trash')
    await review.decide(ids[2]!, 'favourite')
    // The favourited asset is still visible in Immich's count and counts as reviewed once.
    expect(await stats.compute(USER, defaultScope)).toEqual({
      total: 10,
      reviewed: 3,
      kept: 1,
      trashed: 1,
      favourited: 1,
      remaining: 7,
      percent: 30,
    })

    await review.undo()
    await review.undo()
    expect(await stats.compute(USER, defaultScope)).toMatchObject({ total: 10, reviewed: 1, remaining: 9, percent: 10 })
  })

  it('maps Immich failures to 502, and computeSafe falls back to DB counts', async () => {
    const { stats, immich, review, ids } = setup(4)
    await stats.compute(USER, defaultScope)
    await review.decide(ids[0]!, 'keep')
    immich.searchStatistics.mockRejectedValue(immichHttpError(500))
    await expect(stats.compute(USER, defaultScope)).rejects.toMatchObject({ statusCode: 502 })
    expect(await stats.computeSafe(USER, defaultScope)).toMatchObject({ kept: 1, reviewed: 1, remaining: 3, total: 4 })
  })
})

describe('album/date scope stats', () => {
  const albumScope: ReviewScope = { ...defaultScope, albumId: ALBUM }

  it('counts only review rows whose assets are in scope (including trashed ones)', async () => {
    const { db, immich, stats, review, ids } = setup(6)
    // Album = first 4 assets.
    const inAlbum = new Set(ids.slice(0, 4))
    immich.searchStatistics.mockImplementation(async (filters) =>
      filters?.albumIds ? { total: [...inAlbum].length } : { total: 6 },
    )
    const base = immich.searchMetadata.getMockImplementation()!
    immich.searchMetadata.mockImplementation(async (params) => {
      const result = await base({ ...params, size: 1000, page: 1 })
      const items = params.albumIds ? result.items.filter((a) => inAlbum.has(a.id)) : result.items
      const start = (params.page - 1) * params.size
      return { items: items.slice(start, start + params.size), nextPage: start + params.size < items.length ? String(params.page + 1) : null }
    })

    await review.decide(ids[0]!, 'keep')
    await review.decide(ids[1]!, 'trash')
    inAlbum.delete(ids[1]!) // trashed assets drop out of Immich's count...
    immich.searchStatistics.mockImplementation(async (filters) => (filters?.albumIds ? { total: 3 } : { total: 5 }))
    await review.decide(ids[5]!, 'keep') // outside the album
    insertReview(db, { userId: 'someone-else', assetId: ids[2]!, status: 'kept', reviewedAt: new Date().toISOString() })

    inAlbum.add(ids[1]!) // ...but withDeleted search still lists them as members
    const result = await stats.compute(USER, albumScope)
    expect(result).toEqual({ total: 4, reviewed: 2, kept: 1, trashed: 1, favourited: 0, remaining: 2, percent: 50 })
    expect(immich.searchMetadata.mock.calls.every(([p]) => p.withDeleted === true)).toBe(true)
  })

  it('caches scope ids for 5 minutes', async () => {
    const { immich, stats, clock } = setup(3)
    const scope: ReviewScope = { ...defaultScope, takenAfter: '2000-01-01' }
    await stats.compute(USER, scope)
    const calls = immich.searchMetadata.mock.calls.length
    expect(calls).toBe(2) // 3 assets, page size 2
    await stats.compute(USER, scope)
    expect(immich.searchMetadata.mock.calls.length).toBe(calls)
    clock.advance(5 * 60_000 + 1)
    await stats.compute(USER, scope)
    expect(immich.searchMetadata.mock.calls.length).toBe(calls * 2)
  })

  it('a review of an asset outside a cached set invalidates it; reviews inside keep it', async () => {
    const { immich, stats, review, ids, library } = setup(3)
    const scope: ReviewScope = { ...defaultScope, takenAfter: '2000-01-01' }
    await stats.compute(USER, scope)
    expect(stats.cacheSize()).toBe(1)

    await review.decide(ids[0]!, 'keep')
    expect(stats.cacheSize()).toBe(1)

    const newcomer = makeAsset()
    library.set(newcomer.id, newcomer)
    await review.decide(newcomer.id, 'keep')
    expect(stats.cacheSize()).toBe(0)
    const before = immich.searchMetadata.mock.calls.length
    expect((await stats.compute(USER, scope)).kept).toBe(2)
    expect(immich.searchMetadata.mock.calls.length).toBeGreaterThan(before)

    stats.invalidateAll()
    expect(stats.cacheSize()).toBe(0)
  })
})
