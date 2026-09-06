import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EXPIRING_WITHIN_DAYS } from './items'
import { LIMITS } from '@/components/settings/TaxonomySheet'
import { FIELD_LIMITS } from './limits'

/**
 * Numbers this project writes down more than once.
 *
 * `tokens.test.ts` does this for the palette. These are the other copies, and
 * they are the ones a comment was holding together rather than a mechanism.
 *
 * The failure they prevent is specific: a value moves on one side, its own test
 * is updated because the test asserts the literal, and the other side stays put
 * with BOTH suites green. Nothing is broken enough to notice — the two files are
 * each valid on their own, and each is internally consistent. Gastos Diarios hit
 * exactly this with a 48-hour window written twice, and found it by going to
 * read every comment that invoked the other platform.
 *
 * If one of these fails, the fix is to make the values equal, not to update the
 * expectation.
 */
const root = join(__dirname, '../../../../..')

/** The number after a Swift or a rules declaration, or a failure that says which. */
function numberFrom(file: string, pattern: RegExp): number {
  const text = readFileSync(join(root, file), 'utf8')
  const match = text.match(pattern)
  if (!match) throw new Error(`no encontré ${pattern} en ${file}`)
  return Number(match[1])
}

describe('the expiry window is one number, not two', () => {
  it('matches ItemState.swift', () => {
    // Nothing else couples these. The shared shopping vectors — which DO couple
    // the suggestion thresholds — never look at expiry, so this constant sat
    // outside every net the two platforms share. The absence of vectors and the
    // absence of coupling were the same absence.
    expect(EXPIRING_WITHIN_DAYS).toBe(
      numberFrom('apps/ios/Stock/Domain/ItemState.swift', /expiringWithinDays\s*=\s*(\d+)/),
    )
  })
})

describe('the taxonomy caps are the rules, not a guess about them', () => {
  // The sheet stops the user at these numbers so the server does not have to
  // refuse the write. Raise one in firestore.rules without raising the other and
  // the app is merely stricter than it needs to be; raise it here without
  // raising the rules and the user fills a form that is then rejected, which is
  // the write-error dialog firing for something the screen could have known.
  it('matches the categories cap', () => {
    expect(LIMITS.categories).toBe(
      numberFrom('firebase/firestore.rules', /d\.categories is map && d\.categories\.size\(\) <= (\d+)/),
    )
  })

  it('matches the locations cap', () => {
    expect(LIMITS.locations).toBe(
      numberFrom('firebase/firestore.rules', /d\.locations is map && d\.locations\.size\(\) <= (\d+)/),
    )
  })
})

describe('the form caps are the rules, not a second opinion', () => {
  // A rejected write does not look rejected: Firestore applies it to the local
  // cache first, so the person sees it saved and then gets an error dialog about
  // it. These caps stop that at the input — which only works while they are the
  // SAME numbers.
  it('caps the household name where the rules do', () => {
    expect(FIELD_LIMITS.householdName).toBe(
      numberFrom('firebase/firestore.rules', /d\.name is string && d\.name\.size\(\) > 0 && d\.name\.size\(\) <= (\d+)/),
    )
  })

  it("caps a recipe's short name where the rules do", () => {
    expect(FIELD_LIMITS.recipeShortName).toBe(
      numberFrom('firebase/firestore.rules', /d\.shortName\.size\(\) > 0 && d\.shortName\.size\(\) <= (\d+)/),
    )
  })
})
