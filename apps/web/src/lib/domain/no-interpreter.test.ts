import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * No value from a tracked file reaches an interpreter.
 *
 * The hook that ran `eval "$check"` on entries from `.kyber/config.json` was in
 * this repo for about an hour. It is a tracked file, so a branch that edits it
 * runs whatever it likes on the next push by whoever checked that branch out —
 * silently, because nobody reads a hook before pushing.
 *
 * The fix was to remove the interpreter rather than sanitise what reaches it,
 * since sanitising has to be right about quoting forever. This keeps one from
 * coming back: an audit is true on the day it is run, and a guard is true on
 * every run.
 *
 * `'unsafe-eval'` in next.config.ts is deliberately not matched — it is a CSP
 * directive naming what a browser may do, not a call.
 */
const root = join(__dirname, '../../../../..')

/** Our own tracked sources. The submodule holds itself to this separately. */
const ours = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter((path) => /\.(mjs|js|ts|tsx|sh)$/.test(path) && !path.startsWith('kyber/'))
  // `git ls-files` still lists a path that is staged-as-added and then deleted
  // from disk, which is what a half-cleaned probe leaves behind. Reading it
  // throws, and the failure looks like the sweep found something.
  .filter((path) => existsSync(join(root, path)))

/**
 * The needles are assembled at runtime so this file does not contain them.
 *
 * Written the obvious way, it flagged itself on its first tracked run — the
 * literal `shell: true` in the table below is a match. That is the third time
 * in two days that writing a guard required naming the thing it forbids, and
 * kyber hit it first: the fix is to build the needle, not to add an exception
 * for the file that carries it. An exception here would be the only one, and it
 * would cover exactly the file most likely to grow a second use.
 */
const SH = ['sh', 'ell'].join('')
const PATTERNS: [string, RegExp][] = [
  [`ev${'al'}(`, new RegExp(`(^|[^.\\w'"])ev${'al'}\\s*\\(`)],
  [`${SH}: true`, new RegExp(`${SH}:\\s*true`)],
  [`exec${'Sync'}`, new RegExp(`\\bexec${'Sync'}\\s*\\(`)],
  ['child_process.exec', new RegExp('(^|[^a-zA-Z])exec\\s*\\(\\s*[`\'"]')],
]

describe('nothing hands a tracked value to a shell', () => {
  it('found sources to read', () => {
    // Without this the sweep could return nothing and every check below would
    // pass on an empty set.
    expect(ours.length).toBeGreaterThan(30)
  })

  it.each(PATTERNS)('no file calls %s', (_label, pattern) => {
    const offenders = ours.filter((path) => {
      const text = readFileSync(join(root, path), 'utf8')
      return text.split('\n').some((line) => {
        const code = line.trimStart()
        // A pattern inside a comment is prose, not a call — and this file has
        // to name what it forbids in order to explain why. Skipping comments is
        // not the exception the needles avoid: that one was about the file
        // being unable to describe itself at all.
        if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return false
        return pattern.test(line)
      })
    })
    expect(offenders).toEqual([])
  })

  it('the hook spawns argv, and the config holds argv', () => {
    const hook = readFileSync(join(root, '.githooks/pre-push'), 'utf8')
    const config = JSON.parse(readFileSync(join(root, '.kyber/config.json'), 'utf8')) as {
      prePush: unknown[]
    }
    expect({
      noShell: hook.includes(`${SH}: false`),
      allArgv: config.prePush.every(
        (entry) => Array.isArray(entry) && entry.every((word) => typeof word === 'string'),
      ),
    }).toEqual({ noShell: true, allArgv: true })
  })
})
