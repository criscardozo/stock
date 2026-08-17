/**
 * Firebase client config for `qcris-stock`.
 *
 * These values are committed on purpose. A Firebase web config is PUBLIC by
 * design — it ships inside the JavaScript bundle of every deployed build, so
 * hiding it in environment variables would protect nothing while making the
 * deploy depend on dashboard state. The security boundary is
 * `firebase/firestore.rules`, never config secrecy.
 *
 * Every value can still be overridden per environment, which is what points a
 * build at a different project.
 */
const DEFAULTS = {
  apiKey: 'AIzaSyC8Nw8a1OZfjGxnI4ofFiWHNWIn7JZiQVM',
  projectId: 'qcris-stock',
  storageBucket: 'qcris-stock.firebasestorage.app',
  messagingSenderId: '176221729478',
  appId: '1:176221729478:web:1ed9a4033e23b4dd85ddc7',
}

export const useEmulators = process.env.NEXT_PUBLIC_USE_EMULATORS === '1'

/**
 * The emulator suite runs under the `demo-stock` project id (the `demo-` prefix
 * is what tells it to refuse any call to a real Google service). The client has
 * to agree, or its writes land in a different project inside the same emulator
 * and the app reads an empty database it just wrote to.
 */
const EMULATOR_PROJECT_ID = 'demo-stock'

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? DEFAULTS.apiKey,
  projectId: useEmulators
    ? EMULATOR_PROJECT_ID
    : (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? DEFAULTS.projectId),
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? DEFAULTS.storageBucket,
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? DEFAULTS.messagingSenderId,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? DEFAULTS.appId,

  /**
   * NOT `qcris-stock.firebaseapp.com`, which is what the console hands you:
   * the host serving the app.
   *
   * next.config.ts rewrites `/__/auth/*` to Firebase's handler, so the whole
   * sign-in happens same-origin. That is the only way `signInWithRedirect`
   * survives Safari's storage partitioning, and the only way sign-in works at
   * all in the installed PWA, where a popup opens a detached context and the
   * handshake back is lost. Cost: every domain that serves the app needs
   * `https://<domain>/__/auth/handler` whitelisted as an OAuth redirect URI —
   * see docs/setup.md.
   */
  get authDomain(): string {
    if (typeof window !== 'undefined') return window.location.host
    return process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? `${DEFAULTS.projectId}.firebaseapp.com`
  },
}
