import { execFileSync } from 'node:child_process'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
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

/** One token as tokens.json holds it. Declared once: two tests read it. */
type TokenEntry = {
  $value: { light: string | object; dark: string | object }
  $extensions?: { swift?: string }
}

/**
 * Same role, different naming convention on each side — DERIVED, not retyped.
 *
 * This was a hand-written table of 17 entries, and it was a third copy: the
 * mapping already lives in `extract.py`, which writes it into `tokens.json` as
 * `$extensions.swift`. All three agreed, which is exactly why nobody looked.
 *
 * Nothing coupled its COMPLETENESS. A rename would have been caught — the
 * assertion below looks the Swift name up and fails when it is missing — but a
 * token ADDED everywhere else and not here simply went unchecked, and the
 * suite stayed green over the smaller set. Measured before changing it:
 * deleting `ink-quaternary` from the old table left 10/10 passing.
 *
 * Derived, the 17 come back as 17: of the 24 tokens carrying a Swift name,
 * seven are alpha pairs that `hexDeclarations` cannot read, and the remaining
 * seventeen are these. The `hue-*` tokens name no Swift identifier at all —
 * `Theme.hue()` is a switch, not a flat list of `static let`.
 */
function roles(): Record<string, string> {
  const tokens = JSON.parse(readFileSync(join(root, 'design-system/tokens.json'), 'utf8'))
  const out: Record<string, string> = {}
  for (const group of Object.values(tokens.color) as Record<string, TokenEntry>[]) {
    for (const [name, token] of Object.entries(group)) {
      const swiftName = token.$extensions?.swift
      // Opaque only: the alpha tokens are a base/alpha pair by design, and the
      // declaration reader below matches `#rrggbb`.
      if (swiftName && typeof token.$value.light === 'string') out[name] = swiftName
    }
  }
  return out
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

    const mapping = roles()
    // A FLOOR, not the exact 17. The derivation existed for twenty minutes
    // asserting `toBe(17)` before kyber named what is wrong with that: a total
    // answers "how many" to a question that is "which". Adding an eighteenth
    // token correctly would have failed with `expected 18 to be 17`, naming
    // nothing and demanding the number be bumped by hand — which is the
    // hand-maintained list coming back in through a different door.
    //
    // A floor still catches the failure the count was for, a derivation that
    // returns nothing. Everything else is named by the assertions inside the
    // loop: a token added to tokens.json and not to Theme.swift fails with
    // that token's name in the message, which is the whole point of deriving.
    // Every other sweep in this repo already used a floor; this was the one
    // exact count among them.
    expect(Object.keys(mapping).length).toBeGreaterThan(10)

    for (const [cssName, swiftName] of Object.entries(mapping)) {
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

describe('tokens.json can generate both platforms back', () => {
  /**
   * The other direction from extract.py, and the stronger claim. `extract.py`
   * proves the files, run through it, produce the committed tokens.json.
   * `emit.py --write` proves the OPPOSITE: tokens.json, run through it,
   * produces the committed files. Together they are a two-way lock — a hand
   * edit on either side of the loop breaks at least one of them, because it
   * would have to be the coincidence of matching what the other direction
   * independently derives.
   *
   * Gastos Diarios runs the same check as a CI step rather than a vitest test,
   * because the failure it is guarding — a hand edit to one platform's colour
   * that the other platform never got — is exactly how their dark warning text
   * fell under the AA contrast floor on the web only, for months. `ci.yml` runs
   * `emit.py --write` and requires `git diff --exit-code` on the three files;
   * this test is the fast, local echo of that, run on every `pnpm test`.
   */
  it('re-running emit.py --write changes none of the three files', () => {
    const targets = [
      'apps/web/src/app/globals.css',
      'apps/ios/Stock/Design/Theme.swift',
      'apps/ios/StockWatch/WatchTheme.swift',
    ]
    const before = targets.map((t) => readFileSync(join(root, t), 'utf8'))
    const run = spawnSync('python3', [join(root, 'design-system/emit.py'), '--write'], {
      cwd: root,
      encoding: 'utf8',
    })
    const after = targets.map((t) => readFileSync(join(root, t), 'utf8'))
    // Restore immediately, success or failure, so a red run here does not
    // itself leave the repo mid-rewrite for whatever runs next.
    targets.forEach((t, i) => writeFileSync(join(root, t), before[i]))
    expect(run.error, 'no pude ejecutar python3 — ¿está instalado?').toBeUndefined()
    expect(run.status, run.stderr).toBe(0)
    const changed = targets.filter((_, i) => after[i] !== before[i])
    expect(changed).toEqual([])
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
    const wrong: string[] = []
    let checked = 0
    for (const group of Object.values(tokens.color) as Record<string, TokenEntry>[]) {
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

describe('every text-on-neutral pair clears WCAG AA', () => {
  /**
   * Relative luminance per WCAG 2.x: linearise each sRGB channel, weight and
   * sum them, then (lighter + 0.05) / (darker + 0.05) is the contrast ratio.
   * 4.5:1 is the AA floor for regular text; nothing checked here is large
   * enough (≥18pt, or ≥14pt bold) to claim the lower 3:1 exception — measured
   * against `text-ink-2/-3/-4`'s actual call sites, the smallest sizes in the
   * app, not the largest.
   *
   * This was found by measuring one flagged pair (`ink-secondary` on
   * `surface`, noted at 3.70:1) and turning out to be three tokens against
   * TWO backgrounds: `ground` is the tighter one every time, because it sits
   * further from white than `surface` does. `ink-quaternary` was the worst —
   * 2.52:1 — and had never been flagged at all; 11 call sites render it as
   * body text today.
   */
  function relativeLuminance(hex: string): number {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  function contrast(a: string, b: string): number {
    const [la, lb] = [relativeLuminance(a), relativeLuminance(b)]
    const [hi, lo] = la > lb ? [la, lb] : [lb, la]
    return (hi + 0.05) / (lo + 0.05)
  }

  it('ink-2, ink-3 and ink-4 reach 4.5:1 against ground and surface, in light mode', () => {
    const tokens = JSON.parse(readFileSync(join(root, 'design-system/tokens.json'), 'utf8'))
    const ink = (name: string) => tokens.color.core[name].$value.light as string
    const ground = ink('ground')
    const surface = ink('surface')
    const wrong: string[] = []
    let checked = 0
    for (const name of ['ink-secondary', 'ink-tertiary', 'ink-quaternary']) {
      for (const [bgName, bg] of [['ground', ground], ['surface', surface]] as const) {
        checked += 1
        const ratio = contrast(ink(name), bg)
        if (ratio < 4.5) wrong.push(`${name} on ${bgName}: ${ratio.toFixed(2)}:1`)
      }
    }
    // The count is asserted because a renamed or removed token would
    // otherwise leave nothing to check and this would report a clean pass.
    expect({ checked, wrong }).toEqual({ checked: 6, wrong: [] })
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
