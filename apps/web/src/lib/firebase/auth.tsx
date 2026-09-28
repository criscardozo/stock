'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  GoogleAuthProvider,
  getRedirectResult,
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
   * Why the last redirect sign-in came back without a user, if it did.
   *
   * The installed PWA signs in by redirect, and a redirect that fails — an
   * unauthorised domain, a blocked account — does not throw anywhere the login
   * button can catch: the page reloads, `onAuthStateChanged` reports no user,
   * and the person is back on the login screen with no idea why. Only
   * `getRedirectResult` carries the error, so it is asked once on mount.
   */
  redirectError: string | null
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
  const [redirectError, setRedirectError] = useState<string | null>(null)

  useEffect(() => {
    // Resolves to null when no redirect was pending, which is every load but
    // the one right after coming back from Google.
    getRedirectResult(auth()).catch((error: unknown) =>
      setRedirectError(error instanceof Error ? error.message : 'No se pudo entrar'),
    )
  }, [])

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
    <Ctx.Provider value={{ user, ready, signIn, signOut, redirectError, devSignIn }}>{children}</Ctx.Provider>
  )
}

export function useAuth(): AuthState {
  const value = useContext(Ctx)
  if (!value) throw new Error('useAuth outside AuthProvider')
  return value
}
