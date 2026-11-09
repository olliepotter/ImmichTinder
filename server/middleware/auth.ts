// Protects /api/** (docs/DESIGN.md "HTTP API"). Pages are guarded client-side.
// - /api/health is always public.
// - In production with an unsafe security config, every other /api route returns 500.
// - /api/auth/* is public; everything else needs an authenticated session.
export default defineEventHandler(async (event) => {
  const kind = classifyApiPath(event.path)
  if (kind === 'not-api' || kind === 'health') return

  const { check } = useSecurityConfig(event)
  if (check.fatal) {
    throw createError({
      statusCode: 500,
      statusMessage: `Server misconfigured: ${check.problems.join('; ')}`,
    })
  }
  if (kind === 'auth') return

  if (!(await isAuthenticated(event))) {
    throw createError({ statusCode: 401, statusMessage: 'Not logged in' })
  }
})
