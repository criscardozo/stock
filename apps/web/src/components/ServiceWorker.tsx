'use client'

import { useEffect } from 'react'

/**
 * Registers the shell service worker. Development is excluded on purpose: a
 * cached shell is exactly what you don't want while editing it, and Turbopack
 * serves its own.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return

    // After load, so registering never competes with the first paint.
    const register = () => {
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        // An unregistered worker costs offline start-up, nothing else.
      })
    }

    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }, [])

  return null
}
