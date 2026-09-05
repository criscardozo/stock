import { describe, expect, it } from 'vitest'
import { taxonomyFrom, type Entry } from './TaxonomySheet'

/**
 * What the taxonomy sheet actually stores.
 *
 * This is a unit test and not an e2e on purpose. A map field comes back from
 * Firestore's JS SDK in the order it was written, so on the web the ordering
 * survives with every `sortOrder` set to zero and NO browser assertion can tell
 * the difference — measured, by flattening it and watching the whole suite pass.
 *
 * iOS decodes the same map into a Swift `Dictionary`, which has no order at
 * all, so there the field is the only thing that says what comes first. Which
 * makes this the one place the value can be pinned.
 */
const row = (id: string, name = id): Entry => ({ id, name, hue: 'violet', icon: 'inventory_2' })

describe('taxonomyFrom', () => {
  it('numbers sortOrder from the position, strictly increasing', () => {
    const out = taxonomyFrom([row('a'), row('b'), row('c')], false)
    expect(out.a.sortOrder).toBe(0)
    expect(out.b.sortOrder).toBe(10)
    expect(out.c.sortOrder).toBe(20)
    // The property that matters, stated as itself: two entries sharing a
    // sortOrder have no defined order on the phone.
    const orders = Object.values(out).map((e) => e.sortOrder)
    expect(new Set(orders).size).toBe(orders.length)
  })

  it('renumbers after a move, rather than preserving the old gaps', () => {
    const out = taxonomyFrom([row('c'), row('a'), row('b')], false)
    expect(out.c.sortOrder).toBeLessThan(out.a.sortOrder)
    expect(out.a.sortOrder).toBeLessThan(out.b.sortOrder)
  })

  it('drops a row whose name was emptied, and trims the rest', () => {
    const out = taxonomyFrom([row('a', '  Alacena  '), row('b', '   '), row('c')], false)
    expect(Object.keys(out)).toEqual(['a', 'c'])
    expect(out.a.name).toBe('Alacena')
    // And the survivors are renumbered from their new positions, not left with
    // the hole the deleted row used to occupy.
    expect(out.c.sortOrder).toBe(20)
  })

  it('gives a category a kind and a location none', () => {
    // `kind` decides whether recipes may use it, and the rules accept either
    // map — so a category written without one silently leaves the recipes.
    expect(taxonomyFrom([row('a')], true).a).toHaveProperty('kind', 'food')
    expect(taxonomyFrom([{ ...row('a'), kind: 'household' }], true).a).toHaveProperty(
      'kind',
      'household',
    )
    expect(taxonomyFrom([row('a')], false).a).not.toHaveProperty('kind')
  })
})
