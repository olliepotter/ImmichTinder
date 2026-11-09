// GET /api/auth/session → { authenticated }
export default defineEventHandler(async (event) => {
  return { authenticated: await isAuthenticated(event) }
})
