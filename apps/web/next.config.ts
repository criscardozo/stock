import { execFileSync } from 'node:child_process'
import type { NextConfig } from 'next'

import pkg from './package.json' with { type: 'json' }

/**
 * Build stamp for the version card in Ajustes.
 *
 * Resolved HERE, at build time, rather than hardcoded in a component: a string
 * someone has to remember to bump is a string that lies. On Vercel the commit
 * comes from the build environment; locally from git; with neither, the card
 * says "desconocida" instead of inventing something.
 */
function commitSha(): string {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA
  if (fromVercel !== undefined && fromVercel !== '') return fromVercel.slice(0, 7)
  try {
    // execFile, not exec: no shell, so nothing here can be word-split even if
    // the arguments ever stop being literals.
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
  } catch {
    return ''
  }
}

/** When the commit was authored — what "last updated" means to a reader. */
function commitDate(): string {
  try {
    return execFileSync('git', ['log', '-1', '--format=%cI'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
  } catch {
    return new Date().toISOString()
  }
}

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'qcris-stock'

const nextConfig: NextConfig = {
  // Fully client-rendered behind a static shell — no server features needed.
  reactStrictMode: true,

  // Inlined into the client bundle at build time. All three are public facts
  // about the deployed build; nothing secret.
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD_SHA: commitSha(),
    NEXT_PUBLIC_BUILD_DATE: commitDate(),
  },

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
  /**
   * A Content-Security-Policy, in REPORT-ONLY, which is the only form that can
   * be shipped without a real sign-in to test it against.
   *
   * The reason a real one is not here is unchanged: Firebase Auth and Google
   * Identity Services need `unsafe-inline` and a handful of origins, and a
   * half-written CSP does not fail at build time — it fails at sign-in, on
   * someone else's Safari, weeks later. Report-only cannot break anything: the
   * browser evaluates it, reports what WOULD have been blocked, and enforces
   * nothing.
   *
   * So this is a measurement, not a defence. It exists to answer the question
   * that has to be answered before a real one can be written: what does this
   * app actually load and connect to, in a real installed PWA, during a real
   * Google sign-in? Read the violations in the console, then narrow.
   *
   * The origins listed are the ones the app is known to use — Google Fonts for
   * the stylesheet and the woff2, the auth handler this domain serves itself,
   * and Google's identity endpoints. `unsafe-inline` is in there deliberately:
   * removing it is the whole difficulty, and pretending otherwise here would
   * produce a report full of noise about Next's own bootstrap script.
   *
   * No `report-uri`. There is nowhere to send reports on a $0 budget, and a
   * directive pointing at nothing is worse than none — see the write-error
   * dialog for what an unreported failure costs.
   */
  async headers() {
    // The emulators, and only when pointed at them. Measured: with a real
    // session against them the policy reports twelve violations, every one a
    // `127.0.0.1` host that in production is `https://*.googleapis.com` and
    // already allowed. Adding them here keeps the development console about the
    // app rather than about the setup — and the twelve were also the proof that
    // the header is being evaluated at all rather than sitting inert.
    const emulators = process.env.NEXT_PUBLIC_USE_EMULATORS
      ? ' http://127.0.0.1:8085 http://127.0.0.1:9098 ws://127.0.0.1:8085'
      : ''

    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://accounts.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://lh3.googleusercontent.com",
      `connect-src 'self' https://*.googleapis.com https://accounts.google.com https://*.firebaseio.com wss://*.firebaseio.com${emulators}`,
      "frame-src 'self' https://accounts.google.com https://*.firebaseapp.com",
      "worker-src 'self' blob:",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; ')

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy-Report-Only', value: csp },
          // No MIME sniffing. The app serves user-supplied nothing, but the
          // service worker and the precache do serve a lot of files.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Send the origin off-site, never the path. The paths here are not
          // secret, but "which household screen was open" is nobody's business.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // The app asks for none of these. The camera is used by the iOS app,
          // not the web one — the barcode scanner never shipped here.
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ]
  },

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
