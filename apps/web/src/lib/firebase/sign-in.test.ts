import { describe, expect, it } from 'vitest'
import { isStandalone, isUserCancelled } from './auth'

/**
 * The two decisions inside `signIn()`, extracted so they can be looked at.
 *
 * Which window this is decides popup vs redirect: a popup's handshake back is
 * unreliable in an installed window, and this app is installed on a phone. And
 * when a popup fails, why it failed decides whether to route around it — a
 * person closing it means no, a browser blocking it means "use the other door",
 * and treating the second as the first leaves the login button doing nothing.
 */
describe('which window is this', () => {
  const withDisplayMode = (mode: string | null, standalone = false) => {
    const original = globalThis.window
    Object.defineProperty(globalThis, 'window', {
      value: {
        navigator: { standalone },
        matchMedia: (query: string) => ({ matches: mode !== null && query.includes(mode) }),
      },
      configurable: true,
      writable: true,
    })
    try {
      return isStandalone()
    } finally {
      Object.defineProperty(globalThis, 'window', { value: original, configurable: true, writable: true })
    }
  }

  it('a browser tab is not standalone', () => {
    expect(withDisplayMode('browser')).toBe(false)
  })

  it.each(['standalone', 'fullscreen', 'minimal-ui'])('%s is an installed window', (mode) => {
    // `fullscreen` and `minimal-ui` were missing, and they are installed windows
    // just as much as `standalone` — a popup is no more usable in them.
    expect(withDisplayMode(mode)).toBe(true)
  })

  it("iOS Safari's own flag counts, since it predates the media query", () => {
    expect(withDisplayMode('browser', true)).toBe(true)
  })
})

describe('why the popup failed', () => {
  it.each(['auth/popup-closed-by-user', 'auth/cancelled-popup-request'])(
    '%s is the person saying no',
    (code) => {
      expect(isUserCancelled({ code })).toBe(true)
    },
  )

  it.each(['auth/popup-blocked', 'auth/network-request-failed', undefined])(
    '%s is not, so the redirect is worth trying',
    (code) => {
      expect(isUserCancelled(code === undefined ? null : { code })).toBe(false)
    },
  )
})
