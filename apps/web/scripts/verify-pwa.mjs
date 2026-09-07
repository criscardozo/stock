/**
 * PWA smoke check: proves the installed app can cold-start with no network.
 *
 * The service worker only registers in PRODUCTION builds, so this runs against
 * `next start` rather than the dev server. It signs nobody in — what it checks
 * is that the shell caches and boots offline, which is the part the home-screen
 * app depends on and the part no unit test can see.
 *
 *   pnpm build && pnpm --filter web exec next start -p 3113 &
 *   pnpm verify:pwa
 *
 * Ported from Gastos Diarios, which shares this stack. Kept out of any
 * Playwright config on purpose: it needs a production server, not the
 * emulators the E2E suite runs against.
 */
import { chromium } from '@playwright/test'

// 3113 and not 3112: Gastos Diarios runs the same check on 3112, and the two
// repos get worked on from the same machine. Same reasoning as Firestore on
// 8280 here instead of the usual 8080 — see firebase/firebase.json.
const BASE = process.env.PWA_BASE_URL ?? 'http://localhost:3113'

let failures = 0
function check(label, pass, extra = '') {
  if (!pass) failures += 1
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`)
}

const reachable = await fetch(BASE)
  .then((r) => r.ok)
  .catch(() => false)
if (!reachable) {
  console.error(
    `Nothing serving ${BASE}. Start a PRODUCTION build first:\n` +
      `  pnpm build && pnpm --filter web exec next start -p 3113`,
  )
  process.exit(1)
}

/** Poll from Node rather than an in-page loop, which would contend with the
 * worker's own cache writes. */
async function until(probe, timeoutMs = 25_000, everyMs = 500) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await probe().catch(() => false)) return true
    await new Promise((r) => setTimeout(r, everyMs))
  }
  return false
}

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, // phone-sized, like the installed app
})
const page = await context.newPage()

// 1) The worker installs and takes control.
await page.goto(`${BASE}/stock`, { waitUntil: 'load' })
const controlled = await until(() =>
  page.evaluate(
    async () =>
      (await navigator.serviceWorker.getRegistration()) !== undefined &&
      navigator.serviceWorker.controller !== null,
  ),
)
check('service worker registers and takes control', controlled)

// 2) The shell routes AND their hashed assets are precached at install time.
// The assets are the half that used to be missing: without them a first-visit
// offline reload finds the HTML and none of the code it points at.
await until(() =>
  page.evaluate(async () => {
    const names = await caches.keys()
    if (names.length === 0) return false
    const cache = await caches.open(names[0])
    const keys = (await cache.keys()).map((r) => new URL(r.url).pathname)
    return (
      keys.includes('/stock') && keys.filter((u) => u.startsWith('/_next/static/')).length >= 5
    )
  }),
)

const cached = await page.evaluate(async () => {
  const names = await caches.keys()
  const cache = await caches.open(names[0])
  return (await cache.keys()).map((r) => new URL(r.url).pathname)
})
const staticCount = cached.filter((u) => u.startsWith('/_next/static/')).length
check(
  'app shell + assets are precached',
  ['/stock', '/falta-comprar', '/plan', '/recetas', '/ajustes'].every((p) => cached.includes(p)) &&
    staticCount >= 5,
  `${cached.filter((u) => !u.startsWith('/_next')).join(' ')} + ${staticCount} assets`,
)

// 3) The point of all of it: a cold start with the network cut.
await context.setOffline(true)
let offline = false
try {
  await page.goto(`${BASE}/stock`, { waitUntil: 'domcontentloaded' })
  // Nobody is signed in, so what a route renders offline is the login screen.
  // That IS the proof wanted: the SPA booted from the cache instead of showing
  // the browser's own offline error page.
  await page.waitForSelector('text=Stock', { timeout: 10_000 })
  offline = true
} catch {
  offline = false
}
check('app boots with the network offline', offline)

// 4) Including routes this session never opened. `/falta-comprar` matters most:
// the supermarket is exactly where there is no signal.
let deepRoute = false
try {
  await page.goto(`${BASE}/falta-comprar`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('text=Continuar con Google', { timeout: 10_000 })
  deepRoute = true
} catch {
  deepRoute = false
}
check('unvisited routes open offline (incl. the shopping list)', deepRoute)

// 5) The auth handler must never come from the cache — caching a token
// exchange breaks sign-in, and it is same-origin here because next.config.ts
// rewrites it so Safari ITP does not eat the handshake.
await context.setOffline(false)
// Re-navigate first: evaluating straight after the previous goto can race the
// execution context being torn down.
await page.goto(`${BASE}/stock`, { waitUntil: 'domcontentloaded' })
let authStatus = 0
try {
  authStatus = await page.evaluate(() => fetch('/__/auth/handler').then((r) => r.status))
} catch (error) {
  console.error(`  (auth handler probe failed: ${String(error).slice(0, 120)})`)
}
check('auth handler bypasses the cache', authStatus === 200, `HTTP ${authStatus}`)

await browser.close()
process.exit(failures === 0 ? 0 : 1)
