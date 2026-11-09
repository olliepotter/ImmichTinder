import { describe, expect, it } from 'vitest'
import { defaultScope, reviewScopeSchema, scopeFromQuery, uuidSchema, type ReviewScope } from '../../server/services/scope'
import { cameraName } from '../../server/services/mapping'
import { imageParamsSchema, imageQuerySchema, queueQuerySchema, resetBodySchema, reviewBodySchema } from '../../server/utils/requests'
import { formatLogLine, registerLogSecrets } from '../../server/utils/logger'

const ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6'

describe('UUID validation', () => {
  it.each([ID, '00000000-0000-4000-8000-000000000001'])('accepts %s', (id) => {
    expect(uuidSchema.safeParse(id).success).toBe(true)
  })
  it.each(['', 'abc', '../users/me', `${ID}x`, `${ID}/../x`, '3fa85f64571745622b3fc2c963f66afa6'])('rejects %s', (id) => {
    expect(uuidSchema.safeParse(id).success).toBe(false)
    expect(imageParamsSchema.safeParse({ id }).success).toBe(false)
  })
})

describe('request schemas', () => {
  it('review body', () => {
    expect(reviewBodySchema.parse({ assetId: ID, decision: 'trash' })).toEqual({ assetId: ID, decision: 'trash' })
    expect(reviewBodySchema.safeParse({ assetId: ID, decision: 'delete' }).success).toBe(false)
    expect(reviewBodySchema.safeParse({ assetId: 'nope', decision: 'keep' }).success).toBe(false)
    expect(reviewBodySchema.safeParse({ assetId: ID, decision: 'keep', force: true }).success).toBe(false)
  })

  it('reset requires confirm: RESET', () => {
    expect(resetBodySchema.safeParse({ confirm: 'RESET' }).success).toBe(true)
    expect(resetBodySchema.safeParse({ confirm: 'reset' }).success).toBe(false)
    expect(resetBodySchema.safeParse({}).success).toBe(false)
  })

  it('queue query: size bounds, exclude ids, cursor length', () => {
    expect(queueQuerySchema.parse({})).toEqual({ size: 10, exclude: [] })
    expect(queueQuerySchema.parse({ size: '50', exclude: `${ID}, ${ID}` }).exclude).toEqual([ID, ID])
    expect(queueQuerySchema.safeParse({ size: '0' }).success).toBe(false)
    expect(queueQuerySchema.safeParse({ size: '51' }).success).toBe(false)
    expect(queueQuerySchema.safeParse({ size: '2.5' }).success).toBe(false)
    expect(queueQuerySchema.safeParse({ exclude: 'not-a-uuid' }).success).toBe(false)
    expect(queueQuerySchema.safeParse({ exclude: Array(501).fill(ID).join(',') }).success).toBe(false)
    expect(queueQuerySchema.safeParse({ page: 'x'.repeat(201) }).success).toBe(false)
  })

  it('image query', () => {
    expect(imageQuerySchema.parse({})).toEqual({ size: 'preview' })
    expect(imageQuerySchema.parse({ size: 'thumbnail' })).toEqual({ size: 'thumbnail' })
    expect(imageQuerySchema.safeParse({ size: 'original' }).success).toBe(false)
  })

  it('review scope', () => {
    expect(reviewScopeSchema.parse(defaultScope)).toEqual(defaultScope)
    const scope = { albumId: ID, order: 'oldest', takenAfter: '2020-01-01', takenBefore: '2021-01-01T00:00:00Z' }
    expect(reviewScopeSchema.parse(scope)).toEqual(scope)
    expect(reviewScopeSchema.safeParse({ ...scope, albumId: 'album-1' }).success).toBe(false)
    expect(reviewScopeSchema.safeParse({ ...scope, order: 'shuffle' }).success).toBe(false)
    expect(reviewScopeSchema.safeParse({ ...scope, takenAfter: 'yesterday' }).success).toBe(false)
    expect(reviewScopeSchema.safeParse({ ...scope, takenAfter: '2022-01-01' }).success).toBe(false)
    expect(reviewScopeSchema.safeParse({ ...defaultScope, extra: 1 }).success).toBe(false)
  })

  it('scope from query falls back to the saved scope; empty means null', () => {
    const saved: ReviewScope = { ...defaultScope, albumId: ID, order: 'newest' }
    expect(scopeFromQuery({}, saved)).toMatchObject({ success: true, data: saved })
    expect(scopeFromQuery({ albumId: '', order: 'oldest' }, saved)).toMatchObject({
      success: true,
      data: { ...saved, albumId: null, order: 'oldest' },
    })
    expect(scopeFromQuery({ albumId: 'bad' }, saved).success).toBe(false)
  })
})

describe('mapping', () => {
  it('camera name avoids repeating the make', () => {
    expect(cameraName('Canon', 'EOS R5')).toBe('Canon EOS R5')
    expect(cameraName('NIKON', 'NIKON D750')).toBe('NIKON D750')
    expect(cameraName(null, 'iPhone 15')).toBe('iPhone 15')
    expect(cameraName(null, null)).toBeNull()
  })
})

describe('logger', () => {
  it('writes JSON lines and never includes secrets', () => {
    registerLogSecrets(['immich-api-key-123', 'session-password-abcdefghijklmnopqrstuvwxyz', 'hunter22'])
    const line = formatLogLine('warn', 'failed with key immich-api-key-123', {
      route: '/api/review',
      assetId: ID,
      status: 502,
      password: 'hunter22',
      apiKey: 'immich-api-key-123',
      sessionPassword: 'x',
      cause: 'echo hunter22',
      nested: { token: 'abc', ok: 'session-password-abcdefghijklmnopqrstuvwxyz' },
    })
    const entry: unknown = JSON.parse(line)
    expect(entry).toMatchObject({ level: 'warn', route: '/api/review', assetId: ID, status: 502 })
    expect(line).not.toContain('immich-api-key-123')
    expect(line).not.toContain('hunter22')
    expect(line).not.toContain('session-password-abc')
    expect(line).not.toMatch(/"password"|"apiKey"|"sessionPassword"|"token"/)
  })
})
