import { randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import { checkSecurityConfig } from './auth'

type SessionData = { authenticated?: boolean; loginAt?: string }

const SESSION_NAME = 'immich-tinder-session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

// Dev only: without NUXT_SESSION_PASSWORD, seal sessions with a per-process
// random key (sessions do not survive a restart).
let ephemeralPassword: string | null = null

export function useSecurityConfig(event?: H3Event) {
  const config = useServerConfig(event)
  return { config, check: checkSecurityConfig(config, !import.meta.dev) }
}

function sessionPassword(event: H3Event) {
  const { config } = useSecurityConfig(event)
  if (config.sessionPassword.length >= 32) return config.sessionPassword
  ephemeralPassword ??= randomBytes(32).toString('hex')
  return ephemeralPassword
}

export function useAppSession(event: H3Event) {
  const { config } = useSecurityConfig(event)
  return useSession<SessionData>(event, {
    name: SESSION_NAME,
    password: sessionPassword(event),
    maxAge: SESSION_MAX_AGE_SECONDS,
    sessionHeader: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
      path: '/',
    },
  })
}

/** True when the request carries an authenticated session (or access is open in dev). */
export async function isAuthenticated(event: H3Event) {
  const { check } = useSecurityConfig(event)
  if (check.openAccess) return true
  const session = await useAppSession(event)
  return session.data.authenticated === true
}
