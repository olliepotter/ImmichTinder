import { describe, expect, it } from 'vitest'
import { openDatabase } from '../../server/database/connection'
import { getReview, getSetting, insertReview, setSetting } from '../../server/database/repository'
import { AppError } from '../../server/services/errors'
import { createReviewService, type Decision } from '../../server/services/review'
import { createStatsService } from '../../server/services/stats'
import { defaultScope } from '../../server/services/scope'
import { createFakeImmich, immichHttpError, makeAsset } from './helpers/fake-immich'

const USER = 'user-1'

function setup(assetCount = 3) {
  const assets = Array.from({ length: assetCount }, () => makeAsset())
  const { immich, library } = createFakeImmich(assets)
  const db = openDatabase(':memory:')
  let clock = Date.parse('2025-01-01T00:00:00.000Z')
  const now = () => new Date((clock += 1000))
  const stats = createStatsService({ db, immich })
  const service = createReviewService({
    db,
    immich,
    getUserId: async () => USER,
    now,
    onChange: (id) => stats.noteReviewed(id),
  })
  const ids = assets.map((a) => a.id)
  return { db, immich, library, service, stats, ids }
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    if (error instanceof AppError) return error
    throw error
  }
  throw new Error('expected rejection')
}

describe('decisions', () => {
  it('keep records a row without any Immich mutation', async () => {
    const { db, immich, service, ids } = setup()
    const { review } = await service.decide(ids[0]!, 'keep')
    expect(review).toMatchObject({ assetId: ids[0], status: 'kept' })
    expect(getReview(db, USER, ids[0]!)?.status).toBe('kept')
    expect(immich.trashAssets).not.toHaveBeenCalled()
    expect(immich.setFavorite).not.toHaveBeenCalled()
  })

  it('trash moves the asset to the Immich trash, then records the row', async () => {
    const { db, immich, library, service, ids } = setup()
    const { review } = await service.decide(ids[0]!, 'trash')
    expect(review.status).toBe('trashed')
    expect(immich.trashAssets).toHaveBeenCalledWith([ids[0]])
    expect(library.get(ids[0]!)?.isTrashed).toBe(true)
    expect(getReview(db, USER, ids[0]!)?.status).toBe('trashed')
  })

  it('favourite stores the previous isFavorite and sets the favourite', async () => {
    const { db, immich, library, service, ids } = setup()
    await service.decide(ids[0]!, 'favourite')
    expect(immich.getAsset).toHaveBeenCalledWith(ids[0])
    expect(immich.setFavorite).toHaveBeenCalledWith(ids[0], true)
    expect(library.get(ids[0]!)?.isFavorite).toBe(true)
    const row = getReview(db, USER, ids[0]!)
    expect(row).toMatchObject({ status: 'favourited', previous_is_favorite: 0 })
  })

  it('favourite of an already-favourite asset records previous=true', async () => {
    const { db, library, service, ids } = setup()
    library.get(ids[0]!)!.isFavorite = true
    await service.decide(ids[0]!, 'favourite')
    expect(getReview(db, USER, ids[0]!)?.previous_is_favorite).toBe(1)
  })

  it.each<Decision>(['trash', 'favourite'])('%s: Immich failure records nothing and leaves stats unchanged', async (decision) => {
    const { db, immich, service, stats, ids } = setup()
    const before = await stats.compute(USER, defaultScope)
    immich.trashAssets.mockRejectedValueOnce(immichHttpError(500))
    immich.setFavorite.mockRejectedValueOnce(immichHttpError(500))

    const error = await rejection(service.decide(ids[0]!, decision))
    expect(error.statusCode).toBe(502)
    expect(error.message).not.toMatch(/key/i)
    expect(getReview(db, USER, ids[0]!)).toBeNull()
    expect(await stats.compute(USER, defaultScope)).toEqual(before)
  })

  it('favourite: failure to read the asset records nothing', async () => {
    const { db, immich, service, ids } = setup()
    immich.getAsset.mockRejectedValueOnce(immichHttpError(503))
    expect((await rejection(service.decide(ids[0]!, 'favourite'))).statusCode).toBe(502)
    expect(immich.setFavorite).not.toHaveBeenCalled()
    expect(getReview(db, USER, ids[0]!)).toBeNull()
  })

  it('a duplicate decision returns 409 without calling Immich again', async () => {
    const { immich, service, ids } = setup()
    await service.decide(ids[0]!, 'trash')
    const error = await rejection(service.decide(ids[0]!, 'trash'))
    expect(error.statusCode).toBe(409)
    expect(immich.trashAssets).toHaveBeenCalledTimes(1)
  })

  it('concurrent decisions for one asset: one succeeds, the other gets 409, one Immich call', async () => {
    const { db, immich, service, ids } = setup()
    const results = await Promise.allSettled([service.decide(ids[0]!, 'trash'), service.decide(ids[0]!, 'trash')])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((r) => r.status === 'rejected')
    expect(rejected?.status === 'rejected' && rejected.reason instanceof AppError && rejected.reason.statusCode).toBe(409)
    expect(immich.trashAssets).toHaveBeenCalledTimes(1)
    expect(getReview(db, USER, ids[0]!)?.status).toBe('trashed')
  })

  it('concurrent different decisions for one asset also make only one Immich call', async () => {
    const { immich, service, ids } = setup()
    const results = await Promise.allSettled([service.decide(ids[0]!, 'favourite'), service.decide(ids[0]!, 'trash')])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(immich.trashAssets.mock.calls.length + immich.setFavorite.mock.calls.length).toBe(1)
  })

  it('the UNIQUE constraint is the backstop when a row appears mid-flight', async () => {
    const { db, immich, service, ids } = setup()
    immich.trashAssets.mockImplementationOnce(async () => {
      insertReview(db, { userId: USER, assetId: ids[0]!, status: 'kept', reviewedAt: new Date().toISOString() })
    })
    expect((await rejection(service.decide(ids[0]!, 'trash'))).statusCode).toBe(409)
  })

  it('decisions for different assets run concurrently', async () => {
    const { service, ids } = setup()
    const results = await Promise.all([service.decide(ids[0]!, 'keep'), service.decide(ids[1]!, 'trash')])
    expect(results.map((r) => r.review.status)).toEqual(['kept', 'trashed'])
  })
})

