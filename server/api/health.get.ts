// GET /api/health: 200 while the DB works (even if Immich is down), 503 if the DB is down.
export default defineEventHandler(async (event) => {
  let dbOk = false
  try {
    useDb(event).prepare('SELECT 1').get()
    dbOk = true
  } catch (error) {
    log.error('health: database check failed', { cause: error instanceof Error ? error.message : 'unknown' })
  }

  let immich: 'ok' | 'unreachable'
  let version: string | undefined
  const config = useServerConfig(event)
  try {
    const client = createImmichClient({ baseUrl: config.immichUrl, apiKey: config.immichApiKey, timeoutMs: 3000 })
    const v = await client.getVersion()
    immich = 'ok'
    version = `${v.major}.${v.minor}.${v.patch}`
  } catch {
    immich = 'unreachable'
  }

  if (!dbOk) {
    setResponseStatus(event, 503)
    return { ok: false, db: 'error', immich, ...(version ? { version } : {}) }
  }
  return { ok: true, db: 'ok', immich, ...(version ? { version } : {}) }
})
