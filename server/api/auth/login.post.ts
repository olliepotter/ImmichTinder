import { z } from 'zod'

const bodySchema = z.object({ password: z.string().min(1).max(1024) })
const limiter = createRateLimiter({ limit: 5, windowMs: 60_000 })

// POST /api/auth/login { password } → { ok: true } and a session cookie.
export default defineEventHandler(async (event) => {
  const ip = getRequestIP(event) ?? 'unknown'
  const attempt = limiter.hit(ip)
  if (!attempt.allowed) {
    setResponseHeader(event, 'Retry-After', attempt.retryAfterSeconds)
    throw createError({ statusCode: 429, statusMessage: 'Too many login attempts, try again in a minute' })
  }

  const { password } = await readBodyAs(event, bodySchema)
  const { config, check } = useSecurityConfig(event)
  if (!check.openAccess && !passwordsMatch(password, config.appPassword)) {
    log.warn('login failed', { route: '/api/auth/login', status: 401, ip })
    throw createError({ statusCode: 401, statusMessage: 'Wrong password' })
  }

  const session = await useAppSession(event)
  await session.update({ authenticated: true, loginAt: new Date().toISOString() })
  return { ok: true }
})
