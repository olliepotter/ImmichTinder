import { reviewScopeSchema } from '../services/scope'

// PUT /api/scope ReviewScope → ReviewScope
export default defineEventHandler(async (event) => {
  const scope = await readBodyAs(event, reviewScopeSchema)
  const { db, getUserId } = useAppServices(event)
  try {
    return saveScope(db, await getUserId(), scope)
  } catch (error) {
    throw toHttpError(event, error)
  }
})
