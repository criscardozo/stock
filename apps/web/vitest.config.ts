import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // `e2e/` holds Playwright specs, and both runners claim `*.spec.ts`.
    // Without this vitest picks them up and dies on Playwright's own `test()`,
    // which reads as a broken app rather than two runners disagreeing on a glob.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
  resolve: {
    // The same `@/` the app uses. Absent until now because every test happened
    // to import relatively — so the first test that reached a module using the
    // alias failed to COLLECT, which vitest reports as a failed suite with zero
    // tests. The suite still exits non-zero, but the "155 passed" line above it
    // reads like a pass.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
