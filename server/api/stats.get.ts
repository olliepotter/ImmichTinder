import { scopeFromQuery } from '../services/scope'

// GET /api/stats?albumId&order&takenAfter&takenBefore → Stats (missing fields: saved scope)
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { db, stats, getUserId } = useAppServices(event)
  try {
    const userId = await getUserId()
    const scope = unwrapOr400(scopeFromQuery(query, loadScope(db, userId)))
    return await stats.compute(userId, scope)
  } catch (error) {
    throw toHttpError(event, error)
  }
})
