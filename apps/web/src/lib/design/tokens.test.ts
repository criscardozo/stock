import { execFileSync } from 'node:child_process'
import { spawnSync } from 'node:child_process'
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
const source = readFileSync(join(root, 'apps/web/src/app/globals.css'), 'utf8')
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

/**
 * Blank out CSS block comments, keeping newlines so offsets stay usable.
 *
 * `globals.css` opens with a comment that NAMES `:root` and `@theme`, so
 * `indexOf(':root')` has always found the prose, not the rule, and counted
 * braces from there. It reached the right block anyway — the declaration regex
 * ignores prose — so this passed for months by luck. `extract.py` asked for
 * `@theme` the same way and got the `:root` block back: a real block, fully
 * parseable, silently the wrong one. Same bug, and only the second caller had
 * the shape to reveal it.
 */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
}

/** The whole `{...}` body that starts at `marker`, brace-counted. */
function blockAt(marker: string): string {
  const css = withoutComments(source)
  const start = css.indexOf(marker)
  if (start < 0) throw new Error(`no encontré ${marker} en globals.css`)
  let depth = 0
  for (let i = start; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1)
  }
  throw new Error(`bloque sin cerrar: ${marker}`)
}

/** `static let name = Color.hex(light: "#AABBCC", dark: "#DDEEFF")` */
function swiftTokens(): Map<string, [string, string]> {
  const out = new Map<string, [string, string]>()
  const re = /static let (\w+) = Color\.hex\(\s*light: "#([0-9A-Fa-f]{6})",\s*dark: "#([0-9A-Fa-f]{6})"/g
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
  /**
   * The watch carries its OWN `init(hex:)`. It has to: the target compiles no
   * phone code, and the extension would collide with the phone's if both were
   * linked.
   *
   * That matters more since the argument became a String. A number could not be
   * parsed wrongly; a string can, and `Scanner.scanHexInt64` reports failure by
   * leaving the value at 0 — so a broken parse does not crash, it renders the
   * whole app black. `StockTests/ThemeColorTests` measures that, byte by byte,
   * against arithmetic it does itself.
   *
   * But it measures the PHONE's copy. `StockWatch` has no test target and adding
   * one to check four lines is not worth a target. So the coverage is claimed
   * transitively and this is the link that makes the claim true: the two bodies
   * are the same text, therefore the phone's test speaks for both. The day they
   * differ, this fails and says which one is untested.
   */
  it("the watch's own hex parser is the one the phone's tests cover", () => {
    const body = (src: string) => {
      const m = src.match(/init\(hex: String, alpha: Double = 1\) \{[\s\S]*?\n {4}\}/)
      return m?.[0]
    }
    const phone = body(swift)
    const onWatch = body(watch)
    expect(phone, 'Theme.swift ya no define init(hex: String)').toBeDefined()
    expect(onWatch, 'WatchTheme.swift ya no define init(hex: String)').toBeDefined()
    expect(onWatch).toEqual(phone)
  })

  it('every watch token is the dark half of the phone token', () => {
    const phone = swiftTokens()
    const wrong: string[] = []
    let checked = 0
    for (const m of watch.matchAll(/static let (\w+) = Color\(hex: "#([0-9A-Fa-f]{6})"\)/g)) {
      const [, name, hex] = m
      checked += 1
      const pair = phone.get(name)
      if (pair === undefined) wrong.push(`${name}: no existe en Theme.swift`)
      else if (pair[1] !== `#${hex.toLowerCase()}`) {
        wrong.push(`${name}: el reloj dice #${hex.toLowerCase()}, el teléfono #${pair[1].replace('#', '')}`)
      }
    }
    // The count is asserted because a regex that stops matching would otherwise
    // check nothing and pass — the failure that does not fail. It earned that
    // line the day the literals went from `0x…` to `"#…"`: both tests here went
    // red on the shape, reporting `checked: 0`, instead of agreeing that zero
    // tokens all matched.
    expect({ checked, wrong }).toEqual({ checked: 8, wrong: [] })
  })
})

