// GET /api/scope → saved ReviewScope (or the default)
export default defineEventHandler(async (event) => {
  const { db, getUserId } = useAppServices(event)
  try {
    return loadScope(db, await getUserId())
  } catch (error) {
    throw toHttpError(event, error)
  }
})
