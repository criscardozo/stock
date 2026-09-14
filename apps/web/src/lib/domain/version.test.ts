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

const webVersion = (JSON.parse(read('apps/web/package.json')) as { version: string }).version
const projectYml = read('apps/ios/project.yml')
const marketing = [...projectYml.matchAll(/MARKETING_VERSION: '([^']*)'/g)].map((m) => m[1])

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

  it('set-version knows how many targets there are', () => {
    // The script refuses to write unless it finds exactly IOS_TARGETS of them,
    // which only helps while that number is the true one. Add a target, update
    // project.yml, forget the script, and it starts refusing every release for
    // a reason nobody will guess from the message.
    const declared = read('scripts/set-version.mjs').match(/IOS_TARGETS = (\d+)/)
    expect(Number(declared?.[1])).toBe(marketing.length)
  })

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

  it('the private packages stay out of it', () => {
    // Deliberately NOT copies. They are workspace plumbing — never published,
    // never displayed — so they are pinned at 0.0.0 rather than kept in step.
    // If this fails, someone "fixed" them and created three more copies for a
    // human to remember. Put them back.
    const versions = ['package.json', 'tools/package.json', 'firebase/rules-tests/package.json'].map(
      (path) => (JSON.parse(read(path)) as { version: string }).version,
    )
    expect(versions).toEqual(['0.0.0', '0.0.0', '0.0.0'])
  })
})
