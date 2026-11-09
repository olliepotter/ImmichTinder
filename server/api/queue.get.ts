import { getReviewedIds } from '../database/repository'
import { buildQueue } from '../services/queue'
import { scopeFromQuery } from '../services/scope'

// GET /api/queue?albumId&order&takenAfter&takenBefore&size&exclude&page
// → { items, nextCursor, exhausted }. Missing scope fields fall back to the saved scope.
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const params = parseOr400(queueQuerySchema, query)
  const { db, immich, getUserId } = useAppServices(event)
  try {
    const userId = await getUserId()
    const scope = unwrapOr400(scopeFromQuery(query, loadScope(db, userId)))
    const skip = getReviewedIds(db, userId)
    for (const id of params.exclude) skip.add(id)
    return await buildQueue(immich, { scope, size: params.size, skip, cursor: params.page ?? null })
  } catch (error) {
    throw toHttpError(event, error)
  }
})
