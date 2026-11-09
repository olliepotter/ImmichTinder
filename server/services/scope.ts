import { z } from 'zod'
import type { ImmichSearchFilters } from '../utils/immich'

export const uuidSchema = z.uuid({ message: 'Invalid id (expected a UUID)' })

const isoDateOrDateTime = z.union([z.iso.date(), z.iso.datetime({ offset: true })], {
  message: 'Invalid date (expected ISO 8601)',
})

export const orderSchema = z.enum(['random', 'oldest', 'newest'])

export const reviewScopeSchema = z
  .object({
    albumId: uuidSchema.nullable(),
    order: orderSchema,
    takenAfter: isoDateOrDateTime.nullable(),
    takenBefore: isoDateOrDateTime.nullable(),
  })
  .strict()
  .refine((scope) => !scope.takenAfter || !scope.takenBefore || toIso(scope.takenAfter) < toIso(scope.takenBefore), {
    message: 'takenAfter must be before takenBefore',
  })

export type ReviewScope = z.output<typeof reviewScopeSchema>

export const defaultScope: ReviewScope = { albumId: null, order: 'random', takenAfter: null, takenBefore: null }

/** Converts an ISO date (YYYY-MM-DD, taken as UTC midnight) or date-time to a full ISO timestamp. */
export function toIso(value: string) {
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value).toISOString()
}

export function scopeToFilters(scope: ReviewScope) {
  const filters: ImmichSearchFilters = {}
  if (scope.albumId) filters.albumIds = [scope.albumId]
  if (scope.takenAfter) filters.takenAfter = toIso(scope.takenAfter)
  if (scope.takenBefore) filters.takenBefore = toIso(scope.takenBefore)
  return filters
}

/** Whole library with no date filter: stats can use plain DB counts. */
export function isWholeLibrary(scope: ReviewScope) {
  return !scope.albumId && !scope.takenAfter && !scope.takenBefore
}

/** Stable key of the asset set a scope selects (order does not change membership). */
export function scopeKey(scope: ReviewScope) {
  return JSON.stringify([scope.albumId, scope.takenAfter && toIso(scope.takenAfter), scope.takenBefore && toIso(scope.takenBefore)])
}

/** Reads a stored scope, falling back to the default when it is missing or invalid. */
export function parseStoredScope(value: unknown) {
  const parsed = reviewScopeSchema.safeParse(value)
  return parsed.success ? parsed.data : defaultScope
}

const scopeKeys: (keyof ReviewScope)[] = ['albumId', 'order', 'takenAfter', 'takenBefore']

/**
 * Reads ReviewScope fields from a query string. Fields that are absent keep the
 * value from `fallback` (the saved scope); an empty value (or "null") means null.
 */
export function scopeFromQuery(query: Record<string, unknown>, fallback: ReviewScope) {
  const merged: Record<string, unknown> = { ...fallback }
  for (const key of scopeKeys) {
    const value = query[key]
    const raw: unknown = Array.isArray(value) ? value[0] : value
    if (raw === undefined) continue
    merged[key] = raw === '' || raw === 'null' ? null : raw
  }
  return reviewScopeSchema.safeParse(merged)
}
