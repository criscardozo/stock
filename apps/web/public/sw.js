/*
 * Service worker: enough to cold-start with no signal, and nothing more.
 *
 * Firestore keeps its own offline cache, so DATA is not this file's job — its
 * job is the shell around it. Anything Firebase or auth-shaped is deliberately
 * left alone: caching a token exchange or a Firestore stream would be worse
 * than useless.
 *
 * Bump CACHE when the shell changes; the old one is deleted on activate.
 */
const CACHE = 'stock-shell-v3'

// The routes a person can cold-start into.
const SHELL = ['/stock', '/falta-comprar', '/plan', '/recetas', '/ajustes', '/icons/favicon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Individually, so one 404 doesn't reject the whole install.
      .then(async (cache) => {
        await Promise.allSettled(SHELL.map((url) => cache.add(url)))
        await precacheShellAssets(cache)
      })
      .then(() => self.skipWaiting()),
  )
})

/**
 * Cache the JS and CSS the shell references.
 *
 * This used to be left to the fetch handler, on the reasoning that hashed
 * chunks get cached the first time they are asked for. They do — but on the
 * FIRST visit the page's chunks were already fetched before this worker
 * existed, so they never entered the cache, and an offline reload right then
 * falls back to the cached HTML and finds none of the code it points at. The
 * app only became offline-capable on the second online visit.
 *
 * The URLs are hashed and unknowable at author time, so they are read out of
 * the shell HTML that was just cached. Fonts live inside the CSS and are picked
 * up on first use.
 */
async function precacheShellAssets(cache) {
  try {
    const response = await cache.match('/stock')
    if (response === undefined) return
    const html = await response.text()
    const urls = new Set()
    for (const match of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)) {
      urls.add(match[1])
    }
    await Promise.allSettled([...urls].map((url) => cache.add(url)))
  } catch {
    // A shell that cannot be re-read is not worth failing the install over:
    // the fetch handler still fills the cache as the app is used.
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

/** Firebase, Google, and the same-origin auth handler are never touched. */
function isOffLimits(url) {
  return (
    url.pathname.startsWith('/__/auth') ||
    /(^|\.)(googleapis|google|gstatic|firebaseio|firebaseapp|firebase)\.com$/.test(url.hostname)
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (isOffLimits(url)) return

  // Navigations: network first, because a stale shell is only acceptable when
  // there is no network at all.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
          return response
        })
        .catch(async () => {
          const cache = await caches.open(CACHE)
          return (await cache.match(request)) ?? (await cache.match('/stock')) ?? Response.error()
        }),
    )
    return
  }

  if (url.origin !== self.location.origin) return

  // Next's build output is content-hashed, so a hit is always the right bytes.
  // NOT /icons/: those names are fixed (icon-512.png stays icon-512.png), so a
  // cache-first hit there serves last month's icon forever. They go through the
  // network-first path below, which falls back to the cached copy offline.
  const immutable = url.pathname.startsWith('/_next/static')

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit && immutable) return hit
      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => hit ?? Response.error())
    }),
  )
})
