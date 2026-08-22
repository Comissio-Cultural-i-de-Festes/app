import { defineConfig } from 'vitest/config'

/**
 * The PostgREST layer. Separate from the unit suite because it needs the local
 * Supabase stack running, and `npm test` must stay runnable with nothing but
 * node_modules.
 *
 * Files run one at a time: they share one database, and the check-in tests
 * deliberately mutate rows so they can assert what the second scan does.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/rls/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: { TZ: 'UTC' },
  },
})
