import { describe, expect, it } from 'vitest'
import { ingredientStatus } from './recipes'
import type { Ingredient, Item } from './types'

function detergent(overrides: Partial<Item>): Item {
  return {
    id: 'detergent',
    name: 'Detergente',
    categoryId: 'cleaning',
    locationId: 'laundry',
    tracking: 'level',
    level: 0,
    minLevel: 1,
    barcodes: [],
    receiptNames: [],
    updatedBy: 'alice',
    ...overrides,
  } as Item
}

describe('a level ingredient with a reserve', () => {
  const linked: Ingredient = { label: 'Detergente', itemId: 'detergent', optional: false }

  it('is not missing while a sealed one is left', () => {
    const items = new Map([['detergent', detergent({ spare: 2, minSpare: 2 })]])
    expect(ingredientStatus(linked, items)).toBe('low')
  })

  it('is missing once the reserve runs out too', () => {
    const items = new Map([['detergent', detergent({ spare: 0, minSpare: 2 })]])
    expect(ingredientStatus(linked, items)).toBe('missing')
  })

  it('leaves items without a reserve exactly as they were', () => {
    const items = new Map([['detergent', detergent({})]])
    expect(ingredientStatus(linked, items)).toBe('missing')
  })
})
