import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../server/database/connection'
import { migrations } from '../../server/database/migrations'
import {
  countByStatus,
  deleteLatestReview,
  getLatestReview,
  getReviewedIds,
  getSetting,
  insertReview,
  isUniqueViolation,
  resetReviews,
  setSetting,
} from '../../server/database/repository'

const dir = mkdtempSync(join(tmpdir(), 'immich-tinder-test-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

function review(assetId: string, status: 'kept' | 'trashed' | 'favourited', reviewedAt: string, userId = 'u1') {
  return { userId, assetId, status, reviewedAt }
}

describe('migrations', () => {
  it('are idempotent and recorded in schema_migrations', () => {
    const db = openDatabase(':memory:')
    expect(runMigrations(db)).toEqual([])
    expect(runMigrations(db)).toEqual([])
    const rows = db.prepare('SELECT version, name FROM schema_migrations').all()
    expect(rows).toEqual(migrations.map((m) => ({ version: m.version, name: m.name })))
  })

  it('roll back entirely when a migration fails', () => {
    const db = openDatabase(':memory:', [])
    const broken = [
      { version: 1, name: '001_ok', sql: 'CREATE TABLE a (x INTEGER);' },
      { version: 2, name: '002_bad', sql: 'CREATE TABLE b (; nope' },
    ]
    expect(() => runMigrations(db, broken)).toThrow()
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'a'").get()).toBeUndefined()
    expect(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()).toEqual({ n: 0 })
  })

  it('creates the parent directory, enables WAL and persists across reopen', () => {
    const path = join(dir, 'nested', 'deeper', 'test.db')
    const first = openDatabase(path)
    expect(first.pragma('journal_mode', { simple: true })).toBe('wal')
    expect(first.pragma('busy_timeout', { simple: true })).toBe(5000)
    insertReview(first, review('a1', 'kept', '2025-01-01T00:00:00.000Z'))
    first.close()

    const second = openDatabase(path)
    expect(getReviewedIds(second, 'u1')).toEqual(new Set(['a1']))
    expect(second.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()).toEqual({ n: migrations.length })
    second.close()
  })
})

describe('repository', () => {
  it('enforces UNIQUE(user_id, asset_id) and the status CHECK', () => {
    const db = openDatabase(':memory:')
    insertReview(db, review('a1', 'kept', '2025-01-01T00:00:00.000Z'))
    let caught: unknown
    try {
      insertReview(db, review('a1', 'trashed', '2025-01-02T00:00:00.000Z'))
    } catch (error) {
      caught = error
    }
    expect(isUniqueViolation(caught)).toBe(true)
    // Same asset for another user is fine.
    insertReview(db, review('a1', 'kept', '2025-01-01T00:00:00.000Z', 'u2'))
    expect(() => db.prepare("INSERT INTO reviews (user_id, asset_id, status, reviewed_at) VALUES ('u1','x','deleted','t')").run()).toThrow()
  })

  it('orders latest by reviewed_at then id, scoped by user', () => {
    const db = openDatabase(':memory:')
    insertReview(db, review('a1', 'kept', '2025-01-01T00:00:00.000Z'))
    insertReview(db, review('a2', 'kept', '2025-01-03T00:00:00.000Z'))
    insertReview(db, review('a3', 'kept', '2025-01-03T00:00:00.000Z'))
    insertReview(db, review('b1', 'kept', '2026-01-01T00:00:00.000Z', 'u2'))
    expect(getLatestReview(db, 'u1')?.asset_id).toBe('a3')
    expect(deleteLatestReview(db, 'u1')?.asset_id).toBe('a3')
    expect(deleteLatestReview(db, 'u1')?.asset_id).toBe('a2')
    expect(deleteLatestReview(db, 'u1')?.asset_id).toBe('a1')
    expect(deleteLatestReview(db, 'u1')).toBeNull()
    expect(getLatestReview(db, 'u2')?.asset_id).toBe('b1')
  })

  it('counts by status, optionally restricted to a set of asset ids', () => {
    const db = openDatabase(':memory:')
    insertReview(db, review('a1', 'kept', 't1'))
    insertReview(db, review('a2', 'trashed', 't2'))
    insertReview(db, { ...review('a3', 'favourited', 't3'), previousIsFavorite: false })
    insertReview(db, review('a4', 'trashed', 't4', 'u2'))
    expect(countByStatus(db, 'u1')).toEqual({ kept: 1, trashed: 1, favourited: 1 })
    expect(countByStatus(db, 'u1', new Set(['a2', 'a3', 'a4']))).toEqual({ kept: 0, trashed: 1, favourited: 1 })
    expect(countByStatus(db, 'nobody')).toEqual({ kept: 0, trashed: 0, favourited: 0 })
  })

  it('stores JSON settings per user and resets only reviews of one user', () => {
    const db = openDatabase(':memory:')
    expect(getSetting(db, 'u1', 'scope')).toBeUndefined()
    setSetting(db, 'u1', 'scope', { order: 'oldest' })
    setSetting(db, 'u1', 'scope', { order: 'newest' })
    expect(getSetting(db, 'u1', 'scope')).toEqual({ order: 'newest' })
    expect(getSetting(db, 'u2', 'scope')).toBeUndefined()

    insertReview(db, review('a1', 'kept', 't1'))
    insertReview(db, review('a2', 'kept', 't2'))
    insertReview(db, review('a1', 'kept', 't1', 'u2'))
    expect(resetReviews(db, 'u1')).toBe(2)
    expect(getReviewedIds(db, 'u1').size).toBe(0)
    expect(getReviewedIds(db, 'u2').size).toBe(1)
    expect(getSetting(db, 'u1', 'scope')).toEqual({ order: 'newest' })
  })
})
