// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint'],

  devtools: { enabled: process.env.NODE_ENV !== 'production' },

  app: {
    head: {
      title: 'Immich Tinder',
      link: [{ rel: 'icon', type: 'image/png', href: '/favicon.png' }],
    },
  },

  // Every key can be overridden at runtime with NUXT_<KEY> env vars
  // (e.g. NUXT_IMMICH_URL, NUXT_PUBLIC_IMMICH_WEB_URL). Legacy env names
  // (IMMICH_URL, IMMICH_TOKEN, ...) are resolved at runtime by
  // server/utils/config.ts. See docs/DESIGN.md.
  runtimeConfig: {
    immichUrl: '',
    immichApiKey: '',
    appPassword: '',
    sessionPassword: '',
    databasePath: './data/immich-tinder.db',
    cookieSecure: process.env.NODE_ENV === 'production',
    public: {
      immichWebUrl: '',
    },
  },

  compatibilityDate: '2025-07-15',
})
