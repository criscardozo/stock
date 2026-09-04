import { describe, expect, it } from 'vitest'
import { EXPIRING_WITHIN_DAYS, expiryStatus, isSnoozed, needsAttention, stockStatus } from './items'
import type { Item } from './types'

/**
 * The derivations every screen renders from.
 *
 * They were covered only sideways, through the shopping-suggestion vectors, so
 * a change to `expiryStatus` — which suggestions never look at — could pass the
 * whole suite. These are the direct tests.
 */
function make(overrides: Partial<Item>): Item {
  return {
    id: 'x',
    name: 'X',
    categoryId: 'c',
    locationId: 'l',
    tracking: 'quantity',
    quantity: 5,
    minQuantity: 2,
    barcodes: [],
    receiptNames: [],
    updatedBy: 'u',
    ...overrides,
  } as Item
}

const TODAY = '2026-09-04'

describe('stockStatus, counted', () => {
  it('zero is out whatever the minimum says', () => {
    // A minimum of 0 means "no floor", not "never tell me" — running out is the
    // strongest signal there is, and silencing it is what autoSuggest is for.
    expect(stockStatus(make({ quantity: 0, minQuantity: 0 }))).toBe('out')
    expect(stockStatus(make({ quantity: 0, minQuantity: 6 }))).toBe('out')
  })

  it('at the minimum is already low, not ok', () => {
    // The boundary: `<=`. At the minimum you are AT the line you set, which is
    // the moment to buy, not the moment after.
    expect(stockStatus(make({ quantity: 2, minQuantity: 2 }))).toBe('low')
    expect(stockStatus(make({ quantity: 3, minQuantity: 2 }))).toBe('ok')
  })

  it('treats a missing quantity as none', () => {
    expect(stockStatus(make({ quantity: undefined }))).toBe('out')
  })
})

describe('stockStatus, level', () => {
  const level = (overrides: Partial<Item>) =>
    make({ tracking: 'level', quantity: undefined, minQuantity: undefined, ...overrides })

  it('empty is out and the minimum defaults to poco', () => {
    expect(stockStatus(level({ level: 0 }))).toBe('out')
    expect(stockStatus(level({ level: 1 }))).toBe('low')
    expect(stockStatus(level({ level: 2 }))).toBe('ok')
  })

  it('with a reserve, what is at hand includes the sealed ones', () => {
    // An empty open bottle with a FULL reserve behind it is nothing to act on:
    // you open one. That drops spare to 1, which is below the minimum, and the
    // purchase appears then — which is the whole point of counting the sealed
    // ones instead of waiting for the last bottle to run dry.
    expect(stockStatus(level({ level: 0, spare: 2, minSpare: 2 }))).toBe('ok')
    expect(stockStatus(level({ level: 0, spare: 0, minSpare: 2 }))).toBe('out')
    // Opening one drops the reserve below its minimum, which is the whole
    // point of the feature: the purchase goes on the list then, not weeks later.
    expect(stockStatus(level({ level: 3, spare: 1, minSpare: 2 }))).toBe('low')
    expect(stockStatus(level({ level: 3, spare: 2, minSpare: 2 }))).toBe('ok')
  })
})

describe('expiryStatus', () => {
  it('yesterday is expired, today is not', () => {
    expect(expiryStatus(make({ expiresAt: '2026-09-03' }), TODAY)).toBe('expired')
    // Today's yoghurt is still edible today. Calling it expired would hide it
    // behind the same chip as last week's.
    expect(expiryStatus(make({ expiresAt: TODAY }), TODAY)).toBe('expiring')
  })

  it('the window is inclusive at its far edge', () => {
    const edge = '2026-09-07' // today + 3
    expect(EXPIRING_WITHIN_DAYS).toBe(3)
    expect(expiryStatus(make({ expiresAt: edge }), TODAY)).toBe('expiring')
    expect(expiryStatus(make({ expiresAt: '2026-09-08' }), TODAY)).toBe('fresh')
  })

  it('no date is not a state to warn about', () => {
    expect(expiryStatus(make({}), TODAY)).toBe('none')
  })
})

describe('isSnoozed', () => {
  it('covers the day it names and stops the day after', () => {
    expect(isSnoozed(make({ snoozedUntil: TODAY }), TODAY)).toBe(true)
    expect(isSnoozed(make({ snoozedUntil: '2026-09-03' }), TODAY)).toBe(false)
    expect(isSnoozed(make({}), TODAY)).toBe(false)
  })
})

describe('needsAttention', () => {
  it('is true for anything the row would mark, and false for a quiet item', () => {
    expect(needsAttention(make({ quantity: 0 }), TODAY)).toBe(true)
    expect(needsAttention(make({ expiresAt: '2026-09-05' }), TODAY)).toBe(true)
    expect(needsAttention(make({ quantity: 9, expiresAt: '2027-01-01' }), TODAY)).toBe(false)
    // A snooze silences the SUGGESTION, not the item: the stock screen still
    // says it is short, because that is a fact about the cupboard.
    expect(needsAttention(make({ quantity: 0, snoozedUntil: '2026-12-01' }), TODAY)).toBe(true)
  })
})
