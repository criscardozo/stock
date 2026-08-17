/**
 * Firebase client config. This is PUBLIC by design — the security boundary is
 * `firebase/firestore.rules`, never config secrecy. It lives in env vars only
 * so the same build can point at a different project.
 */
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? 'demo-api-key',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'demo-stock',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
  /**
   * The host serving the app, NOT `<project>.firebaseapp.com`. next.config.ts
   * rewrites `/__/auth/*` to Firebase's handler, so the whole sign-in happens
   * same-origin — which is the only way `signInWithRedirect` survives Safari's
   * storage partitioning, and the only way sign-in works at all in the
   * installed PWA (a popup cannot hand back to a standalone window).
   */
  get authDomain(): string {
    if (typeof window !== 'undefined') return window.location.host
    return process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'localhost:3000'
  },
}

export const useEmulators = process.env.NEXT_PUBLIC_USE_EMULATORS === '1'
