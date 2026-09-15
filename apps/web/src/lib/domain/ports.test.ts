import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The emulator ports, which live in ten places and are decided in one.
 *
 * `firebase/firebase.json` is what the emulator actually binds. Other files
 * repeat the numbers as defaults and none of them can read it: the web client,
 * the seeder, the rules-test helper, the e2e specs, the CSP, the CI wait-on,
 * and iOS. Change the first and the rest keep pointing at whatever was there
 * before. This comment used to say how many, and the count went stale the day
 * two specs were added — so the list below is the count, and the last test
 * here is what keeps the list honest.
 *
 * The failure that makes this worth a test is not "the emulator does not start"
 * — that one is loud. It is the other one. On this machine an SSH forward holds
 * 4000, 8080, 8085, 9099, 9150 and 9199: the whole Firebase default set, plus
 * the 8085 this project used to use.
 *
 * And there is no probe that can tell the difference. Measured on 2026-09-07,
 * all three answering at once:
 *
 *              GET /    a document that does not exist        households
 *   ours        Ok      Firestore's own 404 JSON              1
 *   8085 fwd    Ok      "Not Found", plain text               not JSON
 *   8080 fwd    Ok      Firestore's own 404 JSON, identical   0
 *
 * `Ok` from all three, so "it answered Ok, it is the emulator" is worth
 * nothing — an earlier version of this comment claimed otherwise. Worse, 8080
 * forwards to a REAL Firestore emulator that is simply empty: same 404 body
 * character for character, and no shape probe can separate it from ours. Gastos
 * Diarios found that one and it is what makes the conclusion general — the only
 * thing that distinguishes them is data WE seeded.
 *
 * So this file is the protection, and a probe is not. A port block nobody else
 * uses, plus a guard that forces every copy of the number to agree. There is
 * nothing to detect at runtime; there is only not being in the neighbourhood.
 *
 * If one of these fails, make the numbers equal. Do not update the expectation.
 */
const root = join(__dirname, '../../../../..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const firebaseJson = JSON.parse(read('firebase/firebase.json')) as {
  emulators: {
    auth: { port: number }
    firestore: { port: number; websocketPort: number }
    ui: { port: number }
  }
}
const AUTH = firebaseJson.emulators.auth.port
const FIRESTORE = firebaseJson.emulators.firestore.port
const WEBSOCKET = firebaseJson.emulators.firestore.websocketPort
/** Every number under `emulators`, whatever the key — `singleProjectMode` is a
 *  boolean and drops out on its own. */
const OURS = Object.values(firebaseJson.emulators as Record<string, unknown>)
  .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
  .flatMap((entry) => Object.values(entry))
  .filter((value): value is number => typeof value === 'number')

/**
 * Ports the prose is allowed to name because they are NOT ours: Firebase's
 * stock set, Gastos Diarios', the SSH forwards that were measured, and the two
 * dev servers. Historical constants — they do not move when our block moves.
 */
const FOREIGN = [4000, 4400, 4500, 8080, 8085, 9000, 9099, 9150, 9199]

/** The number after `?? ` or `default: ` on the line naming `marker`. */
function fallbackIn(path: string, marker: string): number {
  const line = read(path)
    .split('\n')
    .find((l) => l.includes(marker))
  if (line === undefined) throw new Error(`no encontré "${marker}" en ${path}`)
  const match = line.match(/(?:\?\?|default:)\s*'?(\d+)'?/)
  if (!match) throw new Error(`no encontré un default en «${line.trim()}» de ${path}`)
  return Number(match[1])
}

/**
 * The files this repo actually ships, asked of git rather than walked.
 *
 * The walk it replaces carried a hand-written skip list — `node_modules`,
 * `.agents`, `docs/design`, `build-*`, `Pods` — every entry of which was a
 * directory git already ignores. A list that duplicates `.gitignore` is a
 * second copy of the same decision, and the copies drift.
 *
 * It also settles the submodule without an exception. `git ls-files` reports a
 * gitlink as ONE entry and does not descend into it, so `kyber/` is outside the
 * sweep by construction rather than by a name somebody has to keep aligned with
 * `.gitmodules`. That matters more than tidiness here: a clone without
 * `--recurse-submodules` has an empty `kyber/`, so a sweep that read it would
 * pass or fail depending on the machine.
 *
 * `-co --exclude-standard` is tracked plus untracked-not-ignored, so a new
 * spec that nobody has `git add`ed yet is still swept — which is the case the
 * probe file in this suite's own controls exercises.
 */
