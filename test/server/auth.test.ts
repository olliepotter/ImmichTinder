import { describe, expect, it } from 'vitest'
import { checkSecurityConfig, classifyApiPath, createRateLimiter, passwordsMatch } from '../../server/utils/auth'

describe('classifyApiPath', () => {
  it.each([
    ['/api/health', 'health'],
    ['/api/health/', 'health'],
    ['/api/health?x=1', 'health'],
    ['/api/auth/login', 'auth'],
    ['/api/auth/session', 'auth'],
    ['/api/auth/logout?next=/', 'auth'],
    ['/api/review', 'protected'],
    ['/api/queue?size=10', 'protected'],
    ['/api/assets/abc/image', 'protected'],
    ['/api', 'protected'],
    ['/api/', 'protected'],
    ['/api/healthz', 'protected'],
    ['/api/authx', 'protected'],
    ['/api/auth', 'protected'],
    ['/api/auth/../review', 'protected'],
    ['/api/auth/%2e%2e/review', 'protected'],
    ['/api/auth%2F..%2Freview', 'protected'],
    ['//api/review', 'protected'],
    ['/API/Review', 'protected'],
    ['/api/health/../review', 'protected'],
    ['/', 'not-api'],
    ['/login', 'not-api'],
    ['/_nuxt/entry.js', 'not-api'],
    ['/apiary', 'not-api'],
  ])('%s → %s', (path, kind) => {
    expect(classifyApiPath(path)).toBe(kind)
  })
})

describe('passwordsMatch', () => {
  it('compares in constant time via hashes', () => {
    expect(passwordsMatch('correct horse', 'correct horse')).toBe(true)
    expect(passwordsMatch('correct hors', 'correct horse')).toBe(false)
    expect(passwordsMatch('', 'x')).toBe(false)
    expect(passwordsMatch('anything', '')).toBe(false)
  })
})

describe('checkSecurityConfig', () => {
  const strong = { appPassword: 'pw', sessionPassword: 'x'.repeat(32) }

  it('is fatal in production when a secret is missing or the session password is short', () => {
    expect(checkSecurityConfig(strong, true)).toEqual({ fatal: false, problems: [], openAccess: false })
    expect(checkSecurityConfig({ ...strong, appPassword: '' }, true).fatal).toBe(true)
    expect(checkSecurityConfig({ ...strong, sessionPassword: '' }, true).fatal).toBe(true)
    expect(checkSecurityConfig({ ...strong, sessionPassword: 'x'.repeat(31) }, true).fatal).toBe(true)
  })

  it('only warns in development, with open access when no app password is set', () => {
    const result = checkSecurityConfig({ appPassword: '', sessionPassword: '' }, false)
    expect(result.fatal).toBe(false)
    expect(result.openAccess).toBe(true)
    expect(result.problems.length).toBe(2)
    expect(checkSecurityConfig(strong, false).openAccess).toBe(false)
  })
})

describe('rate limiter', () => {
  it('allows 5 attempts per minute per key, then blocks until the window resets', () => {
    let t = 0
    const limiter = createRateLimiter({ limit: 5, windowMs: 60_000, now: () => t })
    for (let i = 0; i < 5; i++) expect(limiter.hit('1.2.3.4').allowed).toBe(true)
    const blocked = limiter.hit('1.2.3.4')
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSeconds).toBe(60)
    expect(limiter.hit('5.6.7.8').allowed).toBe(true)

    t = 59_999
    expect(limiter.hit('1.2.3.4').allowed).toBe(false)
    t = 60_000
    expect(limiter.hit('1.2.3.4').allowed).toBe(true)
  })
})
