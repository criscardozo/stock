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
const CACHE = 'stock-shell-v1'

// The routes a person can cold-start into. Their JS chunks are hashed, so they
// can't be listed here — they get cached the first time they're fetched.
const SHELL = ['/stock', '/falta-comprar', '/plan', '/recetas', '/ajustes', '/icons/favicon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Individually, so one 404 doesn't reject the whole install.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  )
})

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
  const immutable = url.pathname.startsWith('/_next/static') || url.pathname.startsWith('/icons/')

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
