// POST /api/review/undo → { undone, asset, stats }; 502 if the Immich revert failed (row kept).
export default defineEventHandler(async (event) => {
  const { db, review, stats, getUserId } = useAppServices(event)
  try {
    const result = await review.undo()
    const userId = await getUserId()
    if (result.undone) {
      log.info('review undone', { route: '/api/review/undo', assetId: result.undone.assetId, status: result.undone.status })
    }
    return { ...result, stats: await stats.computeSafe(userId, loadScope(db, userId)) }
  } catch (error) {
    throw toHttpError(event, error)
  }
})
