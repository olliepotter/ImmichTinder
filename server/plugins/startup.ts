// Startup checks and request logging. Never logs secrets (see server/utils/logger.ts).
export default defineNitroPlugin((nitroApp) => {
  const config = useServerConfig()
  registerLogSecrets([config.immichApiKey, config.appPassword, config.sessionPassword])

  const check = checkSecurityConfig(config, !import.meta.dev)
  if (check.fatal) {
    log.error('refusing to serve the API: insecure configuration', { problems: check.problems })
  } else {
    if (check.openAccess) {
      log.warn('!!! NUXT_APP_PASSWORD is not set: the API is OPEN without login (development only) !!!')
    }
    for (const problem of check.problems) log.warn(problem)
    try {
      useDb()
    } catch (error) {
      log.error('database failed to open', { cause: error instanceof Error ? error.message : 'unknown' })
    }
  }
  if (!config.immichUrl || !config.immichApiKey) log.warn('NUXT_IMMICH_URL or NUXT_IMMICH_API_KEY is not set')

  nitroApp.hooks.hook('afterResponse', (event) => {
    const route = event.path.split('?')[0] ?? ''
    if (!route.startsWith('/api/')) return
    const status = event.node.res.statusCode
    log[status >= 500 ? 'error' : 'info']('request', { method: event.method, route, status })
  })

  nitroApp.hooks.hook('close', () => closeDb())
})