describe('undo', () => {
  it('returns nulls when there is nothing to undo', async () => {
    const { service, immich } = setup()
    expect(await service.undo()).toEqual({ undone: null, asset: null })
    expect(immich.restoreAssets).not.toHaveBeenCalled()
  })

  it('kept: deletes the row without an Immich mutation and returns the asset', async () => {
    const { db, immich, service, ids } = setup()
    await service.decide(ids[0]!, 'keep')
    const result = await service.undo()
    expect(result.undone).toMatchObject({ assetId: ids[0], status: 'kept' })
    expect(result.asset?.id).toBe(ids[0])
    expect(immich.restoreAssets).not.toHaveBeenCalled()
    expect(immich.setFavorite).not.toHaveBeenCalled()
    expect(getReview(db, USER, ids[0]!)).toBeNull()
  })

  it('trashed: restores from trash and deletes the row', async () => {
    const { db, immich, library, service, ids } = setup()
    await service.decide(ids[0]!, 'trash')
    const result = await service.undo()
    expect(immich.restoreAssets).toHaveBeenCalledWith([ids[0]])
    expect(library.get(ids[0]!)?.isTrashed).toBe(false)
    expect(result.asset).toMatchObject({ id: ids[0], fileName: 'IMG_0001.jpg', camera: 'Canon EOS R5' })
    expect(getReview(db, USER, ids[0]!)).toBeNull()
  })

  it('favourited (previously not favourite): unsets the favourite', async () => {
    const { immich, library, service, ids } = setup()
    await service.decide(ids[0]!, 'favourite')
    const result = await service.undo()
    expect(immich.setFavorite).toHaveBeenLastCalledWith(ids[0], false)
    expect(library.get(ids[0]!)?.isFavorite).toBe(false)
    expect(result.asset?.isFavorite).toBe(false)
  })

  it('favourited (previously favourite): leaves the favourite alone', async () => {
    const { immich, library, service, ids } = setup()
    library.get(ids[0]!)!.isFavorite = true
    await service.decide(ids[0]!, 'favourite')
    immich.setFavorite.mockClear()
    await service.undo()
    expect(immich.setFavorite).not.toHaveBeenCalled()
    expect(library.get(ids[0]!)?.isFavorite).toBe(true)
  })

  it('a failed restore returns 502 and keeps the row; a retry then succeeds', async () => {
    const { db, immich, service, ids } = setup()
    await service.decide(ids[0]!, 'trash')
    immich.restoreAssets.mockRejectedValueOnce(immichHttpError(500))
    const error = await rejection(service.undo())
    expect(error.statusCode).toBe(502)
    expect(error.message).toMatch(/kept/)
    expect(getReview(db, USER, ids[0]!)?.status).toBe('trashed')

    const retry = await service.undo()
    expect(retry.undone?.assetId).toBe(ids[0])
    expect(getReview(db, USER, ids[0]!)).toBeNull()
  })

  it('a failed favourite revert keeps the row', async () => {
    const { db, immich, service, ids } = setup()
    await service.decide(ids[0]!, 'favourite')
    immich.setFavorite.mockRejectedValueOnce(immichHttpError(502))
    expect((await rejection(service.undo())).statusCode).toBe(502)
    expect(getReview(db, USER, ids[0]!)?.status).toBe('favourited')
  })

  it('repeated undo walks back through history, newest first', async () => {
    const { db, service, ids } = setup()
    await service.decide(ids[0]!, 'keep')
    await service.decide(ids[1]!, 'trash')
    await service.decide(ids[2]!, 'favourite')

    expect((await service.undo()).undone?.assetId).toBe(ids[2])
    expect((await service.undo()).undone?.assetId).toBe(ids[1])
    expect((await service.undo()).undone?.assetId).toBe(ids[0])
    expect((await service.undo()).undone).toBeNull()
    expect(getReview(db, USER, ids[0]!)).toBeNull()
  })

  it('concurrent undo: the second gets 409 and only one row is undone', async () => {
    const { db, immich, service, ids } = setup()
    await service.decide(ids[0]!, 'keep')
    await service.decide(ids[1]!, 'trash')
    const results = await Promise.allSettled([service.undo(), service.undo()])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(immich.restoreAssets).toHaveBeenCalledTimes(1)
    expect(getReview(db, USER, ids[0]!)?.status).toBe('kept')
  })

  it('a deleted asset still undoes, with asset: null', async () => {
    const { library, service, ids } = setup()
    await service.decide(ids[0]!, 'keep')
    library.delete(ids[0]!)
    const result = await service.undo()
    expect(result.undone?.assetId).toBe(ids[0])
    expect(result.asset).toBeNull()
  })

  it('the same asset can be reviewed again after undo', async () => {
    const { service, ids } = setup()
    await service.decide(ids[0]!, 'trash')
    await service.undo()
    expect((await service.decide(ids[0]!, 'keep')).review.status).toBe('kept')
  })
})

describe('reset', () => {
  it('deletes only the user review rows and never calls Immich', async () => {
    const { db, immich, service, ids } = setup()
    await service.decide(ids[0]!, 'keep')
    await service.decide(ids[1]!, 'trash')
    insertReview(db, { userId: 'other-user', assetId: ids[2]!, status: 'kept', reviewedAt: new Date().toISOString() })
    setSetting(db, USER, 'scope', defaultScope)
    for (const fn of Object.values(immich)) fn.mockClear()

    expect(await service.reset()).toEqual({ deleted: 2 })
    for (const fn of Object.values(immich)) expect(fn).not.toHaveBeenCalled()
    expect(getReview(db, USER, ids[0]!)).toBeNull()
    expect(getReview(db, 'other-user', ids[2]!)).not.toBeNull()
    expect(getSetting(db, USER, 'scope')).toEqual(defaultScope)
  })
})
