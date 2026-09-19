import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The URL scheme Google calls back on, which is a three-link chain and breaks
 * silently at every link.
 *
 * Google Sign-In on iOS returns to the app through a custom URL scheme, and the
 * scheme IS the reversed client id. If it does not match, the browser leaves and
 * never comes back: no crash, no log, nothing in a test — just a sign-in that
 * hangs, on a device, for a person who cannot tell you why.
 *
 * The chain, and what breaks each link:
 *
 *   GoogleService-Info.plist   CLIENT_ID  ──derives──▶  REVERSED_CLIENT_ID
 *                              (a hand-edited plist, or one pasted from another
 *                               Firebase app, can disagree with itself)
 *   project.yml                GOOGLE_REVERSED_CLIENT_ID = that literal
 *                              (a copy, so it drifts the usual way)
 *   Stock/Info.plist           CFBundleURLSchemes = $(GOOGLE_REVERSED_CLIENT_ID)
 *                              (xcodegen output; someone hardcoding a value here
 *                               would work today and rot at the next client id)
 *
 * This guard derives the expected value rather than stating it. Writing the
 * scheme here would make this the next copy in the chain it exists to hold
 * together — and it would still pass with all three files wrong in the same way.
 *
 * Exact and not a floor: the three links are the whole chain, closed by the
 * shape of the thing rather than by a list someone maintains.
 */
const root = join(__dirname, '../../../../..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

/** The flat `<key>k</key><string>v</string>` pairs a GoogleService-Info uses. */
function plistString(xml: string, key: string): string {
  const m = xml.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`))
  return m ? m[1] : ''
}

const SERVICE_INFO = 'apps/ios/Stock/Resources/GoogleService-Info.plist'
const serviceInfo = read(SERVICE_INFO)
const clientId = plistString(serviceInfo, 'CLIENT_ID')
const reversed = plistString(serviceInfo, 'REVERSED_CLIENT_ID')

// Google's own construction: the host-ordered id, reversed, minus its suffix.
const GOOGLE_SUFFIX = '.apps.googleusercontent.com'
const derived = `com.googleusercontent.apps.${clientId.replace(GOOGLE_SUFFIX, '')}`

describe('the URL scheme Google calls back on', () => {
  // Anti-void, and it is not decoration: every assertion below compares strings
  // read out of files, and two empty strings are equal. Without this the whole
  // file passes green against a plist that failed to parse.
  it('read both ids out of GoogleService-Info.plist', () => {
    expect({ clientId: clientId.endsWith(GOOGLE_SUFFIX), reversed: reversed.length > 30 }).toEqual({
      clientId: true,
      reversed: true,
    })
  })

  it('the plist agrees with itself', () => {
    expect(reversed).toBe(derived)
  })

  it('project.yml carries the reversed id as the build setting', () => {
    const m = read('apps/ios/project.yml').match(/GOOGLE_REVERSED_CLIENT_ID:\s*(\S+)/)
    expect(m?.[1]).toBe(derived)
  })

  it('the generated Info.plist interpolates the setting rather than repeating it', () => {
    // The interpolation is what makes project.yml the single place the value
    // lives. A literal here would be correct today and is the failure mode that
    // survives a client id change, so it fails even when it happens to match.
    const schemes = read('apps/ios/Stock/Info.plist').match(
      /<key>CFBundleURLSchemes<\/key>\s*<array>\s*<string>([^<]*)<\/string>/g,
    )
    expect(schemes?.some((s) => s.includes('$(GOOGLE_REVERSED_CLIENT_ID)'))).toBe(true)
  })
})
