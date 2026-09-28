import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every write the screens make is heard when the server refuses it.
 *
 * Firestore applies a write to the local cache at once and only reports a
 * refusal later, so a write nobody listens to fails invisibly: the screen shows
 * the change, the server does not have it. `reportWrite` is where a refusal
 * becomes the dialog. It was wired into seventeen calls, and four were missed —
 * adding a suggestion, a new recipe, materialising the plan, generating an
 * invite — with nothing to say so. This is what says so.
 *
 * Accepted: `reportWrite(write(…))`, and the onboarding's `run(() => write(…))`,
 * which awaits inside a try and shows the error on the form. NOT accepted: a
 * bare `await write(…)`. That was the invite button — awaited, never caught, an
 * unhandled rejection inside an onClick.
 *
 * Which exports are writes is DERIVED from mutations.ts — a function whose body
 * reaches a Firestore write — rather than listed here, so a new mutation is
 * covered the day it is written.
 */
const root = join(__dirname, '../../../../..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const WRITE_PRIMITIVE =
  /\b(updateDoc|setDoc|deleteDoc|addDoc|inBatches|updateItem|updateHousehold)\(|\.commit\(/

function writes(): string[] {
  const source = read('apps/web/src/lib/firebase/mutations.ts')
  const parts = source.split(/\n(?=export )/)
  return parts
    .map((part) => ({ name: part.match(/^export (?:async )?function (\w+)/)?.[1], part }))
    .filter((p): p is { name: string; part: string } => !!p.name && WRITE_PRIMITIVE.test(p.part))
    .map((p) => p.name)
}

function screens(): string[] {
  return execFileSync('git', ['ls-files', '-co', '--exclude-standard', 'apps/web/src/app', 'apps/web/src/components'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((f) => /\.tsx?$/.test(f) && !f.includes('.test.'))
}

describe('every write a screen makes can be heard failing', () => {
  const names = writes()
  const call = new RegExp(`\\b(${names.join('|')})\\(`)

  it('found the writes, and not the reads', () => {
    // Anti-void, and a check that the derivation reads the right thing.
    expect(names.length).toBeGreaterThan(15)
    expect(names).toContain('closeShopping')
    expect(names).not.toContain('recentMoves')
    expect(names).not.toContain('newInviteCode')
  })

  it('no call to a write goes unreported', () => {
    const sites: string[] = []
    const unheard: string[] = []
    for (const file of screens()) {
      read(file)
        .split('\n')
        .forEach((line, i) => {
          if (/^\s*(\/\/|\*|import )/.test(line) || !call.test(line)) return
          sites.push(file)
          const name = line.match(call)![1]
          if (line.includes(`reportWrite(${name}(`) || line.includes(`run(() => ${name}(`)) return
          unheard.push(`${file.replace('apps/web/src/', '')}:${i + 1}  ${line.trim()}`)
        })
    }
    expect(sites.length).toBeGreaterThan(20)
    expect(unheard).toEqual([])
  })
})
