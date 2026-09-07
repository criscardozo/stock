import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The emulator ports, which live in ten places and are decided in one.
 *
 * `firebase/firebase.json` is what the emulator actually binds. Nine other
 * files repeat the numbers as defaults and none of them can read it: the web
 * client, the seeder, the rules-test helper, three e2e specs, the CSP, the CI
 * wait-on, and iOS. Change the first and the rest keep pointing at whatever was
 * there before.
 *
 * The failure that makes this worth a test is not "the emulator does not start"
 * — that one is loud. It is the other one. On this machine an SSH forward holds
 * 4000, 8080, 8085, 9099, 9150 and 9199 — the whole Firebase default set — and
 * it answers HTTP 200 with the body "Not Found". So `wait-on tcp:8085` passes,
 * a REST probe gets a 200, and the JSON has no `documents` in it. Gastos
 * Diarios hit exactly that and read
 * `TypeError: Cannot read properties of undefined (reading 'find')`, which says
 * nothing whatsoever about a port.
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

describe('every default follows firebase.json', () => {
  const cases: [string, string, number][] = [
    ['apps/web/src/lib/firebase/client.ts', 'NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT', FIRESTORE],
    ['apps/web/src/lib/firebase/client.ts', 'NEXT_PUBLIC_AUTH_EMULATOR_PORT', AUTH],
    ['tools/seed-emulator.mjs', 'FIRESTORE_EMULATOR_PORT', FIRESTORE],
    ['tools/seed-emulator.mjs', 'AUTH_EMULATOR_PORT', AUTH],
    ['firebase/rules-tests/test/helpers.ts', 'FIRESTORE_EMULATOR_PORT', FIRESTORE],
    ['apps/web/e2e/recipes.spec.ts', 'NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT', FIRESTORE],
    ['apps/web/e2e/write-errors.spec.ts', 'NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT', FIRESTORE],
    ['apps/web/e2e/taxonomy.spec.ts', 'NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT', FIRESTORE],
    ['apps/ios/Stock/App/StockApp.swift', '-firestorePort', FIRESTORE],
    ['apps/ios/Stock/App/StockApp.swift', '-authPort', AUTH],
  ]

  for (const [path, marker, expected] of cases) {
    it(`${path.split('/').pop()} · ${marker}`, () => {
      expect(fallbackIn(path, marker)).toBe(expected)
    })
  }

  it('CI waits on the ports the emulator binds', () => {
    const ci = read('.github/workflows/ci.yml')
    expect(ci).toContain(`tcp:${AUTH} tcp:${FIRESTORE}`)
  })

  it('the CSP allows the emulators it will actually talk to', () => {
    const config = read('apps/web/next.config.ts')
    expect(config).toContain(`http://127.0.0.1:${FIRESTORE}`)
    expect(config).toContain(`http://127.0.0.1:${AUTH}`)
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
