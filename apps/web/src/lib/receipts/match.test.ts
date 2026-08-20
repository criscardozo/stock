import { describe, expect, it } from 'vitest'
import type { Item } from '@/lib/domain/types'
import { matchLines, priceForItem, similarity } from './match'
import type { ReceiptLine } from './parse'

function item(partial: Partial<Item> & { id: string; name: string }): Item {
  return {
    categoryId: 'almacen',
    locationId: 'alacena',
    tracking: 'quantity',
    unit: 'unit',
    quantity: 1,
    minQuantity: 0,
    barcodes: [],
    ...partial,
  } as Item
}

function line(raw: string, extra: Partial<ReceiptLine> = {}): ReceiptLine {
  return {
    raw,
    name: raw,
    quantity: 1,
    kilos: null,
    unitPriceCents: 100,
    totalCents: 100,
    section: null,
    ...extra,
  }
}

describe('matchLines', () => {
  const soy = item({
    id: 'soy',
    name: 'Coles Regular Soy Milk 1L',
    nameEs: 'Leche de soja',
    receiptNames: ['COLES DRINK SOY:REGU 1LITRE'],
  })

  it('matches a line the household already confirmed, in the other format', () => {
    const [m] = matchLines([line('COLES DRINK SOY:REGU 1LITRE')], [soy])
    expect(m.status).toBe('known')
    expect(m.item?.id).toBe('soy')
  })

  it("matches the item's own name too, so the first receipt lands", () => {
    const [m] = matchLines([line('Coles Regular Soy Milk 1L')], [soy])
    expect(m.item?.id).toBe('soy')
  })

  it('ignores case and outer space, since the same shop prints both ways', () => {
    const [m] = matchLines([line('  coles drink soy:regu 1litre ')], [soy])
    expect(m.item?.id).toBe('soy')
  })

  it('leaves an unseen product unknown rather than guessing', () => {
    const [m] = matchLines([line('Coles Mozzarella Pear 500g')], [soy])
    expect(m.status).toBe('unknown')
    expect(m.item).toBeNull()
  })

  it('offers near names as an ordering, never as a decision', () => {
    const eggs = item({ id: 'eggs', name: 'Coles Cage Free Eggs 12 Pack 700g', nameEs: 'Huevos' })
    const [m] = matchLines([line('Coles Cage Free Eggs 18 Pack 900g')], [eggs, soy])
    // Similar enough to offer first, but still the person's call.
    expect(m.status).toBe('unknown')
    expect(m.item).toBeNull()
    expect(m.suggestions[0]?.id).toBe('eggs')
  })

  it('can suggest through the Spanish name', () => {
    const onion = item({ id: 'onion', name: 'Cebolla', nameEs: 'Cebolla' })
    const [m] = matchLines([line('CEBOLLA BROWN')], [onion])
    expect(m.suggestions[0]?.id).toBe('onion')
  })
})

describe('similarity', () => {
  it('ignores the noise every Coles line carries', () => {
    // "Coles", sizes and units are in every name and say nothing.
    expect(similarity('Coles Simply Salted Butter 250g', 'Coles Simply Snap Frozen Peas 1Kg')).toBeLessThan(0.5)
    expect(similarity('Coles Cage Free Eggs 12 Pack 700g', 'Coles Cage Free Eggs 18 Pack')).toBeGreaterThanOrEqual(0.5)
  })
})

describe('priceForItem', () => {
  it('uses the printed unit price when there is one', () => {
    expect(priceForItem(line('x', { unitPriceCents: 185, totalCents: 555, quantity: 3 }))).toBe(185)
  })

  it('divides the total when the receipt only gave one', () => {
    expect(priceForItem(line('x', { unitPriceCents: null, totalCents: 600, quantity: 4 }))).toBe(150)
  })

  it('gives nothing for a weighed line with no unit price', () => {
    expect(priceForItem(line('x', { unitPriceCents: null, quantity: null, kilos: 0.3, totalCents: 238 }))).toBeNull()
  })
})
