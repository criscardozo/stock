import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The palette is written twice — `globals.css` for the web, `Theme.swift` for
 * iOS — and three times if you count that CSS cannot share one block between a
 * media query and an attribute selector, so the dark values appear twice in the
 * stylesheet alone.
 *
 * Nothing but care keeps those copies equal, and care is exactly what fails
 * quietly: Gastos Diarios shipped a `--warn-text` that was below the AA minimum
 * on one platform and correct on the other, for months, because only one side
 * was ever updated. No test and no type checker could see it — the two files
 * are each valid on their own.
 *
 * These two tests are cheap and they close that gap. If they ever fail, the
 * fix is to make the values equal, not to update the expectation.
 */

const root = join(__dirname, '../../../../..')
const css = readFileSync(join(root, 'apps/web/src/app/globals.css'), 'utf8')
const swift = readFileSync(join(root, 'apps/ios/Stock/Design/Theme.swift'), 'utf8')
const watch = readFileSync(join(root, 'apps/ios/StockWatch/WatchTheme.swift'), 'utf8')

/** `--name: #rrggbb;` pairs inside one block. */
function hexDeclarations(block: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out.set(m[1], m[2].toLowerCase())
  }
  return out
}

/** The whole `{...}` body that starts at `marker`, brace-counted. */
function blockAt(marker: string): string {
  const start = css.indexOf(marker)
  if (start < 0) throw new Error(`no encontré ${marker} en globals.css`)
  let depth = 0
  for (let i = start; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1)
  }
  throw new Error(`bloque sin cerrar: ${marker}`)
}

/** `static let name = Color.hex(light: 0xAABBCC, dark: 0xDDEEFF)` */
function swiftTokens(): Map<string, [string, string]> {
  const out = new Map<string, [string, string]>()
  const re = /static let (\w+) = Color\.hex\(\s*light: 0x([0-9A-Fa-f]{6}),\s*dark: 0x([0-9A-Fa-f]{6})/g
  for (const m of swift.matchAll(re)) {
    out.set(m[1], [`#${m[2].toLowerCase()}`, `#${m[3].toLowerCase()}`])
  }
  return out
}

/** Same role, different naming convention on each side. */
const ROLES: Record<string, string> = {
  ground: 'ground',
  surface: 'surface',
  ink: 'ink',
  'ink-secondary': 'ink2',
  'ink-tertiary': 'ink3',
  'ink-quaternary': 'ink4',
  primary: 'primary',
  'primary-deep': 'primaryDeep',
  'on-primary': 'onPrimary',
  danger: 'danger',
  'danger-deep': 'dangerDeep',
  'on-danger': 'onDanger',
  'member-a': 'memberA',
  'member-b': 'memberB',
  'mark-from': 'markFrom',
  'mark-to': 'markTo',
  'mark-glyph': 'markGlyph',
}

describe('design tokens', () => {
  it('the two dark blocks in globals.css stay identical', () => {
    const media = hexDeclarations(blockAt('@media (prefers-color-scheme: dark)'))
    const forced = hexDeclarations(blockAt("[data-theme='dark']"))
    expect(Object.fromEntries(forced)).toEqual(Object.fromEntries(media))
  })

  it('web and iOS agree on every colour they both name', () => {
    const light = hexDeclarations(blockAt(':root'))
    const dark = hexDeclarations(blockAt('@media (prefers-color-scheme: dark)'))
    const ios = swiftTokens()

    for (const [cssName, swiftName] of Object.entries(ROLES)) {
      const onIOS = ios.get(swiftName)
      // A missing token is a rename that only landed on one side.
      expect(onIOS, `Theme.swift no define ${swiftName}`).toBeDefined()
      expect(light.get(cssName), `globals.css no define --${cssName}`).toBeDefined()

      expect([light.get(cssName), dark.get(cssName)], `--${cssName} vs ${swiftName}`).toEqual(onIOS)
    }
  })
})

describe('the watch is the fourth copy, and nothing was holding it', () => {
  /**
   * `StockWatch/WatchTheme.swift` restates eight tokens. That is deliberate and
   * documented there — the watch target compiles no phone code, and watchOS
   * always renders dark, so carrying the light halves would be dead weight and
   * a claim about the screen that is not true.
   *
   * What was not deliberate is that nothing checked it. The eight agree today;
   * they agree because whoever wrote them was careful on a Tuesday, which is
   * the same guarantee Gastos Diarios had when their `--warn-text` drifted for
   * months. Gastos found their own third copy in the widget and told us to look
   * for ours; ours is the watch.
   *
   * SCOPE, and it differs from theirs on purpose: this compares against the
   * `dark:` half only, because the watch has no light half to compare. Their
   * widget renders both appearances, so their guard checks the whole pair. Same
   * rule, different surface — written here so whoever puts the two files side
   * by side does not read one of them as a mistake.
   */
  it('every watch token is the dark half of the phone token', () => {
    const phone = swiftTokens()
    const wrong: string[] = []
    let checked = 0
    for (const m of watch.matchAll(/static let (\w+) = Color\(hex: 0x([0-9A-Fa-f]{6})\)/g)) {
      const [, name, hex] = m
      checked += 1
      const pair = phone.get(name)
      if (pair === undefined) wrong.push(`${name}: no existe en Theme.swift`)
      else if (pair[1] !== `#${hex.toLowerCase()}`) {
        wrong.push(`${name}: el reloj dice #${hex.toLowerCase()}, el teléfono #${pair[1].replace('#', '')}`)
      }
    }
    // The count is asserted because a regex that stops matching would otherwise
    // check nothing and pass — the failure that does not fail.
    expect({ checked, wrong }).toEqual({ checked: 8, wrong: [] })
  })
})
