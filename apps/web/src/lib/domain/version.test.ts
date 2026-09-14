import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The version, which lives in four places and is shown in two.
 *
 * `apps/web/package.json` reaches the web screen through `next.config.ts`
 * (NEXT_PUBLIC_APP_VERSION → VersionCard). `apps/ios/project.yml` carries
 * MARKETING_VERSION once per target — app, widget, watch — and that reaches
 * Ajustes through CFBundleShortVersionString. Nothing reads anything else.
 *
 * Before this guard the web said `0.1.0` and iOS said `0.1`: the same product,
 * the same day, two numbers on two screens that each state it plainly. That is
 * worse than showing nothing, and it is quiet — the two strings look like the
 * same version unless you read them twice.
 *
 * `pnpm set-version x.y.z` moves them together. This is what notices when it
 * did not.
 */
const root = join(__dirname, '../../../../..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const APP_WORKSPACE = (
  JSON.parse(read('.kyber/config.json')) as { webWorkspace: string }
).webWorkspace
const webVersion = (JSON.parse(read(`apps/${APP_WORKSPACE}/package.json`)) as { version: string })
  .version
const projectYml = read('apps/ios/project.yml')
const marketing = [...projectYml.matchAll(/MARKETING_VERSION: "([^"]*)"/g)].map((m) => m[1])

describe('one version, four copies', () => {
  it('the web version is x.y.z', () => {
    expect(webVersion).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('every iOS target carries the web version', () => {
    expect({ targets: marketing.length, versions: [...new Set(marketing)] }).toEqual({
      targets: 3,
      versions: [webVersion],
    })
  })

  // The test that lived here coupled `IOS_TARGETS = 3` in this repo's own
  // set-version.mjs to the real target count. That script moved to kyber and
  // takes the NAMES from .kyber/config.json instead of carrying a constant, so
  // there is no second copy left to hold — and the coupling that replaced it,
  // config names against project.yml, is in kyber-config.test.ts. Deleted
  // rather than re-pointed: a guard whose subject no longer exists is the thing
  // this suite spends its time removing.

  it('every target hands CFBundleShortVersionString to MARKETING_VERSION, not a literal', () => {
    // MARKETING_VERSION is the build setting. CFBundleShortVersionString is
    // the Info.plist key Ajustes actually reads (SettingsScreen.swift). The
    // first two tests above held the setting to 1.0.0 on all three targets and
    // went green while the app target's plist said `'0.1'` — a literal in
    // project.yml that overrides the setting, so the phone showed 0.1 under a
    // green guard. The guard measured the noun, not the connection.
    const shortVersions = [...projectYml.matchAll(/CFBundleShortVersionString: (\S+)/g)].map((m) => m[1])
    const bundleVersions = [...projectYml.matchAll(/CFBundleVersion: (\S+)/g)].map((m) => m[1])
    expect({ short: shortVersions, bundle: bundleVersions }).toEqual({
      short: Array(marketing.length).fill('$(MARKETING_VERSION)'),
      bundle: Array(marketing.length).fill('$(CURRENT_PROJECT_VERSION)'),
    })
  })

  it('the generated Info.plist files agree, so xcodegen was actually run', () => {
    // The plists are XcodeGen output AND tracked, so this reads what the app
    // will ship without needing Xcode — it runs in the Linux CI job. It is the
    // half the yml check cannot cover: edit project.yml, forget `xcodegen`, and
    // the yml says $(MARKETING_VERSION) while the plist still says 0.1.
    const plists = ['apps/ios/Stock/Info.plist', 'apps/ios/StockWidget/Info.plist', 'apps/ios/StockWatch/Info.plist']
    expect(plists.length).toBe(marketing.length)
    const shipped = Object.fromEntries(
      plists.map((path) => [
        path,
        read(path).match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]*)<\/string>/)?.[1] ?? '(missing)',
      ]),
    )
    expect(shipped).toEqual(Object.fromEntries(plists.map((p) => [p, '$(MARKETING_VERSION)'])))
  })

  it('every manifest that is not the app stays out of it', () => {
    // The workspace manifests are deliberately NOT copies of the version: never
    // published, never displayed, so they are pinned at 0.0.0 rather than kept
    // in step. If this fails, someone "fixed" them and created more numbers for
    // a human to remember. Put them back.
    //
    // Asked of git rather than listed, which is Gastos Diarios' form and the
    // stronger one: a literal list is complete only until the next workspace
    // package, and the day it stops being complete it says nothing. The gitlink
    // keeps kyber out by itself — `git ls-files` reports `kyber` as one entry
    // and never matches `*package.json` inside it.
    const manifests = execFileSync('git', ['ls-files', '*package.json'], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean)
      .filter((path) => path !== `apps/${APP_WORKSPACE}/package.json`)

    const wrong = manifests
      .map((path) => [path, (JSON.parse(read(path)) as { version: string }).version] as const)
      .filter(([, version]) => version !== '0.0.0')
      .map(([path, version]) => `${path}: ${version}`)

    expect({ checked: manifests.length, wrong }).toEqual({ checked: manifests.length, wrong: [] })
    expect(manifests.length).toBeGreaterThan(2)
  })
})

describe('the declared version is findable in the history', () => {
  /**
   * Every other copy of the version says WHAT version this is. The tag is the
   * only one that lets you go back: a report against "1.1.0" on the Ajustes
   * screen is reachable with `git checkout v1.1.0`, and a tag is the only thing
   * `git bisect` can walk. Without it the version a person is looking at is not
   * locatable in the history.
   */
  const tags = execFileSync('git', ['tag', '--list', 'v*'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)

  it('there are tags to look at', () => {
    // Kept apart from the check below on purpose, because the two failures look
    // alike and mean opposite things. No tags at all is a shallow clone —
    // `actions/checkout` fetches none unless asked — and reading it as "this
    // version is untagged" sends someone to tag what is already tagged, and
    // turns the guard red on every release commit in CI until somebody silences
    // it.
    expect({
      tags: tags.length,
      hint: 'si es 0 en CI, al checkout le falta `fetch-tags: true`',
    }).toEqual({ tags: tags.length, hint: 'si es 0 en CI, al checkout le falta `fetch-tags: true`' })
    expect(tags.length).toBeGreaterThan(0)
  })

  it('this version has one', () => {
    expect({
      missing: tags.includes(`v${webVersion}`) ? [] : [`v${webVersion}`],
      hint: `git tag -a v${webVersion} -m "v${webVersion}" && git push --follow-tags`,
    }).toEqual({
      missing: [],
      hint: `git tag -a v${webVersion} -m "v${webVersion}" && git push --follow-tags`,
    })
  })
})
