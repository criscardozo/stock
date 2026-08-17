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
