/**
 * What the app OFFERS to put on the shopping list. The list itself is stored,
 * shared data; this is the panel underneath it.
 *
 * Nothing here writes anything: a suggestion becomes a row only when someone
 * adds it, which is what stops a row you deleted from crawling back.
 *
 * Implemented twice (here and in Swift) and validated by
 * `shared/shopping-vectors.json` — change the vectors first.
 */
import type { IsoDate } from './dates'
import { isSnoozed, stockStatus } from './items'
import type { Item, Level, MealPlan, Recipe, ShoppingSource } from './types'

export interface PlanRef {
  recipeId: string
  date: IsoDate
}

export interface Suggestion {
  itemId: string
  source: Extract<ShoppingSource, 'min' | 'plan'>
  /** Absent for level-tracked items, and when you are exactly at the trigger point. */
  quantity?: number
  planRefs: PlanRef[]
}

export interface SuggestionInput {
  today: IsoDate
  items: Item[]
  plan: MealPlan | null
  recipes: Recipe[]
  listItemIds: string[]
}

interface PlanDemand {
  need: number
  refs: PlanRef[]
}

/**
 * What the meals still to be cooked will consume. Days already cooked or
 * skipped, and days in the past, contribute nothing: you don't shop for
 * Tuesday on Thursday.
 */
function demandFromPlan(input: SuggestionInput): Map<string, PlanDemand> {
  const demand = new Map<string, PlanDemand>()
  if (!input.plan) return demand

  const byId = new Map(input.recipes.map((r) => [r.id, r]))
  const dates = Object.keys(input.plan.days).sort()

  for (const date of dates) {
    if (date < input.today) continue
    const day = input.plan.days[date]
    if (day.status !== 'planned' || !day.recipeId) continue

    const recipe = byId.get(day.recipeId)
    if (!recipe) continue // a deleted recipe is ignored, not a crash

    for (const ingredient of recipe.ingredients) {
      // Optional and free-text ingredients are invisible to the engine, on purpose.
      if (ingredient.optional || !ingredient.itemId) continue
      const current = demand.get(ingredient.itemId) ?? { need: 0, refs: [] }
      current.need += ingredient.quantity ?? 0
      current.refs.push({ recipeId: recipe.id, date })
      demand.set(ingredient.itemId, current)
    }
  }
  return demand
}

export function suggestions(input: SuggestionInput): Suggestion[] {
  const onList = new Set(input.listItemIds)
  const demand = demandFromPlan(input)
  const out: Suggestion[] = []

  for (const item of input.items) {
    if (onList.has(item.id) || isSnoozed(item, input.today)) continue

    const planned = demand.get(item.id)
    const refs = planned?.refs ?? []
    const belowOwnMin = stockStatus(item) !== 'ok'

    if (item.tracking === 'level') {
      if (!belowOwnMin) continue
      // A reserve DOES have a number, and it is not invented: counting sealed
      // bottles is counting units. Without one, the old rule stands — saying
      // "250 ml of oil" is worse than saying nothing.
      if (item.minSpare !== undefined) {
        const missing = Math.max(0, item.minSpare - (item.spare ?? 0))
        out.push({
          itemId: item.id,
          source: 'min',
          ...(missing > 0 ? { quantity: missing } : {}),
          planRefs: refs,
        })
        continue
      }
      out.push({ itemId: item.id, source: 'min', planRefs: refs })
      continue
    }

    const quantity = item.quantity ?? 0
    // The minimum is the cushion you want left AFTER cooking what's planned.
    // Being out counts on its own: a minimum of 0 means "no floor", not
    // "never tell me" — that's what snooze is for.
    const threshold = (item.minQuantity ?? 0) + (planned?.need ?? 0)
    if (!belowOwnMin && quantity >= threshold) continue

    const shortfall = Math.max(0, threshold - quantity)
    out.push({
      itemId: item.id,
      source: belowOwnMin ? 'min' : 'plan',
      ...(shortfall > 0 ? { quantity: shortfall } : {}),
      planRefs: refs,
    })
  }

  return out.sort((a, b) => (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0))
}

/**
 * The text frozen onto the row when a suggestion is accepted. It is a snapshot:
 * if the stock changes afterwards, what explains the row is still why it got
 * there.
 */
export function reasonFor(
  suggestion: Suggestion,
  item: Item,
  recipes: Recipe[],
  formatDay: (date: IsoDate) => string,
): string {
  const bits: string[] = []

  if (suggestion.source === 'min') {
    if (item.tracking === 'quantity') {
      const left = item.quantity ?? 0
      bits.push(left === 0 ? 'no queda' : `quedan ${left}, mínimo ${item.minQuantity ?? 0}`)
    } else {
      bits.push(`nivel: ${LEVEL_LABEL[(item.level ?? 0) as Level]}`)
    }
  }

  const byId = new Map(recipes.map((r) => [r.id, r]))
  for (const ref of suggestion.planRefs) {
    const title = byId.get(ref.recipeId)?.title
    if (title) bits.push(`para ${title} (${formatDay(ref.date)})`)
  }

  return bits.join(' · ')
}

const LEVEL_LABEL: Record<Level, string> = { 0: 'vacío', 1: 'poco', 2: 'medio', 3: 'lleno' }
