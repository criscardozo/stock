import { describe, expect, it } from 'vitest'
import { consolidate, priceToStore } from './consolidate'
import type { Receipt, ReceiptLine } from './parse'

function line(raw: string, extra: Partial<ReceiptLine> = {}): ReceiptLine {
  return {
    raw,
    name: raw,
    quantity: 1,
    kilos: null,
    unitPriceCents: 100,
    totalCents: 100,
    section: null,
    onSpecial: false,
    ...extra,
  }
}

function receipt(date: string, lines: ReceiptLine[]): Receipt {
  return { kind: 'instore', date, declaredItems: null, lines, skipped: [] }
}

describe('consolidate', () => {
  it('counts how many shops a product appeared on', () => {
    const [only] = consolidate([
      receipt('2026-07-01', [line('PAPAYA 1EACH')]),
      receipt('2026-07-08', [line('PAPAYA 1EACH')]),
      receipt('2026-07-15', [line('PAPAYA 1EACH')]),
    ])
    expect(only).toMatchObject({ buys: 3, dates: ['2026-07-01', '2026-07-08', '2026-07-15'] })
  })

  it('orders by frequency, which is the only signal about what is stock', () => {
    const result = consolidate([
      receipt('2026-07-01', [line('ONIONS'), line('CAVIAR')]),
      receipt('2026-07-08', [line('ONIONS')]),
    ])
    expect(result.map((r) => r.name)).toEqual(['ONIONS', 'CAVIAR'])
  })

  it('ignores a special when working out what a thing normally costs', () => {
    const [chocolate] = consolidate([
      receipt('2026-07-20', [line('BULLA', { unitPriceCents: 500, onSpecial: true })]),
      receipt('2026-08-11', [line('BULLA', { unitPriceCents: 1000, onSpecial: false })]),
    ])
    expect(chocolate.normalPriceCents).toBe(1000)
    expect(chocolate.lastPriceCents).toBe(1000)
    expect(priceToStore(chocolate)).toBe(1000)
  })

  it('takes the ceiling of the normal prices, not the average', () => {
    // A shop can catch a product mid-markdown without the star.
    const [x] = consolidate([
      receipt('2026-07-01', [line('X', { unitPriceCents: 300 })]),
      receipt('2026-07-08', [line('X', { unitPriceCents: 450 })]),
    ])
    expect(x.normalPriceCents).toBe(450)
  })

  it('says when a product was only ever seen on special', () => {
    // Pti Simmer Sauce was discounted all three times it was bought. Storing
    // that as its reference price would understate it forever.
    const [sauce] = consolidate([
      receipt('2026-07-01', [line('PTI SIMMER SAUCE', { unitPriceCents: 250, onSpecial: true })]),
      receipt('2026-07-08', [line('PTI SIMMER SAUCE', { unitPriceCents: 250, onSpecial: true })]),
    ])
    expect(sauce.onlyEverOnSpecial).toBe(true)
    expect(sauce.normalPriceCents).toBeNull()
    // Still worth storing something, but the caller can warn.
    expect(priceToStore(sauce)).toBe(250)
  })

  it('reads the last price in date order, not file order', () => {
    const [x] = consolidate([
      receipt('2026-08-11', [line('X', { unitPriceCents: 900 })]),
      receipt('2026-07-01', [line('X', { unitPriceCents: 100 })]),
    ])
    expect(x.lastPriceCents).toBe(900)
  })

  it('treats the same name in different case as one product', () => {
    const result = consolidate([
      receipt('2026-07-01', [line('BROWN ONIONS PERKG')]),
      receipt('2026-07-08', [line('brown onions perkg')]),
    ])
    expect(result).toHaveLength(1)
    expect(result[0].buys).toBe(2)
  })
})
