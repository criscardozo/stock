import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `.kyber/config.json` — what this repo tells the shared scripts about itself.
 *
 * Every value in it is a copy of something that already exists somewhere else:
 * the project id lives in three scripts, the emulator id in eleven files, the
 * iOS target names in `project.yml`, the PWA port in CI and in CLAUDE.md. A
 * config is not a source of truth — it is one more copy, and the failure it
 * invites is the quietest kind: a shared script does exactly what the file says
 * while the file stopped describing the repo.
 *
 * So the config ships with this, and the sweeps below look for VALUES rather
 * than walking a hand-written list of files. A new script that spells a project
 * id differently fails here without anybody remembering to register it — which
 * is the shape Gastos Diarios' rename bug had, where nine files kept the right
 * id and two did not.
 */
const root = join(__dirname, '../../../../..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const config = JSON.parse(read('.kyber/config.json')) as {
  name: string
  projectId: string
  rulesTestsProjectId: string
  emulatorProjectId: string
  firebaseDir: string
  rulesTestsDir: string
  iosDir: string
  iosTargets: string[]
  webWorkspace: string
  pwa: { port: number; entry: string; precachedRoutes: string[]; minStaticAssets: number }
  prePush: string[]
}

/** Tracked and untracked-but-not-ignored files; never descends into a submodule. */
const sourceFiles = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], {
  cwd: root,
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean)

const code = sourceFiles.filter((path) => /\.(ts|tsx|mjs|js|swift|yml|yaml)$/.test(path))

/** Every distinct `<prefix>-…` identifier spelled anywhere in code. */
function spellings(prefix: string): Record<string, string[]> {
  const found: Record<string, string[]> = {}
  for (const path of code) {
    for (const match of read(path).matchAll(new RegExp(`\\b${prefix}-[a-z0-9-]+\\b`, 'g'))) {
      ;(found[match[0]] ??= []).push(path)
    }
  }
  return found
}

describe('.kyber/config.json describes this repo', () => {
  it('every `qcris-` id in code is the one the config declares', () => {
    // Not "the config value appears somewhere" — that passes while a second,
    // wrong spelling sits in the one script nobody opened.
    expect(Object.keys(spellings('qcris'))).toEqual([config.projectId])
  })

  it('every `demo-` id in code is the emulator id the config declares', () => {
    expect(Object.keys(spellings('demo'))).toEqual([
      ...new Set([config.emulatorProjectId, config.rulesTestsProjectId]),
    ])
  })

  it('iosTargets names the targets that carry a version', () => {
    // Names, not a count. `set-version` will read this instead of its own
    // IOS_TARGETS constant, and a count cannot say WHICH target went missing.
    // Only the `targets:` block: `options`, `packages` and `schemes` all have
    // two-space keys too, and `schemes` repeats the target names — a first
    // version of this test counted four because of that. Line-based on purpose:
    // the second version sliced with index arithmetic and returned zero, which
    // is the same failure wearing the opposite result.
    const lines = read(join(config.iosDir, 'project.yml')).split('\n')
    const withVersion: string[] = []
    let section = ''
    let target = ''
    for (const line of lines) {
      if (/^\w/.test(line)) {
        section = line.replace(':', '')
        target = ''
      } else if (section === 'targets' && /^ {2}\w+:$/.test(line)) {
        target = line.trim().replace(':', '')
      } else if (target !== '' && line.includes('MARKETING_VERSION:')) {
        withVersion.push(target)
        target = ''
      }
    }
    expect(withVersion).toEqual(config.iosTargets)
  })

  it('the directories it names exist and hold what it implies', () => {
    const firebaseJson = JSON.parse(read(join(config.firebaseDir, 'firebase.json'))) as {
      emulators?: { firestore?: { port?: number } }
    }
    expect({
      firestorePort: typeof firebaseJson.emulators?.firestore?.port,
      rulesTests: existsSync(join(root, config.rulesTestsDir, 'package.json')),
      webName: (JSON.parse(read(`apps/${config.webWorkspace}/package.json`)) as { name: string }).name,
    }).toEqual({ firestorePort: 'number', rulesTests: true, webName: config.webWorkspace })
  })

  it('the PWA block matches the service worker and CI', () => {
    const shell = read('apps/web/public/sw.js').match(/const SHELL = \[([^\]]*)\]/)?.[1] ?? ''
    const routes = [...shell.matchAll(/'([^']+)'/g)].map((m) => m[1])
    const ci = read('.github/workflows/ci.yml')
    expect({
      entryIsFirst: routes[0] === config.pwa.entry,
      precachedAreShell: config.pwa.precachedRoutes.every((r) => routes.includes(r)),
      ciStart: ci.includes(`next start -p ${config.pwa.port}`),
      ciWaitOn: ci.includes(`http://localhost:${config.pwa.port}${config.pwa.entry}`),
      claudeMd: read('CLAUDE.md').includes(`-p ${config.pwa.port}`),
      verifyThreshold: read('apps/web/scripts/verify-pwa.mjs').includes(`>= ${config.pwa.minStaticAssets}`),
    }).toEqual({
      entryIsFirst: true,
      precachedAreShell: true,
      ciStart: true,
      ciWaitOn: true,
      claudeMd: true,
      verifyThreshold: true,
    })
  })

  it('prePush names commands this repo actually has', () => {
    const scripts = Object.keys(
      (JSON.parse(read(`apps/${config.webWorkspace}/package.json`)) as { scripts: object }).scripts,
    )
    const named = config.prePush.map((command) => command.split(' ').pop() ?? '')
    expect(named.filter((script) => !scripts.includes(script))).toEqual([])
  })
})

describe('the submodule is actually here', () => {
  it('kyber has content, not just a gitlink', () => {
    // An uninitialised submodule is an empty directory, and everything that
    // points into it goes quiet rather than loud: `@kyber/docs/*` in CLAUDE.md
    // imports nothing, and the scripts fail with ERR_MODULE_NOT_FOUND far from
    // the cause. This is the one place that says the real reason.
    const missing = [
      'kyber/README.md',
      'kyber/scripts/lib/consumer.mjs',
      'kyber/docs/publicar.md',
    ].filter((path) => !existsSync(join(root, path)))
    expect({ missing, hint: 'git submodule update --init' }).toEqual({
      missing: [],
      hint: 'git submodule update --init',
    })
  })
})

describe('nothing the bundle ships comes from the submodule', () => {
  it('no file under apps/web/src imports from kyber/', () => {
    // Vercel cannot clone a private submodule — not a permission, a documented
    // limit — so every deploy builds with `kyber/` empty and stays green. The
    // warning it prints is permanent, which makes reading the log worth
    // nothing: it says the same thing on the day it matters and on every other
    // day. This is the part that only speaks when something changed.
    //
    // Scripts, tests, hooks and CI are unaffected: they run where the submodule
    // is there. The line is the deployed bundle.
    const offenders = execFileSync('git', ['ls-files', '-co', '--exclude-standard', 'apps/web/src'], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\n')
      .filter((path) => /\.(ts|tsx|css)$/.test(path))
      .filter((path) => /from\s+['"][^'"]*kyber\/|@import\s+['"][^'"]*kyber\//.test(read(path)))
    expect({
      offenders,
      why: 'Vercel builds with kyber/ empty; this would be Module not found in production',
    }).toEqual({
      offenders: [],
      why: 'Vercel builds with kyber/ empty; this would be Module not found in production',
    })
  })
})
