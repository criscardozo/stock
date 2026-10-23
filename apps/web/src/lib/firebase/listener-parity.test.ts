import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Both clients ask Firestore for the same documents.
 *
 * Gastos Diarios holds its bounded listeners together across web and iOS — same
 * order, same direction, same limit — because past the cap each client would
 * otherwise see a different subset and disagree about what exists. Stock has
 * no bounded LISTENER at all: every live listener is a whole collection whose
 * size is known (items, recipes, shoppingList) or a single document, and the
 * one collection that grows forever, `moves`, is read once with a limit. So the
 * same question takes two shapes here:
 *
 *   1. the two clients listen to the same set of targets, with the same
 *      modifiers — and neither listens to `moves`, which is the CLAUDE.md rule
 *      the free tier depends on;
 *   2. every query with a `limit` filters, orders and caps identically, because
 *      a history of 20 on one phone and 50 on the other is two answers to
 *      "what happened to this item".
 *
 * Both sides are READ from the source, and the population is every listener /
 * every limited query found in either app, compared both ways — a target that
 * exists on one client only fails by name. Nothing below writes a collection
 * name down, so it is not one more copy to keep in step.
 */

const root = join(import.meta.dirname, '../../../../..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

/** Tracked plus untracked-not-ignored, same set as ports.test.ts. */
function sourceFiles(): string[] {
  return execFileSync('git', ['ls-files', '-co', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
    .split('\n')
    .filter(Boolean)
}

const webFiles = () =>
  sourceFiles().filter((p) => /^apps\/web\/src\/.*\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p))
const iosFiles = () =>
  sourceFiles().filter((p) => /^apps\/ios\/.*\.swift$/.test(p) && !p.startsWith('apps/ios/StockTests/'))

/** The text of the call whose `(` sits at `open`, up to its matching `)`. */
function balanced(text: string, open: number): string {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')' && --depth === 0) return text.slice(open + 1, i)
  }
  throw new Error(`unbalanced call at ${open}`)
}

/** First top-level argument of an argument list. */
function firstArg(args: string): string {
  let depth = 0
  for (let i = 0; i < args.length; i++) {
    if ('([{'.includes(args[i])) depth++
    else if (')]}'.includes(args[i])) depth--
    else if (args[i] === ',' && depth === 0) return args.slice(0, i)
  }
  return args
}

interface Target {
  /** `doc households/mealPlans`, `collection households/items`. */
  path: string
  modifiers: string[]
  where: string
}

const label = (t: Target) => `${t.path}${t.modifiers.length ? ` [${t.modifiers.join(', ')}]` : ''}`

// --- web ---------------------------------------------------------------------

