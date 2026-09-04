import { describe, expect, it } from 'vitest'
import { formatQuantity, formatPriceCents, formatStock, stepFor } from './quantities'
import type { Item } from './types'

/**
 * Formatting only. Quantities are integers in the item's own unit everywhere
 * else in this app — 1200 g is DISPLAYED as "1,2 kg" and is never stored that
 * way — so the one thing these must never do is round-trip back into the data.
 */
describe('formatQuantity', () => {
  it('scales grams and millilitres at 1000, not before', () => {
    expect(formatQuantity(999, 'g')).toBe('999 g')
    expect(formatQuantity(1000, 'g')).toBe('1 kg')
    expect(formatQuantity(1200, 'g')).toBe('1,2 kg')
    expect(formatQuantity(1500, 'ml')).toBe('1,5 L')
  })

  it('never scales counted units — half an egg is not a thing', () => {
    expect(formatQuantity(1200, 'unit')).toBe('1.200 u')
    expect(formatQuantity(0, 'unit')).toBe('0 u')
  })

  it('uses es-AR separators: comma decimal, dot thousands', () => {
    // The app is Spanish-only and this is what the household reads. Getting it
    // backwards turns 1,2 kg into 1.2 kg, which looks like a different number.
    expect(formatQuantity(1250, 'g')).toBe('1,25 kg')
    expect(formatQuantity(2000, 'unit')).toBe('2.000 u')
  })
})

describe('stepFor', () => {
  it('steps by one unit but by a hundred grams', () => {
    // Tapping + on flour should not take eleven presses to add a spoonful.
    expect(stepFor('unit')).toBe(1)
    expect(stepFor('g')).toBe(100)
    expect(stepFor('ml')).toBe(100)
  })
})

describe('formatStock', () => {
  const base = {
    id: 'x',
    name: 'X',
    categoryId: 'c',
    locationId: 'l',
    barcodes: [],
    receiptNames: [],
    updatedBy: 'u',
  }

  it('reads a counted item in its unit and a level item by name', () => {
    expect(formatStock({ ...base, tracking: 'quantity', quantity: 1200, unit: 'g' } as Item)).toBe(
      '1,2 kg',
    )
    expect(formatStock({ ...base, tracking: 'level', level: 2 } as Item)).toBe('medio')
  })
})

describe('formatPriceCents', () => {
  it('is integer cents in, currency string out', () => {
    // Money is integer cents for the same reason quantities are integers. This
    // is display only; nothing parses the result back.
    expect(formatPriceCents(0)).toContain('0')
    expect(formatPriceCents(1250)).toContain('12,50')
  })
})
