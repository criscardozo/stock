import { configDefaults, defineConfig } from 'vitest/config'

// The only reason this file exists: `e2e/` holds Playwright specs, and both
// runners claim `*.spec.ts`. Without the exclusion vitest picks them up and
// dies on Playwright's own `test()` ("did not expect test() to be called
// here"), which reads as a broken app rather than two test runners disagreeing
// about a glob.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
