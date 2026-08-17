/**
 * Can we cook this tonight? Answered against the stock, per ingredient.
 *
 * Only linked ingredients are judged. Free text ("una pizca de sal") is shown
 * and never counted — the same rule the suggestion engine follows, for the same
 * reason: inventing a quantity is worse than saying nothing.
 */
import type { Ingredient, Item, Level, Recipe } from './types'

export type IngredientStatus = 'have' | 'low' | 'missing' | 'unlinked'

export function ingredientStatus(
  ingredient: Ingredient,
  itemsById: Map<string, Item>,
): IngredientStatus {
  if (!ingredient.itemId) return 'unlinked'
  const item = itemsById.get(ingredient.itemId)
  if (!item) return 'unlinked'

  if (item.tracking === 'level') {
    const level = (item.level ?? 0) as Level
    if (level === 0) return 'missing'
    return level <= ((item.minLevel ?? 1) as Level) ? 'low' : 'have'
  }

  const have = item.quantity ?? 0
  const need = ingredient.quantity ?? 0
  if (have < need) return 'missing'
  return have <= (item.minQuantity ?? 0) ? 'low' : 'have'
}

/** How short we are, in the item's unit. 0 when nothing is missing. */
export function shortfallFor(ingredient: Ingredient, itemsById: Map<string, Item>): number {
  if (!ingredient.itemId) return 0
  const item = itemsById.get(ingredient.itemId)
  if (!item || item.tracking !== 'quantity') return 0
  return Math.max(0, (ingredient.quantity ?? 0) - (item.quantity ?? 0))
}

export interface Availability {
  missing: number
  low: number
  /** Nothing linked at all — the recipe can't be judged, so it isn't. */
  unknown: boolean
}

export function availabilityOf(recipe: Recipe, itemsById: Map<string, Item>): Availability {
  let missing = 0
  let low = 0
  let linked = 0

  for (const ingredient of recipe.ingredients) {
    if (ingredient.optional) continue
    const status = ingredientStatus(ingredient, itemsById)
    if (status === 'unlinked') continue
    linked += 1
    if (status === 'missing') missing += 1
    else if (status === 'low') low += 1
  }

  return { missing, low, unknown: linked === 0 }
}
