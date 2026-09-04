import { describe, expect, it } from 'vitest'
import { batchTooBig, MAX_BATCH_ROWS } from './mutations'

/**
 * `Cerrar compra` and `Agregar todo` are documented as ONE atomic write, and
 * this is the guard that keeps that true. They used to commit every 100 rows in
 * sequence, so above that a failure left half a shop applied while CLAUDE.md
 * still called it atomic.
 *
 * 166 and not 500: Firestore caps a batch at 500 operations and the heaviest
 * caller writes three per row — the item, its move, and the delete of the list
 * row.
 */
describe('batchTooBig', () => {
  it('fits exactly at the cap', () => {
    expect(batchTooBig(MAX_BATCH_ROWS)).toBeNull()
    expect(batchTooBig(0)).toBeNull()
  })

  it('refuses one past it, and says what to do', () => {
    const message = batchTooBig(MAX_BATCH_ROWS + 1)
    expect(message).not.toBeNull()
    // The number is in the message: "too many" without saying how many leaves
    // the person guessing at a list they cannot see the length of.
    expect(message).toContain(String(MAX_BATCH_ROWS))
    expect(message).toContain('167')
  })

  it('stays under the 500-op limit at three writes per row', () => {
    expect(MAX_BATCH_ROWS * 3).toBeLessThanOrEqual(500)
  })
})
