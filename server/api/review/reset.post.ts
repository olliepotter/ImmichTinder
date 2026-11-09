// POST /api/review/reset { confirm: 'RESET' } → { deleted }. Deletes review rows only; never touches Immich.
export default defineEventHandler(async (event) => {
  await readBodyAs(event, resetBodySchema)
  const { review, stats } = useAppServices(event)
  try {
    const result = await review.reset()
    stats.invalidateAll()
    log.warn('review history reset', { route: '/api/review/reset', deleted: result.deleted })
    return result
  } catch (error) {
    throw toHttpError(event, error)
  }
})
