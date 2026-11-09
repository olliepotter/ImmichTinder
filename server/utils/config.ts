import type { H3Event } from 'h3'

/**
 * Server configuration, resolved at runtime.
 *
 * `useRuntimeConfig()` already honours the `NUXT_*` env vars. The legacy env
 * names (IMMICH_URL, IMMICH_API_KEY, IMMICH_TOKEN, APP_PASSWORD, SESSION_SECRET,
 * DATABASE_PATH) are read here as fallbacks because `nuxt.config.ts` is only
 * evaluated at build time, not when the built server starts.
 */
export function useServerConfig(event?: H3Event) {
  return resolveServerConfig(useRuntimeConfig(event), process.env)
}

export type ServerConfig = ReturnType<typeof resolveServerConfig>

// Values are typed `unknown` because Nuxt parses NUXT_* env values with destr,
// so an all-digit password can arrive as a number and "false" as a boolean.
type RuntimeConfigInput = {
  immichUrl?: unknown
  immichApiKey?: unknown
  appPassword?: unknown
  sessionPassword?: unknown
  databasePath?: unknown
  cookieSecure?: unknown
  public?: { immichWebUrl?: unknown }
}

export function resolveServerConfig(config: RuntimeConfigInput, env: Record<string, string | undefined>) {
  return {
    immichUrl: stripTrailingSlash(str(config.immichUrl) || env.IMMICH_URL || ''),
    immichApiKey: str(config.immichApiKey) || env.IMMICH_API_KEY || env.IMMICH_TOKEN || '',
    appPassword: str(config.appPassword) || env.APP_PASSWORD || '',
    sessionPassword: str(config.sessionPassword) || env.SESSION_SECRET || '',
    // databasePath has a non-empty default, so only fall back when the NUXT_ name is unset.
    databasePath: env.NUXT_DATABASE_PATH
      ? str(config.databasePath)
      : env.DATABASE_PATH || str(config.databasePath) || './data/immich-tinder.db',
    cookieSecure: bool(config.cookieSecure, true),
    immichWebUrl: stripTrailingSlash(str(config.public?.immichWebUrl)),
  }
}

function str(value: unknown) {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function bool(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value
  if (value === 'true' || value === '1' || value === 1) return true
  if (value === 'false' || value === '0' || value === 0) return false
  return fallback
}

function stripTrailingSlash(url: string) {
  return url.replace(/\/+$/, '')
}
