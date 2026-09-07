import { defineConfig, devices } from '@playwright/test'

// E2E runs ONLY against the Firebase emulators, never production.
//
// Started externally before `pnpm test:e2e`, because the suite needs the seed
// too and starting both here would hide which one failed:
//   pnpm emulators              # Auth 9280, Firestore 8280, project demo-stock
//   pnpm seed                   # a household that looks real
//   pnpm test:e2e
//
// The dev server is started automatically below with the emulator env vars, so
// sign-in goes through the emulator-only buttons on the login screen —
// signInWithPopup cannot be driven headlessly.
//
// The port is configurable so the suite can run while a separate `pnpm dev`
// holds 3000.
const PORT = process.env.E2E_PORT ?? '3210'
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  // The suite runs against `next dev`, which compiles each route the first time
  // it is opened. That first navigation on a cold CI runner can exceed the 5s
  // default — a slow toolchain, not a broken app — so assertions wait longer
  // rather than reporting a failure that never reproduces locally.
  expect: { timeout: 20_000 },
  retries: 0,
  // One worker: every spec drives the same seeded household, so they would
  // otherwise fight over the same documents.
  workers: 1,
  reporter: 'list',
  use: { baseURL: BASE_URL, trace: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm dev --port ${PORT}`,
    url: BASE_URL,
    // Never reuse a server that might be running WITHOUT the emulator env.
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_USE_EMULATORS: '1',
    },
  },
})
