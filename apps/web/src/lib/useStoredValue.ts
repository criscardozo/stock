'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * A value in localStorage, read the way React wants an external source read.
 *
 * Not `useState` + `useEffect`: that shape sets state synchronously inside an
 * effect (a cascading render, and the lint rule that catches it is right), and
 * it goes stale when another tab writes the same key. `useSyncExternalStore`
 * subscribes instead, so a second tab and this one agree.
 *
 * Storage can be unavailable — private mode, a locked-down browser — and every
 * path here treats that as "no value" rather than throwing.
 */
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  // Other tabs report through the storage event; this tab reports through
  // writeStoredValue below, because `storage` does not fire on the writer.
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

export function writeStoredValue(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Not persisting is survivable; crashing over it is not.
  }
  emit()
}

export function useStoredValue(key: string | null): string | null {
  const getSnapshot = useCallback(() => {
    if (key === null) return null
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  }, [key])

  // The server renders no storage at all, which is exactly "no value yet".
  return useSyncExternalStore(subscribe, getSnapshot, () => null)
}
