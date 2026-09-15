import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '../../../../..')

/**
 * No radius is written as a literal where a token should name it.
 *
 * Written BEFORE the radius tokens exist, on purpose. A guard that arrives
 * after the thing it guards is born green and nobody knows whether it looks at
 * anything; this one's first run failed with every literal in the repo listed,
 * which is the only cheap proof that it reads the tree.
 *
 * It exists because nothing did. Measured before writing it: `rounded-[13px]`
 * — a value nobody ever chose — planted in `primitives.tsx` left all 294 tests
 * green. There was no check anywhere that a radius was on the scale, so the
 * scale was whatever anyone typed.
 *
 * `rounded-full` is deliberately allowed and is not an exception being carved
 * out: a capsule is not a measurement, it is "as round as it goes", and giving
 * it a pixel value would be inventing precision the design does not have.
 */
const ALLOWED_TAILWIND = new Set(['full'])

/** The radius tokens `globals.css` declares, as `role -> px`. */
function tokens(): Map<string, number> {
  const css = readFileSync(join(root, 'apps/web/src/app/globals.css'), 'utf8')
  const out = new Map<string, number>()
  for (const m of css.matchAll(/--radius-([a-z]+):\s*(\d+)px;/g)) out.set(m[1], Number(m[2]))
  return out
}

function componentSources(): string[] {
  return execFileSync('git', ['ls-files', '-co', '--exclude-standard', 'apps/web/src'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((path) => path.endsWith('.tsx'))
}

describe('every radius comes from a token', () => {
  it('found components to check at all', () => {
    expect(componentSources().length).toBeGreaterThan(20)
    expect(tokens().size).toBeGreaterThan(3)
  })

  it('no component writes a radius as a literal', () => {
    const declared = tokens()
    const literals: string[] = []

    for (const path of componentSources()) {
      const text = readFileSync(join(root, path), 'utf8')
      text.split('\n').forEach((line, i) => {
        // Comments name these classes when they explain them — `globals.css`
        // does exactly that two lines above `--radius-field`, and a count that
        // read it reported one use too many earlier today.
        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) return

        for (const m of line.matchAll(/rounded-\[(\d+)px\]/g)) {
          const px = Number(m[1])
          const role = [...declared].find(([, value]) => value === px)?.[0]
          literals.push(
            role
              ? `${path}:${i + 1} — rounded-[${px}px] is rounded-${role}, written by hand`
              : `${path}:${i + 1} — rounded-[${px}px] names no role`
          )
        }
        // Tailwind's own named steps are literals too, in a costume: `lg` is a
        // number this design system never chose.
        for (const m of line.matchAll(/\brounded-(\w+)\b/g)) {
          const name = m[1]
          if (declared.has(name) || ALLOWED_TAILWIND.has(name)) continue
          if (/^\[/.test(name)) continue
          literals.push(`${path}:${i + 1} — rounded-${name} is Tailwind's scale, not this one`)
        }
      })
    }

    expect(literals).toEqual([])
  })
})
