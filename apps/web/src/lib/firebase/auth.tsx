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
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari's own flag, which predates the standard media query.
    (window.navigator as { standalone?: boolean }).standalone === true
  )
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
    await signInWithPopup(auth(), provider)
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
