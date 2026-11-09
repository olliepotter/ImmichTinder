import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { migrations as defaultMigrations, type Migration } from './migrations'

export type Db = Database.Database

/**
 * Opens (and creates) the SQLite database, enables WAL and a busy timeout, and
 * applies pending migrations. Pass ':memory:' for tests.
 */
export function openDatabase(path: string, migrations: Migration[] = defaultMigrations) {
  const inMemory = path === ':memory:'
  if (!inMemory) mkdirSync(dirname(resolve(path)), { recursive: true })

  const db = new Database(inMemory ? path : resolve(path))
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  db.pragma('foreign_keys = ON')
  runMigrations(db, migrations)
  return db
}

/** Applies every migration not yet recorded in schema_migrations, all in one transaction. */
export function runMigrations(db: Db, migrations: Migration[] = defaultMigrations) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`)

  const appliedRows: unknown[] = db.prepare('SELECT version FROM schema_migrations').all()
  const applied = new Set(appliedRows.map((row) => readNumber(row, 'version')))
  const pending = [...migrations].sort((a, b) => a.version - b.version).filter((m) => !applied.has(m.version))
  if (pending.length === 0) return []

  const record = db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
  const apply = db.transaction(() => {
    for (const migration of pending) {
      db.exec(migration.sql)
      record.run(migration.version, migration.name, new Date().toISOString())
    }
  })
  apply.immediate()
  return pending.map((m) => m.name)
}

function readNumber(row: unknown, key: string) {
  if (typeof row === 'object' && row !== null && key in row) {
    const value: unknown = Reflect.get(row, key)
    if (typeof value === 'number') return value
  }
  return Number.NaN
}
