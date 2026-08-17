import type { NextConfig } from 'next'

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'qcris-stock'

const nextConfig: NextConfig = {
  /**
   * Serve Firebase's auth handler from our own origin.
   *
   * With the default cross-origin `authDomain`, Safari's storage partitioning
   * breaks `signInWithRedirect` — and a popup cannot be relied on inside an
   * INSTALLED PWA, where standalone mode opens a detached context and the
   * handshake back is lost. Same-origin makes both work.
   *
   * Every domain that serves the app must have `https://<domain>/__/auth/handler`
   * whitelisted as an OAuth redirect URI — see docs/setup.md.
   */
  async rewrites() {
    return [
      {
        source: '/__/auth/:path*',
        destination: `https://${projectId}.firebaseapp.com/__/auth/:path*`,
      },
    ]
  },
}

export default nextConfig
