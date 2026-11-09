import { countByStatus } from '../database/repository'
import type { Db } from '../database/connection'
import type { ImmichClient } from '../utils/immich'
import { immichFailure } from './errors'
import { isWholeLibrary, scopeKey, scopeToFilters, type ReviewScope } from './scope'

export type StatsImmich = Pick<ImmichClient, 'searchStatistics' | 'searchMetadata'>

type CacheEntry = { ids: Set<string>; expiresAt: number }

/** reviewed / total * 100 rounded to 1 decimal; 0 when total is 0. */
export function percentOf(reviewed: number, total: number) {
  if (total <= 0) return 0
  return Math.round((reviewed / total) * 1000) / 10
}

export function buildStats(counts: { kept: number; trashed: number; favourited: number }, immichTotal: number) {
  const reviewed = counts.kept + counts.trashed + counts.favourited
  // Immich's count excludes trashed assets, so only kept/favourited rows are in it.
  const remaining = Math.max(0, immichTotal - counts.kept - counts.favourited)
  const total = remaining + reviewed
  return {
    total,
    reviewed,
    kept: counts.kept,
    trashed: counts.trashed,
    favourited: counts.favourited,
    remaining,
    percent: percentOf(reviewed, total),
  }
}

export type Stats = ReturnType<typeof buildStats>

/**
 * Stats per docs/DESIGN.md ("Stats computation").
 *
 * Album/date scopes intersect review rows with the scope's asset ids, fetched via
 * search/metadata with `withDeleted: true` (so trashed assets stay members) and
 * cached for `ttlMs`. A review of an asset that is not in a cached set drops that
 * entry, because the set may be stale.
 */
export function createStatsService(options: {
  db: Db
  immich: StatsImmich
  ttlMs?: number
  now?: () => number
  pageSize?: number
  maxPages?: number
}) {
  const { db, immich } = options
  const ttlMs = options.ttlMs ?? 5 * 60_000
  const now = options.now ?? Date.now
  const pageSize = options.pageSize ?? 1000
  const maxPages = options.maxPages ?? 500
  const cache = new Map<string, CacheEntry>()
  const inflight = new Map<string, Promise<Set<string>>>()
  const lastImmichTotal = new Map<string, number>()

  async function fetchScopeIds(scope: ReviewScope) {
    const ids = new Set<string>()
    const filters = scopeToFilters(scope)
    let page = 1
    for (let i = 0; i < maxPages; i++) {
      const result = await immich.searchMetadata({ ...filters, page, size: pageSize, order: 'asc', withDeleted: true })
      for (const asset of result.items) ids.add(asset.id)
      const next = result.nextPage ? Number.parseInt(result.nextPage, 10) : Number.NaN
      if (!Number.isFinite(next) || next <= page) break
      page = next
    }
    return ids
  }

  function scopeIds(scope: ReviewScope) {
    const key = scopeKey(scope)
    const cached = cache.get(key)
    if (cached && cached.expiresAt > now()) return Promise.resolve(cached.ids)
    const running = inflight.get(key)
    if (running) return running
    const promise = fetchScopeIds(scope)
      .then((ids) => {
        cache.set(key, { ids, expiresAt: now() + ttlMs })
        return ids
      })
      .finally(() => inflight.delete(key))
    inflight.set(key, promise)
    return promise
  }

  async function compute(userId: string, scope: ReviewScope) {
    const key = scopeKey(scope)
    try {
      const whole = isWholeLibrary(scope)
      const [statistics, ids] = await Promise.all([
        immich.searchStatistics(scopeToFilters(scope)),
        whole ? Promise.resolve(undefined) : scopeIds(scope),
      ])
      lastImmichTotal.set(key, statistics.total)
      return buildStats(countByStatus(db, userId, ids), statistics.total)
    } catch (error) {
      throw immichFailure(error, 'Loading stats')
    }
  }

  /**
   * Like `compute`, but never throws: after a recorded review the response must
   * succeed even if Immich is briefly unreachable. Falls back to the last known
   * Immich total and cached scope ids.
   */
  async function computeSafe(userId: string, scope: ReviewScope) {
    try {
      return await compute(userId, scope)
    } catch {
      const key = scopeKey(scope)
      const cached = cache.get(key)
      const counts = countByStatus(db, userId, isWholeLibrary(scope) ? undefined : cached?.ids)
      const fallbackTotal = lastImmichTotal.get(key) ?? counts.kept + counts.favourited
      return buildStats(counts, fallbackTotal)
    }
  }

  return {
    compute,
    computeSafe,
    /** Call after a review or undo of `assetId`. */
    noteReviewed(assetId: string) {
      for (const [key, entry] of cache) {
        if (!entry.ids.has(assetId)) cache.delete(key)
      }
    },
    invalidateAll() {
      cache.clear()
    },
    cacheSize: () => cache.size,
  }
}

export type StatsService = ReturnType<typeof createStatsService>
