import type { Db } from '../database/connection'
import {
  deleteReviewById,
  getLatestReview,
  getReview,
  insertReview,
  isUniqueViolation,
  resetReviews,
  type ReviewStatus,
} from '../database/repository'
import type { ImmichAsset, ImmichClient } from '../utils/immich'
import { AppError, immichFailure } from './errors'
import { createKeyedLock, type KeyedLock } from './locks'
import { toQueueItem, toReview } from './mapping'

export type Decision = 'keep' | 'trash' | 'favourite'

export type ReviewImmich = Pick<ImmichClient, 'trashAssets' | 'restoreAssets' | 'setFavorite' | 'getAsset'>

const statusFor: Record<Decision, ReviewStatus> = { keep: 'kept', trash: 'trashed', favourite: 'favourited' }

type Logger = { warn: (msg: string, fields?: Record<string, unknown>) => void }

/**
 * Review decisions and undo (docs/DESIGN.md). Rules:
 * - Immich is mutated first; the review row is written only after it succeeds.
 * - A per-asset lock and a global undo lock reject concurrent work with 409;
 *   UNIQUE(user_id, asset_id) is the backstop.
 */
export function createReviewService(options: {
  db: Db
  immich: ReviewImmich
  getUserId: () => Promise<string>
  now?: () => Date
  locks?: KeyedLock
  onChange?: (assetId: string) => void
  logger?: Logger
}) {
  const { db, immich, getUserId } = options
  const now = options.now ?? (() => new Date())
  const locks = options.locks ?? createKeyedLock()
  const onChange = options.onChange ?? (() => {})
  let undoInProgress = false

  async function decide(assetId: string, decision: Decision) {
    if (!locks.tryAcquire(assetId)) {
      throw new AppError(409, 'A decision for this photo is already in progress')
    }
    try {
      const userId = await getUserId()
      if (getReview(db, userId, assetId)) throw new AppError(409, 'This photo has already been reviewed')

      let previousIsFavorite: boolean | null = null
      try {
        if (decision === 'trash') {
          await immich.trashAssets([assetId])
        } else if (decision === 'favourite') {
          const asset = await immich.getAsset(assetId)
          previousIsFavorite = asset.isFavorite
          if (!asset.isFavorite) await immich.setFavorite(assetId, true)
        }
      } catch (error) {
        throw immichFailure(error, decision === 'trash' ? 'Moving the photo to trash' : 'Marking the photo as favourite')
      }

      try {
        const row = insertReview(db, {
          userId,
          assetId,
          status: statusFor[decision],
          previousIsFavorite,
          reviewedAt: now().toISOString(),
        })
        if (!row) throw new AppError(500, 'Review could not be saved')
        onChange(assetId)
        return { review: toReview(row) }
      } catch (error) {
        if (isUniqueViolation(error)) throw new AppError(409, 'This photo has already been reviewed')
        throw error
      }
    } finally {
      locks.release(assetId)
    }
  }

  async function undo() {
    if (undoInProgress) throw new AppError(409, 'An undo is already in progress')
    undoInProgress = true
    try {
      const userId = await getUserId()
      const row = getLatestReview(db, userId)
      if (!row) return { undone: null, asset: null }

      if (!locks.tryAcquire(row.asset_id)) {
        throw new AppError(409, 'A decision for this photo is already in progress')
      }
      try {
        let asset: ImmichAsset | null = null
        try {
          if (row.status === 'trashed') {
            await immich.restoreAssets([row.asset_id])
          } else if (row.status === 'favourited' && row.previous_is_favorite === 0) {
            asset = await immich.setFavorite(row.asset_id, false)
          }
        } catch (error) {
          const failure = immichFailure(error, 'Reverting the last review')
          // Keep the row so the user can retry the undo.
          throw new AppError(failure.statusCode === 404 ? 404 : 502, `${failure.message}; the review was kept`, {
            cause: error,
          })
        }

        deleteReviewById(db, userId, row.id)
        onChange(row.asset_id)

        if (!asset) {
          try {
            asset = await immich.getAsset(row.asset_id)
          } catch (error) {
            // The revert succeeded; a missing asset (e.g. deleted in Immich) just yields asset: null.
            options.logger?.warn('undo: could not load asset after revert', {
              assetId: row.asset_id,
              error: error instanceof Error ? error.message : 'unknown',
            })
          }
        }
        return { undone: toReview(row), asset: asset ? toQueueItem(asset) : null }
      } finally {
        locks.release(row.asset_id)
      }
    } finally {
      undoInProgress = false
    }
  }

  /** Deletes review rows only; never calls Immich mutations. */
  async function reset() {
    const userId = await getUserId()
    return { deleted: resetReviews(db, userId) }
  }

  return { decide, undo, reset }
}

export type ReviewService = ReturnType<typeof createReviewService>
