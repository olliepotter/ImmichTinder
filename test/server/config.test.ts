import { describe, expect, it } from 'vitest'
import { resolveServerConfig } from '../../server/utils/config'

const defaults = {
  immichUrl: '',
  immichApiKey: '',
  appPassword: '',
  sessionPassword: '',
  databasePath: './data/immich-tinder.db',
  cookieSecure: true,
  public: { immichWebUrl: '' },
}

describe('resolveServerConfig', () => {
  it('falls back to legacy env names', () => {
    const config = resolveServerConfig(defaults, {
      IMMICH_URL: 'http://immich:2283/',
      IMMICH_TOKEN: 'legacy-token',
      APP_PASSWORD: 'pw',
      SESSION_SECRET: 'secret',
      DATABASE_PATH: '/data/x.db',
    })
    expect(config).toMatchObject({
      immichUrl: 'http://immich:2283',
      immichApiKey: 'legacy-token',
      appPassword: 'pw',
      sessionPassword: 'secret',
      databasePath: '/data/x.db',
    })
  })

  it('prefers IMMICH_API_KEY over IMMICH_TOKEN and NUXT_* values over legacy names', () => {
    expect(resolveServerConfig(defaults, { IMMICH_API_KEY: 'new', IMMICH_TOKEN: 'old' }).immichApiKey).toBe('new')
    const config = resolveServerConfig(
      { ...defaults, immichApiKey: 'nuxt', databasePath: '/nuxt.db' },
      { IMMICH_API_KEY: 'legacy', NUXT_DATABASE_PATH: '/nuxt.db', DATABASE_PATH: '/legacy.db' },
    )
    expect(config.immichApiKey).toBe('nuxt')
    expect(config.databasePath).toBe('/nuxt.db')
  })

  it('coerces values parsed by destr', () => {
    const config = resolveServerConfig({ ...defaults, appPassword: 12345678, cookieSecure: 'false' }, {})
    expect(config.appPassword).toBe('12345678')
    expect(config.cookieSecure).toBe(false)
  })
})