describe('tokens.json is extracted, not maintained', () => {
  /**
   * The check is "can it be rebuilt", not "does it match". Those differ: a file
   * that merely matches could have been hand-edited into agreement, and would
   * stop agreeing the next time anyone touched the CSS. Running the extractor
   * and requiring no change proves the JSON is a FUNCTION of the two platform
   * files, which is the property that lets a generator later run the other way.
   *
   * Gastos Diarios does the same in CI for the same reason, and their README
   * says it in one line worth keeping: it proves the files can be rebuilt, not
   * merely that they currently match.
   */
  it('re-running extract.py changes nothing', () => {
    const run = spawnSync('python3', [join(root, 'design-system/extract.py')], {
      cwd: root,
      encoding: 'utf8',
    })
    // Distinguish "python is missing" from "the tokens are stale". They are
    // different problems and the second one is the one this test is about.
    expect(run.error, 'no pude ejecutar python3 — ¿está instalado?').toBeUndefined()
    expect(`${run.status}: ${run.stdout.trim()}${run.stderr.trim()}`).toBe(
      '0: tokens.json is up to date'
    )
  })

  it('every colour token in the JSON is the pair both platforms hold', () => {
    const tokens = JSON.parse(readFileSync(join(root, 'design-system/tokens.json'), 'utf8'))
    const light = hexDeclarations(blockAt(':root'))
    const dark = hexDeclarations(blockAt('@media (prefers-color-scheme: dark)'))
    const ios = swiftTokens()

    // Only the opaque ones: `hexDeclarations` reads `#rrggbb`, and the alpha
    // tokens are stored as a base/alpha pair on purpose. The extractor is what
    // holds those, and the test above is what holds the extractor.
    type Token = {
      $value: { light: string | object; dark: string | object }
      $extensions?: { swift?: string }
    }
    const wrong: string[] = []
    let checked = 0
    for (const group of Object.values(tokens.color) as Record<string, Token>[]) {
      for (const [name, token] of Object.entries(group)) {
        const { light: l, dark: d } = token.$value
        if (typeof l !== 'string') continue
        checked += 1
        if (light.get(name) !== l || dark.get(name) !== d) {
          wrong.push(`--${name}: css ${light.get(name)}/${dark.get(name)} vs json ${l}/${d}`)
        }
        const swiftName = token.$extensions?.swift
        if (swiftName && String(ios.get(swiftName)) !== String([l, d])) {
          wrong.push(`${swiftName}: swift ${ios.get(swiftName)} vs json ${[l, d]}`)
        }
      }
    }
    // 25: the 6 core, 3 opaque accent, 3 mark, 3 opaque state, 2 member and 8
    // hue foregrounds. The whole `line` group and every `-soft` are alpha
    // pairs and are counted by the extractor test instead.
    expect({ checked, wrong }).toEqual({ checked: 25, wrong: [] })
  })
})

describe('the type scale is one scale, not two', () => {
  /**
   * Stock's web and iOS did not use the same sizes. Measured across tracked
   * files at the time this was written: 20 distinct sizes, 12 of them on ONE
   * platform. Some of that is a real design question — a screen title is 22 on
   * the web and 18 on iOS, the same role four pixels apart, and choosing is a
   * decision with a visible consequence.
   *
   * This test is NOT about that. It is about the other kind: a size used by one
   * platform sitting HALF A PIXEL from a size both platforms use. `13.5` beside
   * `13`, `14.5` beside `14`. Nobody chose those; they are what happens when two
   * people type a number into two files, and no eye can tell them apart. They
   * are drift, and drift is what a guard is for.
   *
   * The role disagreements are deliberately allowed through. A test that failed
   * on them would be asserting an answer nobody has given yet.
   */
  it('no size sits within half a pixel of a size both platforms use', () => {
    const tokens = JSON.parse(readFileSync(join(root, 'design-system/tokens.json'), 'utf8'))
    const sizes = Object.values(tokens.type).map((t: unknown) => {
      const token = t as { $value: string; $extensions: { 'stock.uses': { web: number; ios: number } } }
      return { px: parseFloat(token.$value), ...token.$extensions['stock.uses'] }
    })
    const shared = sizes.filter((s) => s.web > 0 && s.ios > 0).map((s) => s.px)
    const drift = sizes
      .filter((s) => s.web === 0 || s.ios === 0)
      .filter((s) => shared.some((c) => Math.abs(c - s.px) <= 0.5))
      .map((s) => `${s.px}px (web ${s.web}, ios ${s.ios}) está a medio píxel de ${
        shared.filter((c) => Math.abs(c - s.px) <= 0.5).join('/')
      }`)
    // The count is asserted so that a scale read as empty — a renamed key, a
    // changed `$extensions` shape — cannot pass by having nothing to check.
    expect({ counted: sizes.length, drift }).toEqual({ counted: sizes.length, drift: [] })
    expect(sizes.length).toBeGreaterThan(8)
  })
})

describe('typography is applied one way', () => {
  /**
   * `View.appFont(15, .semibold)`, never `Font.stock(15)`. Both produced the same
   * font; the difference is what a script can do with them.
   *
   * A modifier is a CALL SITE — it sits where the text is, so an emitter that
   * rewrites the scale can find it and a sweep like this one can count it. A
   * `Font` value can be assigned to a variable, stored in a model, returned from
   * a function, and applied three files away. Gastos Diarios settled on the
   * modifier for exactly that reason and its emitter assumes it, so adopting the
   * shape here is what lets one emitter serve both without a branch.
   *
   * Which means the old spelling coming back is not a style slip. It is a call
   * site the shared tooling cannot see, and nothing else would report it.
   */
  it('no Swift file applies a font the old way', () => {
    const files = execFileSync('git', ['ls-files', 'apps/ios/**/*.swift'], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean)

    const offenders: string[] = []
    let swept = 0
    for (const file of files) {
      const text = readFileSync(join(root, file), 'utf8')
      swept += 1
      text.split('\n').forEach((line, i) => {
        // Skip comments: this file's own doc comment names the old spelling in
        // order to explain why it is gone, and so does Theme.swift's.
        if (line.trimStart().startsWith('//')) return
        if (/\.font\(\s*\.stock/.test(line) || /Font\.stock\s*\(/.test(line)) {
          offenders.push(`${file}:${i + 1}`)
        }
      })
    }
    expect({ swept: swept > 20, offenders }).toEqual({ swept: true, offenders: [] })
  })
})
