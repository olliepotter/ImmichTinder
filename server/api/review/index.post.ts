// POST /api/review { assetId, decision } → { review, stats }
// 409 if already reviewed / in flight; 502 if Immich failed (nothing recorded).
export default defineEventHandler(async (event) => {
  const body = await readBodyAs(event, reviewBodySchema)
  const { db, review, stats, getUserId } = useAppServices(event)
  try {
    const result = await review.decide(body.assetId, body.decision)
    const userId = await getUserId()
    log.info('review recorded', { route: '/api/review', assetId: body.assetId, status: result.review.status })
    return { review: result.review, stats: await stats.computeSafe(userId, loadScope(db, userId)) }
  } catch (error) {
    throw toHttpError(event, error, { assetId: body.assetId })
  }
})
