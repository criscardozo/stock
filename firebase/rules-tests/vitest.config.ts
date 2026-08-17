import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The emulator is a single shared instance, so the suites take turns
    // instead of racing each other's seed data.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
})
