import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '../../../../..')

/**
 * Every script of ours parses.
 *
 * `pnpm lint` is `pnpm --filter web lint`, so it sees `apps/web` and nothing
 * else. Measured before writing this: a deliberate syntax error in
 * `tools/seed-emulator.mjs` left typecheck, lint and all 291 tests green.
 * `node --check` on the file failed the whole time.
 *
 * What that costs depends on the file, and the cheap half hides the expensive
 * half. `seed-emulator.mjs` is run by CI before the E2E suite, so a broken one
 * turns that job red — late and with a confusing message, but red.
 * `round-trip.mjs`, `receipts-report.mjs` and the two shell scripts under
 * `tools/` are run by NOTHING in CI, by design in the first case. Those ship
 * broken with everything green and are found by a person typing the command.
 *
 * kyber arrived at the same check from the other end: theirs enumerated four
 * directories and missed a file that then sat unparsed. So the list here is
 * DERIVED — `git ls-files -co --exclude-standard`, tracked plus written-but-
 * not-yet-committed, which is the set a sweep wants when the question is "does
 * anything here have a problem" and the newest file is the likeliest one.
 */
function ourScripts(): string[] {
  return execFileSync('git', ['ls-files', '-co', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
    .split('\n')
    .filter(Boolean)
    // The submodule parses itself, and a clone without `--recurse-submodules`
    // has an empty directory there — a sweep that read it would be reporting on
    // whether somebody ran `git submodule update`.
    .filter((path) => !path.startsWith('kyber/'))
    // `git ls-files` still lists a path staged as added and then deleted.
    .filter((path) => existsSync(join(root, path)))
}

describe('every script of ours parses', () => {
  const scripts = ourScripts()
  const js = scripts.filter((p) => /\.(mjs|js)$/.test(p))
  const shell = scripts.filter((p) => /\.sh$/.test(p) || p.startsWith('.githooks/'))

  it('found scripts to check at all', () => {
    // Floors, not exact counts: the population is the tree and it grows. The
    // assertion that matters is per-file and names the file.
    expect(js.length).toBeGreaterThan(5)
    expect(shell.length).toBeGreaterThan(1)
  })

  it('every JavaScript file parses', () => {
    const broken = js
      .map((path) => ({ path, run: spawnSync('node', ['--check', join(root, path)], { encoding: 'utf8' }) }))
      .filter(({ run }) => run.status !== 0)
      .map(({ path, run }) => `${path}: ${run.stderr.split('\n').find((l) => l.includes('Error')) ?? 'no parse'}`)
    expect(broken).toEqual([])
  })

  it('every shell script parses, hooks included', () => {
    // `bash -n` reads without running, which is the only safe way to check a
    // file whose whole job is to do something.
    const broken = shell
      .map((path) => ({ path, run: spawnSync('bash', ['-n', join(root, path)], { encoding: 'utf8' }) }))
      .filter(({ run }) => run.status !== 0)
      .map(({ path, run }) => `${path}: ${run.stderr.trim().split('\n')[0] ?? 'no parse'}`)
    expect(broken).toEqual([])
  })
})
