import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `kyber/stack.json` says what version of everything the three apps run. This
 * says whether this repo still does.
 *
 * Nothing here synchronises anything: every tool below reads its own file and
 * cannot be told to read kyber's. pnpm resolves `catalog:` from
 * pnpm-workspace.yaml, Actions reads `node-version:` from the workflow,
 * XcodeGen reads `SWIFT_VERSION` from project.yml. The copies are obligatory.
 * What is not obligatory is nobody noticing when one of them drifts, which is
 * what happened to `firebase` — 12.18 here, 12.19 there, for days, with every
 * suite green on both sides.
 *
 * The comparison is on the DECLARED string, not the resolved one: what a
 * lockfile settles on is each repo's own business and Dependabot moves it. Two
 * repos agreeing on `^12.19.0` while their lockfiles sit on different patches
 * is the intended state.
 */
const root = join(__dirname, '../../../../..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const json = (path: string) => JSON.parse(read(path)) as Record<string, never>

const stack = json('kyber/stack.json')
const workspace = read('pnpm-workspace.yaml')
const rootPkg = json('package.json') as unknown as {
  packageManager: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}
const webPkg = json('apps/web/package.json') as unknown as {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}
const projectYml = read('apps/ios/project.yml')
const ci = read('.github/workflows/ci.yml')

/** The value in the catalog block of pnpm-workspace.yaml. */
const catalog = (name: string) => {
  // The key may be bare (`typescript:`) or quoted (`"@types/node":`), because
  // YAML needs the quotes for anything starting with `@`. The first version of
  // this only matched the bare form and reported `@types/node` as undeclared —
  // a probe failure that reads exactly like drift.
  const escaped = name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  return workspace.match(new RegExp(`^\\s+["']?${escaped}["']?:\\s*(\\S+)`, 'm'))?.[1]
}

/** What this repo declares, per key in stack.json. `undefined` means "nowhere". */
const declared: Record<string, string | undefined> = {
  pnpm: rootPkg.packageManager?.replace('pnpm@', ''),
  node: ci.match(/node-version:\s*'?(\S+?)'?\s*$/m)?.[1],
  java: ci.match(/java-version:\s*'?([^'\s]+)'?/)?.[1],
  typescript: catalog('typescript'),
  vitest: catalog('vitest'),
  firebase: catalog('firebase'),
  'firebase-tools': rootPkg.devDependencies?.['firebase-tools'] ?? rootPkg.dependencies?.['firebase-tools'],
  'firebase-admin':
    rootPkg.dependencies?.['firebase-admin'] ?? rootPkg.devDependencies?.['firebase-admin'],
  '@types/node': catalog('@types/node'),
  swift: projectYml.match(/SWIFT_VERSION: "([^"]+)"/)?.[1],
  'firebase-ios-sdk': projectYml.match(/firebase-ios-sdk[\s\S]{0,120}?from: "?([\d.]+)/)?.[1],
  'GoogleSignIn-iOS': projectYml.match(/GoogleSignIn[\s\S]{0,120}?from: "?([\d.]+)/)?.[1],
  next: webPkg.dependencies?.next,
  react: webPkg.dependencies?.react,
  tailwindcss: webPkg.devDependencies?.tailwindcss,
}

describe('this repo runs the stack kyber declares', () => {
  const entries = Object.entries(stack).filter(([key]) => !key.startsWith('$')) as [
    string,
    { value: string; required: boolean },
  ][]

  it('the whole stack is accounted for', () => {
    // Not decoration: a key added to stack.json that nothing here knows how to
    // read would otherwise pass by being silently skipped.
    expect(entries.map(([key]) => key).filter((key) => !(key in declared))).toEqual([])
    expect(entries.length).toBeGreaterThan(10)
  })

  it('every declared version is the shared one', () => {
    const wrong = entries
      .filter(([key, { value }]) => declared[key] !== undefined && declared[key] !== value)
      .map(([key, { value }]) => `${key}: this repo says ${declared[key]}, kyber says ${value}`)
    expect(wrong).toEqual([])
  })

  it('nothing required is missing', () => {
    // Optional is for what a consumer legitimately does not use — the third app
    // has no PWA and no next-intl. Required is the toolchain everyone has.
    const missing = entries
      .filter(([key, { required }]) => required && declared[key] === undefined)
      .map(([key]) => key)
    expect(missing).toEqual([])
  })
})
