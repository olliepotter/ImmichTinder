/**
 * Minimal structured logger: one JSON object per line with `level`, `msg` and
 * optional fields (route, assetId, status, ...).
 *
 * Secrets are never logged: field names that look secret are dropped and any
 * registered secret value (API key, session password, app password) is
 * replaced with "[redacted]" in every string.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogFields = Record<string, unknown>

const SECRET_KEY = /pass|secret|token|api.?key|cookie|authorization|session/i
const secrets = new Set<string>()

export function registerLogSecrets(values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.length >= 4) secrets.add(value)
  }
}

function scrub(text: string) {
  let result = text
  for (const secret of secrets) result = result.split(secret).join('[redacted]')
  return result
}

function sanitise(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return scrub(value)
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value
  if (value instanceof Error) return scrub(value.message)
  if (depth < 3 && Array.isArray(value)) return value.map((item) => sanitise(item, depth + 1))
  if (depth < 3 && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      if (!SECRET_KEY.test(key)) out[key] = sanitise(item, depth + 1)
    }
    return out
  }
  return undefined
}

export function formatLogLine(level: LogLevel, msg: string, fields: LogFields = {}) {
  const entry: Record<string, unknown> = { time: new Date().toISOString(), level, msg: scrub(msg) }
  for (const [key, value] of Object.entries(fields)) {
    if (SECRET_KEY.test(key) || key in entry) continue
    const clean = sanitise(value)
    if (clean !== undefined) entry[key] = clean
  }
  return JSON.stringify(entry)
}

function write(level: LogLevel, msg: string, fields?: LogFields) {
  const line = formatLogLine(level, msg, fields)
  if (level === 'error' || level === 'warn') process.stderr.write(`${line}\n`)
  else process.stdout.write(`${line}\n`)
}

export const log = {
  debug: (msg: string, fields?: LogFields) => write('debug', msg, fields),
  info: (msg: string, fields?: LogFields) => write('info', msg, fields),
  warn: (msg: string, fields?: LogFields) => write('warn', msg, fields),
  error: (msg: string, fields?: LogFields) => write('error', msg, fields),
}
