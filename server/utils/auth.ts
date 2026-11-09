import { createHash, timingSafeEqual } from 'node:crypto'

// Pure auth helpers (no h3 imports) so they can be unit tested directly.

export const MIN_SESSION_PASSWORD_LENGTH = 32

/**
 * Classifies a request path for the auth middleware. Only /api/** is protected;
 * /api/health and /api/auth/* are public. The path is normalised (query string
 * dropped, dot segments resolved, duplicate slashes collapsed, lower-cased) so
 * tricks like `/api/auth/../review` or `//api/review` cannot slip through.
 */
export function classifyApiPath(rawPath: string) {
  let pathname: string
  try {
    pathname = new URL(rawPath.replace(/\/{2,}/g, '/'), 'http://localhost').pathname
  } catch {
    return 'protected'
  }
  const path = decodeURIComponentSafe(pathname).replace(/\/{2,}/g, '/').toLowerCase().replace(/\/+$/, '') || '/'
  if (path !== '/api' && !path.startsWith('/api/')) return 'not-api'
  if (path === '/api/health') return 'health'
  if (path.startsWith('/api/auth/') && !path.includes('..')) return 'auth'
  return 'protected'
}

function decodeURIComponentSafe(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** Constant-time comparison of two passwords (hashed first so lengths match). */
export function passwordsMatch(given: string, expected: string) {
  if (!expected) return false
  const a = createHash('sha256').update(given, 'utf8').digest()
  const b = createHash('sha256').update(expected, 'utf8').digest()
  return timingSafeEqual(a, b)
}

/**
 * Validates the security configuration. In production a missing password or a
 * short session password is fatal (the API refuses to serve); in development
 * it only produces warnings.
 */
export function checkSecurityConfig(config: { appPassword: string; sessionPassword: string }, isProduction: boolean) {
  const problems: string[] = []
  if (!config.appPassword) problems.push('NUXT_APP_PASSWORD is not set')
  if (!config.sessionPassword) problems.push('NUXT_SESSION_PASSWORD is not set')
  else if (config.sessionPassword.length < MIN_SESSION_PASSWORD_LENGTH) {
    problems.push(`NUXT_SESSION_PASSWORD must be at least ${MIN_SESSION_PASSWORD_LENGTH} characters`)
  }
  return {
    fatal: isProduction && problems.length > 0,
    problems,
    /** Dev only: no app password configured, so access is open. */
    openAccess: !isProduction && !config.appPassword,
  }
}

/** Fixed-window rate limiter keyed by e.g. client IP. */
export function createRateLimiter(options: { limit: number; windowMs: number; now?: () => number }) {
  const now = options.now ?? Date.now
  const hits = new Map<string, { count: number; resetAt: number }>()

  return {
    /** Records one attempt; returns whether it is allowed and when the window resets. */
    hit(key: string) {
      const t = now()
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k)
      }
      let entry = hits.get(key)
      if (!entry || entry.resetAt <= t) {
        entry = { count: 0, resetAt: t + options.windowMs }
        hits.set(key, entry)
      }
      entry.count += 1
      return {
        allowed: entry.count <= options.limit,
        retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - t) / 1000)),
      }
    },
    reset(key: string) {
      hits.delete(key)
    },
  }
}
