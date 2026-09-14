import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ICON_NAMES, materialSymbolsHref } from './icons'

/**
 * The subsetted font asks Google for exactly the glyphs in `ICON_NAMES`, so the
 * list and the code have to agree in both directions.
 *
 * Missing a name is a silent, visual failure: Material Symbols renders by
 * ligature, so a glyph that was not subsetted in appears as the literal word —
 * `remove_shopping_cart`, mid-screen, in the app font. Nothing throws, no test
 * fails, and it only shows up to whoever opens that screen.
 *
 * An extra name is the cheaper direction and still worth holding: it is weight
 * nobody renders, and it is how a list stops describing the app.
 */
const root = join(__dirname, '../../../../..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const sources = execFileSync('git', ['ls-files', '-co', '--exclude-standard', 'apps/web/src'], {
  cwd: root,
  encoding: 'utf8',
})
  .split('\n')
  .filter((path) => path.endsWith('.tsx'))

/**
 * Every icon name written as a literal anywhere in the components.
 *
 * Three shapes carry one, and the first version of this knew only the first:
 *
 *   <Icon name="close" />                    the component directly
 *   <PrimaryAction icon="login" />           a wrapper that forwards to Icon
 *   { id: 'plan', icon: 'calendar_month' }   a table of tabs or labels
 *
 * Missing the second is how `login` — the icon on the button of the first
 * screen anyone sees — ended up outside the subset while this file reported
 * everything covered. Casting a wider net risks collecting a string that is not
 * an icon, and that is the cheap direction: it fails the "asks for nothing the
 * app does not render" test below, which names it, instead of hiding.
 */
function namesInCode(): Map<string, string> {
  const found = new Map<string, string>()
  const remember = (name: string, path: string) => found.set(name, path)
  for (const path of sources) {
    const text = read(path)
    // `name="x"` and `icon="x"` as plain JSX attributes.
    for (const m of text.matchAll(/\b(?:name|icon)="([a-z0-9_]+)"/g)) remember(m[1], path)
    // `icon: 'x'` inside an object literal — tab tables, label maps.
    for (const m of text.matchAll(/\bicon:\s*'([a-z0-9_]+)'/g)) remember(m[1], path)
    // Braced expressions: take the branches, drop what is being compared
    // against. In `name={status === 'low' ? 'arrow_downward' : 'check_circle'}`
    // only the branches are icons; `'low'` is the comparand. An earlier version
    // collected both and reported four item states as missing glyphs.
    for (const m of text.matchAll(/\b(?:name|icon)=\{([\s\S]{0,200}?)\}/g)) {
      const branches = m[1].replace(/[!=]==\s*'[a-z0-9_]+'/g, '')
      for (const lit of branches.matchAll(/'([a-z0-9_]+)'/g)) remember(lit[1], path)
    }
  }
  return found
}

/** The icon of every category and location the household starts with. */
function namesInTaxonomies(): Map<string, string> {
  const found = new Map<string, string>()
  for (const file of ['shared/categories.json', 'shared/locations.json'] as const) {
    // Only the array values: these files also carry a `$comment` string, and
    // iterating that as a list yields characters and an `undefined` icon.
    const parsed = JSON.parse(read(file)) as Record<string, unknown>
    for (const list of Object.values(parsed)) {
      if (!Array.isArray(list)) continue
      for (const entry of list as { icon?: string }[]) {
        if (entry.icon !== undefined) found.set(entry.icon, file)
      }
    }
  }
  return found
}

describe('the subsetted icon list', () => {
  const used = new Map([...namesInCode(), ...namesInTaxonomies()])

  it('found icons to check at all', () => {
    // A regex that stops matching would otherwise leave both directions empty
    // and both assertions true.
    expect({ files: sources.length, used: used.size }).toEqual({
      files: sources.length,
      used: used.size,
    })
    expect(sources.length).toBeGreaterThan(20)
    expect(used.size).toBeGreaterThan(30)
  })

  it('covers every icon the app renders', () => {
    const missing = [...used]
      .filter(([name]) => !(ICON_NAMES as readonly string[]).includes(name))
      .map(([name, where]) => `${name} (${where})`)
    expect(missing).toEqual([])
  })

  it('asks for nothing the app does not render', () => {
    expect(ICON_NAMES.filter((name) => !used.has(name))).toEqual([])
  })

  it('the comment does not claim a count that has drifted', () => {
    // `icons.ts` opens by saying how many glyphs this app uses, next to the two
    // measured sizes that justify subsetting. A number written in prose beside a
    // list that grows is the shape that goes stale in silence — this file's list
    // went 50 → 54 → 65 in one afternoon.
    const stated = read('apps/web/src/lib/design/icons.ts').match(/uses (\d+) glyphs/)
    expect(Number(stated?.[1])).toBe(ICON_NAMES.length)
  })

  it('the URL carries the list and the display mode', () => {
    const href = materialSymbolsHref()
    expect({
      names: href.includes(`icon_names=${ICON_NAMES.join(',')}`),
      // Without display=block the ligature shows as its own word while the font
      // loads — the exact failure the subsetting can also cause permanently.
      block: href.includes('display=block'),
    }).toEqual({ names: true, block: true })
  })
})
