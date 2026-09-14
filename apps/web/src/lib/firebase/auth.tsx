'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth'
import { auth } from './client'
import { useEmulators } from './config'

interface AuthState {
  user: User | null
  /** Until this is true, we know nothing — render neither the app nor the login. */
  ready: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  /**
   * Emulator-only shortcut, so screens can be driven and looked at without a
   * real Google account. It refuses to exist outside the emulators, so there is
   * no path into it from a deployed build.
   */
  devSignIn: ((email: string) => Promise<void>) | null
}

const Ctx = createContext<AuthState | null>(null)

/** Installed PWAs run standalone, where a popup's handshake back is unreliable. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  // iOS Safari's own flag first: it predates the standard media query and is the
  // one that answers on the device this app is actually installed on.
  if ((window.navigator as { standalone?: boolean }).standalone === true) return true
  // `standalone` is not the only display mode without a usable popup —
  // `fullscreen` and `minimal-ui` are equally installed windows.
  return ['standalone', 'fullscreen', 'minimal-ui'].some(
    (mode) => window.matchMedia(`(display-mode: ${mode})`).matches,
  )
}

/** Closing the popup is a decision, not a failure to route around. */
export function isUserCancelled(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    return onAuthStateChanged(auth(), (next) => {
      setUser(next)
      setReady(true)
    })
  }, [])

  const signIn = async () => {
    const provider = new GoogleAuthProvider()
    if (isStandalone()) {
      await signInWithRedirect(auth(), provider)
      return
    }
    try {
      await signInWithPopup(auth(), provider)
    } catch (error) {
      // A popup can be unusable for reasons that are not the person changing
      // their mind — blocked by the browser, or a context that refuses to open
      // one — and without this the login button simply does nothing. Redirect
      // always works; it is the worse experience, not the broken one.
      if (isUserCancelled(error)) throw error
      await signInWithRedirect(auth(), provider)
    }
  }

  const signOut = async () => {
    await fbSignOut(auth())
  }

  const devSignIn = useEmulators
    ? async (email: string) => {
        await signInWithEmailAndPassword(auth(), email, 'emulator-only')
      }
    : null

  return (
    <Ctx.Provider value={{ user, ready, signIn, signOut, devSignIn }}>{children}</Ctx.Provider>
  )
}

export function useAuth(): AuthState {
  const value = useContext(Ctx)
  if (!value) throw new Error('useAuth outside AuthProvider')
  return value
}
