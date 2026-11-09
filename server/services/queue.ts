import type { ImmichAsset, ImmichClient } from '../utils/immich'
import { AppError, immichFailure } from './errors'
import { toQueueItem, type QueueItem } from './mapping'
import { scopeToFilters, type ReviewScope } from './scope'

export type QueueImmich = Pick<ImmichClient, 'searchRandom' | 'searchMetadata'>

export type QueueRequest = {
  scope: ReviewScope
  size: number
  /** Asset ids to leave out: reviewed (from the DB) plus those the client holds or skipped. */
  skip: ReadonlySet<string>
  cursor: string | null
}

export const RANDOM_BATCH_SIZE = 50
export const RANDOM_MAX_ATTEMPTS = 5
export const ORDERED_PAGE_SIZE = 100
export const ORDERED_MAX_PAGES = 20

/** Opaque cursor for ordered modes: base64url JSON `{ v: 1, page }`. */
export function encodeCursor(page: number) {
  return Buffer.from(JSON.stringify({ v: 1, page })).toString('base64url')
}

export function decodeCursor(cursor: string | null) {
  if (!cursor) return 1
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (typeof parsed === 'object' && parsed !== null && 'page' in parsed) {
      const page = parsed.page
      if (typeof page === 'number' && Number.isInteger(page) && page >= 1 && page <= 1_000_000) return page
    }
  } catch {
    // fall through
  }
  throw new AppError(400, 'Invalid queue cursor')
}

function isCandidate(asset: ImmichAsset, skip: ReadonlySet<string>, seen: ReadonlySet<string>) {
  return asset.type === 'IMAGE' && !asset.isTrashed && !skip.has(asset.id) && !seen.has(asset.id)
}

/**
 * Builds the next queue batch. Never returns reviewed or skipped assets.
 * - random: repeated search/random batches, bounded by RANDOM_MAX_ATTEMPTS.
 * - oldest/newest: pages through search/metadata (withDeleted, so trashing
 *   photos does not shift page offsets); the cursor points at the page to resume.
 */
export async function buildQueue(immich: QueueImmich, request: QueueRequest) {
  try {
    return request.scope.order === 'random' ? await randomQueue(immich, request) : await orderedQueue(immich, request)
  } catch (error) {
    if (error instanceof AppError) throw error
    throw immichFailure(error, 'Loading photos')
  }
}

async function randomQueue(immich: QueueImmich, request: QueueRequest) {
  const filters = scopeToFilters(request.scope)
  const items: QueueItem[] = []
  const seen = new Set<string>()
  let exhausted = false

  for (let attempt = 0; attempt < RANDOM_MAX_ATTEMPTS && items.length < request.size; attempt++) {
    const batch = await immich.searchRandom({ ...filters, size: RANDOM_BATCH_SIZE })
    let leftOver = false
    for (const asset of batch) {
      if (!isCandidate(asset, request.skip, seen)) continue
      if (items.length >= request.size) {
        leftOver = true
        break
      }
      seen.add(asset.id)
      items.push(toQueueItem(asset))
    }
    // A short batch means Immich returned every asset in scope. The scope is only
    // exhausted if every remaining candidate fitted into this response.
    if (batch.length < RANDOM_BATCH_SIZE) {
      exhausted = !leftOver
      break
    }
  }
  // Retries used up without finding anything: treat the scope as exhausted.
  if (items.length === 0) exhausted = true
  return { items, nextCursor: null, exhausted }
}

async function orderedQueue(immich: QueueImmich, request: QueueRequest) {
  const filters = scopeToFilters(request.scope)
  const order = request.scope.order === 'oldest' ? 'asc' : 'desc'
  const items: QueueItem[] = []
  const seen = new Set<string>()
  let page = decodeCursor(request.cursor)

  for (let fetched = 0; fetched < ORDERED_MAX_PAGES; fetched++) {
    const result = await immich.searchMetadata({ ...filters, page, size: ORDERED_PAGE_SIZE, order, withDeleted: true })
    let index = 0
    for (; index < result.items.length && items.length < request.size; index++) {
      const asset = result.items[index]
      if (!asset || !isCandidate(asset, request.skip, seen)) continue
      seen.add(asset.id)
      items.push(toQueueItem(asset))
    }
    const consumedPage = index >= result.items.length
    const next = result.nextPage ? Number.parseInt(result.nextPage, 10) : Number.NaN
    const hasNext = Number.isFinite(next) && next > page

    if (!consumedPage) {
      // Stopped mid-page: resume on this page (held items are excluded by the client).
      return { items, nextCursor: encodeCursor(page), exhausted: false }
    }
    if (!hasNext) return { items, nextCursor: null, exhausted: true }
    page = next
    if (items.length >= request.size) return { items, nextCursor: encodeCursor(page), exhausted: false }
  }
  return { items, nextCursor: encodeCursor(page), exhausted: false }
}
