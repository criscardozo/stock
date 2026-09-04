import { describe, expect, it } from 'vitest'
import vectors from '../../../../../shared/shopping-vectors.json'
import { suggestions, type Suggestion } from './suggestions'
import type { Item, MealPlan, Recipe } from './types'

interface VectorCase {
  name: string
  input: {
    today: string
    items: Record<string, unknown>[]
    plan: { days: Record<string, Record<string, unknown>> } | null
    recipes: Record<string, unknown>[]
    listItemIds: string[]
  }
  expected: Record<string, unknown>[]
}

/** The vectors carry only the fields each case is about; the rest is scaffolding. */
function asItem(raw: Record<string, unknown>): Item {
  return {
    id: raw.id as string,
    name: raw.id as string,
    categoryId: 'almacen',
    locationId: 'alacena',
    barcodes: [],
    ...raw,
  } as unknown as Item
}

function asPlan(raw: VectorCase['input']['plan']): MealPlan | null {
  if (!raw) return null
  return {
    id: '2026-08-15',
    startDate: '2026-08-15',
    endDate: '2026-08-28',
    length: 'fortnightly',
    days: raw.days,
  } as unknown as MealPlan
}

function asRecipe(raw: Record<string, unknown>): Recipe {
  return {
    id: raw.id as string,
    title: raw.id as string,
    servings: 2,
    tags: [],
    timesCooked: 0,
    ingredients: raw.ingredients ?? [],
  } as unknown as Recipe
}

describe('shopping suggestions (shared vectors)', () => {
  for (const c of vectors.cases as VectorCase[]) {
    it(c.name, () => {
      const got = suggestions({
        today: c.input.today,
        items: c.input.items.map(asItem),
        plan: asPlan(c.input.plan),
        recipes: c.input.recipes.map(asRecipe),
        listItemIds: c.input.listItemIds,
      })
      // toEqual would let an unexpected `quantity: undefined` slide; the vectors
      // distinguish "no amount" from "amount zero", so compare exactly.
      expect(normalise(got)).toStrictEqual(c.expected.map(normaliseExpected))
    })
  }
})

function normalise(list: Suggestion[]) {
  return list.map((s) => ({
    itemId: s.itemId,
    source: s.source,
    ...(s.quantity === undefined ? {} : { quantity: s.quantity }),
    planRefs: s.planRefs,
  }))
}

function normaliseExpected(raw: Record<string, unknown>) {
  return {
    itemId: raw.itemId,
    source: raw.source,
    ...(raw.quantity === undefined ? {} : { quantity: raw.quantity }),
    planRefs: raw.planRefs ?? [],
  }
}

/**
 * Not a vector: the vectors describe documents this app writes, and this is a
 * document it used to write. `Dejarlo sin plan` stored a literal null under the
 * day's key instead of removing the key, so iterating the keys found it and
 * `day.status` threw — one tap blanked every screen that reads suggestions. The
 * write is fixed; these documents are already out there, on both clients.
 */
describe('a day cleared by an older build', () => {
  it('is skipped rather than thrown on', () => {
    const plan = {
      id: '2026-08-15',
      startDate: '2026-08-15',
      endDate: '2026-08-28',
      length: 'fortnightly',
      days: {
        '2026-08-16': null,
        '2026-08-17': { status: 'planned', recipeId: 'tarta' },
      },
    } as unknown as MealPlan

    const items = [
      { id: 'huevos', name: 'Huevos', tracking: 'quantity', unit: 'unit', quantity: 0 },
    ] as unknown as Item[]
    const recipes = [
      { id: 'tarta', title: 'Tarta', servings: 2, ingredients: [{ itemId: 'huevos', quantity: 6, unit: 'unit' }] },
    ] as unknown as Recipe[]

    const result = suggestions({ items, recipes, plan, listItemIds: [], today: '2026-08-15' })

    // Not merely "did not throw": the day AFTER the null is still read, so the
    // guard skips one entry rather than abandoning the loop.
    expect(result.some((s: Suggestion) => s.itemId === 'huevos')).toBe(true)
  })
})
