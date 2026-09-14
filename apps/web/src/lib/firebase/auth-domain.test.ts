import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Which host Firebase is told to build its auth handler URL from.
 *
 * It always builds `https://<authDomain>/__/auth/…` and there is no way to make
 * it http. So on the dev server — plain http on localhost — pointing it at
 * ourselves yields `https://localhost:3000/__/auth/handler`, and the sign-in
 * dies with ERR_SSL_PROTOCOL_ERROR before Google is ever reached.
 *
 * The deployed site is the opposite case: there the same-origin proxy is the
 * whole point, because Safari's ITP treats a third-party auth domain as
 * cross-site and drops the session.
 *
 * One line decides between those, and nothing exercised it. This does.
 */
const load = async () => (await import('./config')).firebaseConfig

function atOrigin(protocol: string, host: string) {
  vi.stubGlobal('window', { location: { protocol, host } })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  delete process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
})

describe('authDomain', () => {
  it('is our own host on the deployed https site', async () => {
    atOrigin('https:', 'stock.cardozo.dev')
    expect((await load()).authDomain).toBe('stock.cardozo.dev')
  })

  it("is Firebase's own domain over plain http, not ours", async () => {
    // The regression this guards: returning `localhost:3000` here is what makes
    // Firebase ask the browser for https://localhost:3000.
    atOrigin('http:', 'localhost:3000')
    expect((await load()).authDomain).toBe('qcris-stock.firebaseapp.com')
  })

  it('is Firebase’s own domain during SSR, where there is no window', async () => {
    vi.stubGlobal('window', undefined)
    expect((await load()).authDomain).toBe('qcris-stock.firebaseapp.com')
  })

  it('an explicit env var wins over both', async () => {
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = 'elsewhere.example'
    atOrigin('https:', 'stock.cardozo.dev')
    expect((await load()).authDomain).toBe('elsewhere.example')
  })
})
