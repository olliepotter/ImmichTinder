import { z } from 'zod'
import type { Db } from './connection'

/**
 * Repository layer: pure functions over a better-sqlite3 handle. Every query is
 * scoped by the Immich user id.
 */

export type ReviewStatus = 'kept' | 'trashed' | 'favourited'

const reviewRowSchema = z.object({
  id: z.number(),
  user_id: z.string(),
  asset_id: z.string(),
  status: z.enum(['kept', 'trashed', 'favourited']),
  previous_is_favorite: z.number().nullable(),
  reviewed_at: z.string(),
})

export type ReviewRow = z.output<typeof reviewRowSchema>

const countRowSchema = z.object({ status: z.enum(['kept', 'trashed', 'favourited']), n: z.number() })
const assetIdRowSchema = z.object({ asset_id: z.string() })
const settingRowSchema = z.object({ value: z.string() })

export type NewReview = {
  userId: string
  assetId: string
  status: ReviewStatus
  previousIsFavorite?: boolean | null
  reviewedAt: string
}

export function insertReview(db: Db, review: NewReview) {
  const previous = review.previousIsFavorite === undefined || review.previousIsFavorite === null
    ? null
    : review.previousIsFavorite ? 1 : 0
  const result = db
    .prepare(
      `INSERT INTO reviews (user_id, asset_id, status, previous_is_favorite, reviewed_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(review.userId, review.assetId, review.status, previous, review.reviewedAt)
  return getReviewById(db, Number(result.lastInsertRowid))
}

export function getReviewById(db: Db, id: number) {
  const row: unknown = db.prepare('SELECT * FROM reviews WHERE id = ?').get(id)
  return row === undefined ? null : reviewRowSchema.parse(row)
}

export function getReview(db: Db, userId: string, assetId: string) {
  const row: unknown = db.prepare('SELECT * FROM reviews WHERE user_id = ? AND asset_id = ?').get(userId, assetId)
  return row === undefined ? null : reviewRowSchema.parse(row)
}

/** Most recent review of the user (by reviewed_at, then id). */
export function getLatestReview(db: Db, userId: string) {
  const row: unknown = db
    .prepare('SELECT * FROM reviews WHERE user_id = ? ORDER BY reviewed_at DESC, id DESC LIMIT 1')
    .get(userId)
  return row === undefined ? null : reviewRowSchema.parse(row)
}

export function deleteReviewById(db: Db, userId: string, id: number) {
  return db.prepare('DELETE FROM reviews WHERE user_id = ? AND id = ?').run(userId, id).changes > 0
}

/** Deletes and returns the user's most recent review, or null when there is none. */
export function deleteLatestReview(db: Db, userId: string) {
  const remove = db.transaction(() => {
    const latest = getLatestReview(db, userId)
    if (latest) deleteReviewById(db, userId, latest.id)
    return latest
  })
  return remove.immediate()
}

export function getReviewedIds(db: Db, userId: string) {
  const rows: unknown[] = db.prepare('SELECT asset_id FROM reviews WHERE user_id = ?').all(userId)
  return new Set(rows.map((row) => assetIdRowSchema.parse(row).asset_id))
}

/**
 * Counts review rows per status. With `assetIds`, only rows for those assets
 * are counted (album/date scopes).
 */
export function countByStatus(db: Db, userId: string, assetIds?: ReadonlySet<string>) {
  const counts = { kept: 0, trashed: 0, favourited: 0 }
  if (assetIds) {
    const rows: unknown[] = db.prepare('SELECT asset_id, status FROM reviews WHERE user_id = ?').all(userId)
    for (const raw of rows) {
      const row = z.object({ asset_id: z.string(), status: countRowSchema.shape.status }).parse(raw)
      if (assetIds.has(row.asset_id)) counts[row.status] += 1
    }
    return counts
  }
  const rows: unknown[] = db
    .prepare('SELECT status, COUNT(*) AS n FROM reviews WHERE user_id = ? GROUP BY status')
    .all(userId)
  for (const raw of rows) {
    const row = countRowSchema.parse(raw)
    counts[row.status] = row.n
  }
  return counts
}

/** Deletes every review row of the user. Returns the number of rows deleted. */
export function resetReviews(db: Db, userId: string) {
  return db.prepare('DELETE FROM reviews WHERE user_id = ?').run(userId).changes
}

/** Reads a JSON setting; returns undefined when unset or not valid JSON. */
export function getSetting(db: Db, userId: string, key: string) {
  const row: unknown = db.prepare('SELECT value FROM settings WHERE user_id = ? AND key = ?').get(userId, key)
  if (row === undefined) return undefined
  try {
    const parsed: unknown = JSON.parse(settingRowSchema.parse(row).value)
    return parsed
  } catch {
    return undefined
  }
}

export function setSetting(db: Db, userId: string, key: string, value: unknown) {
  db.prepare(
    `INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?)
     ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value`,
  ).run(userId, key, JSON.stringify(value))
}

export function isUniqueViolation(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY')
  )
}