function sourceFiles(): string[] {
  return execFileSync('git', ['ls-files', '-co', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
    .split('\n')
    .filter(Boolean)
}

/** Every file that repeats a port as a `??` default. */
function filesWithPortDefaults(): string[] {
  return sourceFiles().filter(
    (path) => /\.(ts|tsx|mjs|js)$/.test(path) && /_EMULATOR_PORT\b[^\n]*\?\?/.test(read(path)),
  )
}

describe('every default follows firebase.json', () => {
  const cases: [string, string, number][] = [
    ['apps/web/src/lib/firebase/client.ts', 'NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT', FIRESTORE],
    ['apps/web/src/lib/firebase/client.ts', 'NEXT_PUBLIC_AUTH_EMULATOR_PORT', AUTH],
    ['tools/seed-emulator.mjs', 'FIRESTORE_EMULATOR_PORT', FIRESTORE],
    ['tools/seed-emulator.mjs', 'AUTH_EMULATOR_PORT', AUTH],
    ['apps/web/e2e/recipes.spec.ts', 'NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT', FIRESTORE],
    ['apps/web/e2e/write-errors.spec.ts', 'NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT', FIRESTORE],
    ['apps/web/e2e/taxonomy.spec.ts', 'NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT', FIRESTORE],
    ['apps/web/e2e/settings.spec.ts', 'NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT', FIRESTORE],
    ['apps/web/e2e/shopping.spec.ts', 'NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT', FIRESTORE],
    ['apps/ios/Stock/App/StockApp.swift', '-firestorePort', FIRESTORE],
    ['apps/ios/Stock/App/StockApp.swift', '-authPort', AUTH],
  ]

  for (const [path, marker, expected] of cases) {
    it(`${path.split('/').pop()} · ${marker}`, () => {
      expect(fallbackIn(path, marker)).toBe(expected)
    })
  }

  it('every copy agrees, whether or not the loop above generates anything', () => {
    // The loop is for readable output — one named test per file. It is not the
    // guarantee: replace `cases` with an empty array in the `for` and the
    // suite still went green on 16 tests, because the list was intact and only
    // the it() calls stopped happening. Gastos Diarios lost half a guard to
    // exactly that and their tripwire, like mine, watched the list.
    //
    // So the guarantee lives here, in one test that iterates internally. The
    // loop can be deleted; this cannot be deleted without deleting a test.
    const wrong = cases
      .filter(([path, marker, expected]) => fallbackIn(path, marker) !== expected)
      .map(([path, marker]) => `${path} · ${marker}`)
    // FLOOR, and the branch is worth declaring because this case does not fit
    // the two the rule names. `cases` is typed in this file, which by the
    // letter of "exact when the test fixes the population" would make an exact
    // count right. It is not: the list enumerates an OPEN set — every site in
    // the repo that defaults a port — and that set grows when the app does.
    //
    // What makes a floor safe here is that completeness is enforced somewhere
    // else: `every file with a port default is on the list above` sweeps the
    // tree and fails when a site is missing from this list. So this test asks
    // "does each known site name the right port" and that one asks "is any
    // site missing". An exact count here would add churn and guard nothing the
    // sweep does not already guard.
    //
    // `checked` is displayed, not asserted — it compares to itself. It is here
    // so a failure shows the size of the set it was reading.
    expect({ checked: cases.length, wrong }).toEqual({ checked: cases.length, wrong: [] })
    expect(cases.length).toBeGreaterThan(9)
  })

  it('CI waits on the ports the emulator binds', () => {
    const ci = read('.github/workflows/ci.yml')
    expect(ci).toContain(`tcp:${AUTH} tcp:${FIRESTORE}`)
  })

  it('the CSP allows the emulators it will actually talk to', () => {
    // The websocket is here because leaving it out was worse than not covering
    // it. Moving `websocketPort` used to fail exactly one test — the CLAUDE.md
    // prose guard — so the fix it prompted was to edit the sentence, which
    // turns the suite green and leaves this line pointing at the old port. A
    // guard that goes green on a partial fix aims you at it.
    const config = read('apps/web/next.config.ts')
    expect(config).toContain(`http://127.0.0.1:${FIRESTORE}`)
    expect(config).toContain(`http://127.0.0.1:${AUTH}`)
    expect(config).toContain(`ws://127.0.0.1:${WEBSOCKET}`)
  })

  it('every file with a port default is on the list above', () => {
    // The list is hand-written, so it can only prove that what it names
    // agrees. It cannot prove it names everything — and it did not: the server
    // polls added to settings.spec.ts and shopping.spec.ts brought two more
    // defaults that sat uncovered for days. Gastos Diarios hit the same shape
    // in a restore check that walked a hardcoded set of root collections: it
    // compared everything it had, without comparing that it had everything.
    //
    // So this walks the tree instead of trusting the list. A new file with a
    // port default fails here until it is registered.
    const listed = new Set(cases.map(([path]) => path))
    expect(filesWithPortDefaults().filter((path) => !listed.has(path))).toEqual([])
  })

  it('the guard hardcodes none of the ports it holds', () => {
    // Gastos Diarios' rule, and their reasoning: a guard that keeps the ports
    // together should not spell one, because then IT is another copy nobody
    // couples. This file had two — the measurement table, and, exactly, the
    // comment explaining that stale sentences about ports are a failure mode.
    // Both were hidden behind an explicit `!path.endsWith('ports.test.ts')`
    // I wrote myself, twenty minutes after refusing a per-line escape hatch in
    // the docs.
    //
    // Foreign numbers stay allowed: they are historical constants and naming
    // 8080 is the point of naming it.
    const self = read('apps/web/src/lib/domain/ports.test.ts')
    const spelled = OURS.filter((port) => new RegExp(`\\b${port}\\b`).test(self))
    expect(spelled).toEqual([])
  })

  it('no default is a Firebase stock port', () => {
    // Not a style rule. On this machine every stock port is taken by an SSH
    // forward that answers 200 — being one number away from the defaults is
    // being in the neighbourhood where that happens.
    const stock = [4000, 4400, 4500, 8080, 9000, 9099, 9150, 9199]
    for (const port of [AUTH, FIRESTORE, firebaseJson.emulators.ui.port]) {
      expect(stock).not.toContain(port)
    }
  })
})

/**
 * The same coupling, for the sentences.
 *
 * The block above holds ten copies of the number in code. The docs hold more,
 * and they are the ones that rot silently: `docs/reglas.md` and
 * `docs/plan-mejoras.md` both said "Auth 9098, UI 4001" for two days after the
 * ports moved. Those sentences were TRUE when written. No initial
 * measurement catches that — the only thing that does is a guard that re-reads
 * them every run.
 *
 * Gastos Diarios named this failure mode: half of their false comments were
 * about their own artefacts and had simply expired. A false sentence has three
 * destinations — it can invite wasted work, stop someone looking, or send them
 * to the wrong place. A stale port does the third, which is the expensive one:
 * you go to 9098, something answers, and it is not us.
 *
 * So: any 4xxx/8xxx/9xxx a doc names must be a port we bind now or one of the
 * FOREIGN ones we mention on purpose. When this fails the doc is out of date,
 * not the test.
 */
describe('no doc names a port we no longer bind', () => {
  // Not a hand-written list. Deleting one line from it dropped a doc from the
  // sweep and left 22 green tests saying nothing was wrong — Gastos Diarios
  // lost half a guard to exactly that, in a refactor, and reported it working.
  // A list you can silently shorten is not coverage.
  const docs = sourceFiles().filter((path) => path.endsWith('.md'))

  it('the sweep found docs at all', () => {
    // Without this, a walk that returns nothing generates no tests and the
    // suite goes green on zero coverage. That is the shape that ate half of
    // Gastos Diarios' guard: the tests did not fail, they stopped existing.
    expect(docs.length).toBeGreaterThan(6)
  })

  it('no doc names a dead port, whether or not the loop below runs', () => {
    const stale = docs.flatMap((path) => {
      const found = [...new Set([...read(path).matchAll(/\b([489]\d{3})\b/g)].map((m) => Number(m[1])))]
      const bad = found.filter((port) => !OURS.includes(port) && !FOREIGN.includes(port))
      return bad.length > 0 ? [`${path}: ${bad.join(', ')}`] : []
    })
    expect({ swept: docs.length, stale }).toEqual({ swept: docs.length, stale: [] })
    expect(docs.length).toBeGreaterThan(6)
  })

  for (const path of docs) {
    it(path, () => {
      const found = [...read(path).matchAll(/\b([489]\d{3})\b/g)].map((m) => Number(m[1]))
      const stale = [...new Set(found)].filter(
        (port) => !OURS.includes(port) && !FOREIGN.includes(port),
      )
      expect(stale).toEqual([])
    })
  }
})
