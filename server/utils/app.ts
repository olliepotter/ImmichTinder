import type { H3Event } from 'h3'
import { openDatabase, type Db } from '../database/connection'
import { getSetting, setSetting } from '../database/repository'
import { createReviewService } from '../services/review'
import { defaultScope, parseStoredScope, type ReviewScope } from '../services/scope'
import { createStatsService } from '../services/stats'
import { createUserIdResolver } from '../services/user'
import { createImmichClient } from './immich'
import { log } from './logger'

const SCOPE_SETTING = 'scope'

let db: Db | null = null
let services: ReturnType<typeof createServices> | null = null

/** The process-wide SQLite connection (opened and migrated on first use). */
export function useDb(event?: H3Event) {
  if (!db) {
    const path = useServerConfig(event).databasePath
    db = openDatabase(path)
    log.info('database ready', { databasePath: path })
  }
  return db
}

function createServices(event?: H3Event) {
  const config = useServerConfig(event)
  const database = useDb(event)
  const immich = createImmichClient({ baseUrl: config.immichUrl, apiKey: config.immichApiKey })
  const getUserId = createUserIdResolver(immich)
  const stats = createStatsService({ db: database, immich })
  const review = createReviewService({
    db: database,
    immich,
    getUserId,
    onChange: (assetId) => stats.noteReviewed(assetId),
    logger: log,
  })
  return { db: database, immich, getUserId, stats, review }
}

/** Process-wide services (DB, Immich client, cached user id, review & stats services). */
export function useAppServices(event?: H3Event) {
  services ??= createServices(event)
  return services
}

export function loadScope(database: Db, userId: string) {
  const stored = getSetting(database, userId, SCOPE_SETTING)
  return stored === undefined ? defaultScope : parseStoredScope(stored)
}

export function saveScope(database: Db, userId: string, scope: ReviewScope) {
  setSetting(database, userId, SCOPE_SETTING, scope)
  return scope
}

/** Closes the DB (used on shutdown). */
export function closeDb() {
  db?.close()
  db = null
  services = null
}