/** Path segments are literals, or file-level `const X = '…'` names. */
function webTarget(expression: string, where: string, text: string): Target {
  const consts = new Map([...text.matchAll(/const (\w+) = '(\w+)'/g)].map((m) => [m[1], m[2]]))
  const names = [...expression.matchAll(/'(\w+)'|\b([A-Z_]+)\b/g)]
    .map((m) => m[1] ?? consts.get(m[2]))
    .filter((n): n is string => n !== undefined)
  const kind = /^\s*doc\(/.test(expression) ? 'doc' : 'collection'
  return { path: `${kind} ${names.filter((n) => !/^(asc|desc)$/.test(n)).join('/')}`, modifiers: [], where }
}

function webListeners(): Target[] {
  return webFiles().flatMap((file) => {
    const text = read(file)
    return [...text.matchAll(/\bonSnapshot\(/g)].map((m) => {
      const call = balanced(text, (m.index as number) + m[0].length - 1)
      const target = firstArg(call)
      // Only the collection-path literals: modifiers carry field names too.
      const path = target.replace(/,\s*(where|orderBy|limit)\([\s\S]*$/, ')')
      const t = webTarget(path, file, text)
      if (/\blimit\(/.test(target)) t.modifiers.push('limit')
      if (/\bwhere\(/.test(target)) t.modifiers.push('where')
      if (/\borderBy\(/.test(target)) t.modifiers.push('orderBy')
      if (/includeMetadataChanges:\s*true/.test(call)) t.modifiers.push('metadata')
      return t
    })
  })
}

// --- iOS ---------------------------------------------------------------------

/**
 * The receiver chain ending just before `index`: the line it is on, plus every
 * line above that continues it with a leading `.`, with whatever opens the
 * statement (`listeners.append(`, `x = `) cut off.
 */
function swiftChain(text: string, index: number): string {
  const lines = text.slice(0, index).split('\n')
  const chain = [lines.pop() as string]
  // The call's own line may hold nothing but indentation: `.addSnapshotListener`
  // opened it.
  while (/^\s*(\.|$)/.test(chain[0]) && lines.length) chain.unshift(lines.pop() as string)
  const joined = chain.map((l) => l.trim()).join('')
  return joined.replace(/^.*?(?:append\(|=\s)/, '').replace(/^(?:try\s+|await\s+)*/, '')
}

/** Expand a leading local (`root.`) or helper call (`household(x).`). */
function swiftResolve(chain: string, text: string): string {
  const head = chain.match(/^(\w+)(\([^)]*\))?(?=\.|$)/)
  if (head === null || head[1] === 'db' || head[1] === 'Firestore') return chain
  const local = head[2]
    ? text.match(new RegExp(`func ${head[1]}\\([^)]*\\)[^{]*\\{\\s*([^\\n]+)`))
    : text.match(new RegExp(`let ${head[1]} = ([^\\n]+)`))
  expect(local, `${head[1]} resolves to a Firestore reference`).not.toBeNull()
  return swiftResolve(`${(local as RegExpMatchArray)[1].trim()}${chain.slice(head[0].length)}`, text)
}

function swiftTarget(chain: string, where: string): Target {
  const names = [...chain.matchAll(/\.collection\("(\w+)"\)/g)].map((m) => m[1])
  const kind = /\.document\([^)]*\)$/.test(chain.replace(/\.(whereField|order|limit)\(.*$/, '')) ? 'doc' : 'collection'
  return { path: `${kind} ${names.join('/')}`, modifiers: [], where }
}

function iosListeners(): Target[] {
  return iosFiles().flatMap((file) => {
    const text = read(file)
    return [...text.matchAll(/\.addSnapshotListener\b/g)].map((m) => {
      const at = m.index as number
      const chain = swiftResolve(swiftChain(text, at), text)
      const t = swiftTarget(chain, file)
      if (/\.limit\(to:/.test(chain)) t.modifiers.push('limit')
      if (/\.whereField\(/.test(chain)) t.modifiers.push('where')
      if (/\.order\(by:/.test(chain)) t.modifiers.push('orderBy')
      if (/^\.addSnapshotListener\(includeMetadataChanges: true\)/.test(text.slice(at))) t.modifiers.push('metadata')
      return t
    })
  })
}

// --- limited queries ---------------------------------------------------------

interface Bounded {
  path: string
  where: string[]
  order: string
  limit: number
  file: string
}

const describeBounded = (b: Bounded) =>
  `where ${b.where.join('+') || '(none)'}, order ${b.order}, limit ${b.limit}`

/** A limit written as a name resolves through the parameter default. */
function resolveLimit(raw: string, text: string, pattern: (id: string) => RegExp, file: string): number {
  if (/^\d+$/.test(raw)) return Number(raw)
  const m = text.match(pattern(raw))
  expect(m, `${file}: limit ${raw} resolves to a number`).not.toBeNull()
  return Number((m as RegExpMatchArray)[1])
}

function webBounded(): Bounded[] {
  return webFiles().flatMap((file) => {
    const text = read(file)
    return [...text.matchAll(/\bquery\(/g)].flatMap((m) => {
      const args = balanced(text, (m.index as number) + m[0].length - 1)
      const limit = args.match(/\blimit\((\w+)\)/)
      if (limit === null) return []
      const order = args.match(/orderBy\('(\w+)'(?:,\s*'(asc|desc)')?\)/)
      return [
        {
          path: webTarget(firstArg(args), file, text).path,
          where: [...args.matchAll(/where\('(\w+)',\s*'([^']+)'/g)].map((w) => `${w[1]} ${w[2]}`).sort(),
          order: order === null ? '(none)' : `${order[1]} ${order[2] ?? 'asc'}`,
          limit: resolveLimit(limit[1], text, (id) => new RegExp(`\\b${id}\\s*=\\s*(\\d+)`), file),
          file,
        },
      ]
    })
  })
}

function iosBounded(): Bounded[] {
  return iosFiles().flatMap((file) => {
    const text = read(file)
    return [...text.matchAll(/\.limit\(to: (\w+)\)/g)].map((m) => {
      // The whole statement: the chain above the limit plus its continuations.
      const after = text.slice(m.index as number).split('\n')
      let end = (m.index as number) + after[0].length
      for (const line of after.slice(1)) {
        if (!/^\s*\./.test(line)) break
        end += line.length + 1
      }
      const chain = swiftResolve(swiftChain(text, end), text)
      const order = chain.match(/\.order\(by: "(\w+)"(, descending: true)?\)/)
      const ops: Record<string, string> = { isEqualTo: '==' }
      return {
        path: swiftTarget(chain, file).path,
        where: [...chain.matchAll(/\.whereField\("(\w+)", (\w+):/g)]
          .map((w) => `${w[1]} ${ops[w[2]] ?? w[2]}`)
          .sort(),
        order: order === null ? '(none)' : `${order[1]} ${order[2] ? 'desc' : 'asc'}`,
        limit: resolveLimit(m[1], text, (id) => new RegExp(`\\b${id}: Int = (\\d+)`), file),
        file,
      }
    })
  })
}

// --- the comparisons ---------------------------------------------------------

/** Both ways, by name: what one side has and the other lacks. */
function oneSided(web: string[], ios: string[]): string[] {
  const count = (xs: string[]) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())
  const w = count(web)
  const i = count(ios)
  return [...new Set([...w.keys(), ...i.keys()])].sort().flatMap((key) => {
    const a = w.get(key) ?? 0
    const b = i.get(key) ?? 0
    if (a === b) return []
    return [`${key}: ${a} on the web, ${b} on iOS`]
  })
}

describe('both clients ask for the same documents', () => {
  it('listen to the same targets, with the same modifiers, and never to moves', () => {
    const web = webListeners()
    const ios = iosListeners()
    // Floor, not exact: the anti-empty check. Completeness is the comparison
    // below, which sees a listener added on either side.
    expect(web.length).toBeGreaterThan(4)
    expect(ios.length).toBeGreaterThan(4)
    const problems = oneSided(web.map(label), ios.map(label))
    for (const t of [...web, ...ios]) {
      if (t.path.split(' ')[1].split('/').includes('moves')) {
        problems.push(`${t.where}: listens to moves, which grows forever — read it once with a limit`)
      }
    }
    expect(problems, problems.join('\n')).toEqual([])
  })

  it('filter, order and cap every limited query identically', () => {
    const web = webBounded()
    const ios = iosBounded()
    expect(web.length).toBeGreaterThan(0)
    expect(ios.length).toBeGreaterThan(0)
    const key = (b: Bounded) => `${b.path}: ${describeBounded(b)}`
    const problems = oneSided(web.map(key), ios.map(key))
    expect(problems, problems.join('\n')).toEqual([])
  })
})
