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
   *
   * ── The thing that will bite whoever enforces this ──
   *
   * `source: '/:path*'` means the policy also covers `/__/auth/handler`, which
   * is Firebase's own page proxied through the rewrite below. Measured on
   * 2026-09-07 against production: the header does reach it, and loading it
   * standalone reports ZERO violations. Its scripts are relative — they resolve
   * same-origin through the rewrite, so `'self'` covers them.
   *
   * But that page carries an inline script tagged
   * `nonce="firebase-auth-helper"`, and we do not control it. That matters for
   * a specific reason: per the CSP spec, a policy containing ANY nonce source
   * makes `'unsafe-inline'` be ignored. So the moment someone writes the
   * nonce-based policy that would make this worth enforcing, that inline script
   * needs a nonce Firebase chose and we cannot emit — and the flow it breaks is
   * sign-in, on a redirect back from Google, which no local test reaches.
   *
   * Which is to say the obstacle is not "Firebase needs unsafe-inline, how
   * annoying". It is that a strict policy and a proxied third-party page with
   * its own nonce cannot both be true.
   *
   * And the obvious way out is not one. `firebase-auth-helper` is a constant,
   * so `'nonce-firebase-auth-helper'` in the policy would work — and would be
   * `'unsafe-inline'` with extra steps, because anyone who can inject HTML
   * reads the header and writes that same attribute. A public nonce is not a
   * nonce. (Gastos Diarios' corollary, and worth writing down precisely because
   * it looks like a door.)
   *
   * So there are two options, not three: stop proxying the handler, or accept
   * `'unsafe-inline'` permanently. Gastos reached the same wall from the other
   * side and chose to have no policy at all rather than guess at one.
   *
   * ── And a SECOND thing, which this comment used to miss entirely ──
   *
   * Everything above analyses `/__/auth/handler`, which is a top-level
   * navigation. `frame-ancestors 'none'`, further down in this same policy, is
   * not about that page: it is about `/__/auth/iframe`, the route next to it,
   * which the Firebase SDK loads IN AN IFRAME from this same origin. A
   * `frame-ancestors` of `'none'` refuses the same origin too.
   *
   * The measurement above — "loading it standalone reports ZERO violations" —
   * is true of the handler and says nothing about the neighbour, and the two
   * are one word apart in the URL. That is what let this sit here unnoticed:
   * not a claim written without measuring, a measurement of one half with the
   * conclusion written over both.
   *
   * NOT MEASURED HERE, and deliberately not written as if it were: a sibling
   * app hit exactly this in production, serving `X-Frame-Options: DENY`, and
   * sign-in had nowhere to return to. This repo never served that header and
   * its CSP is Report-Only, so nothing is blocked TODAY — which is the only
   * reason this is a note and not a bug. But Report-Only exists in order to be
   * promoted, and promoting it is what arms this.
   *
   * Their fix, for whoever does that: `frame-ancestors 'self'` (or
   * `X-Frame-Options: SAMEORIGIN`) scoped to `/__/auth/*`, in a rule AFTER the
   * general one, because the last rule to set a key wins. And it can only be
   * verified in production: `next start` does not apply config headers to a
   * rewritten route and Vercel does, so a local `curl` returns Firebase's own
   * response carrying none of this and reassures you for the wrong reason.
   */
  async headers() {
    // The emulators, and only when pointed at them. Measured: with a real
    // session against them the policy reports twelve violations, every one a
    // `127.0.0.1` host that in production is `https://*.googleapis.com` and
    // already allowed. Adding them here keeps the development console about the
    // app rather than about the setup — and the twelve were also the proof that
    // the header is being evaluated at all rather than sitting inert.
    const emulators = process.env.NEXT_PUBLIC_USE_EMULATORS
      ? ' http://127.0.0.1:8280 http://127.0.0.1:9280 ws://127.0.0.1:8280 ws://127.0.0.1:9380'
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
