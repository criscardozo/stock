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
 * The WEB OAuth client id, for asking Google directly for a calendar token.
 *
 * Not the same thing as the Firebase config above: signing in goes through
 * Firebase, but reading the meals calendar needs an access token for a scope
 * Firebase does not hand out, so that one is requested from Google Identity
 * Services with this id. Firebase created it when Google Sign-In was enabled —
 * it is the "Web client (auto created by Google Service)" in the Cloud console's
 * credentials page. See docs/setup.md.
 *
 * Null when unset, and the calendar feature hides itself rather than failing
 * when someone presses it. Everything else in the app works without it.
 */
export const googleOAuthClientId = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID ?? null

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
    const explicit = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
    if (explicit !== undefined && explicit !== '') return explicit
    if (typeof window === 'undefined') return `${DEFAULTS.projectId}.firebaseapp.com`
    // Firebase always builds the handler URL as `https://<authDomain>/__/auth/…`
    // and there is no way to make it http. So on a plain-http origin — the dev
    // server on localhost:3000 — pointing authDomain at ourselves produces
    // `https://localhost:3000/__/auth/handler` and the sign-in dies with
    // ERR_SSL_PROTOCOL_ERROR. Firebase's own domain is the right answer there:
    // localhost is an authorised domain out of the box, and the same-origin
    // proxy only matters on the deployed HTTPS site, where Safari's ITP is what
    // it exists to survive.
    //
    // Ported from Gastos Diarios, who hit it; verified here by reading the two
    // files side by side rather than by reproducing the error.
    if (window.location.protocol !== 'https:') return `${DEFAULTS.projectId}.firebaseapp.com`
    return window.location.host
  },
}
