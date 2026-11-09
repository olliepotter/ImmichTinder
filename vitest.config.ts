import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

export default defineConfig({
  test: {
    projects: [
      {
        // Pure server-side unit tests (no Nuxt runtime; inject dependencies instead).
        test: {
          name: 'server',
          include: ['test/server/**/*.test.ts'],
          environment: 'node',
        },
      },
      await defineVitestProject({
        // Component tests run inside a Nuxt environment backed by happy-dom.
        test: {
          name: 'app',
          include: ['test/app/**/*.test.ts'],
          environment: 'nuxt',
          environmentOptions: {
            nuxt: { domEnvironment: 'happy-dom' },
          },
        },
      }),
    ],
  },
})
