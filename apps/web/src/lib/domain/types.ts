/**
 * The Firestore contract, in TypeScript. `shared/schema.md` is the source of
 * truth — when the two disagree, the schema is right.
 */
import type { IsoDate, PlanLength } from './dates'

export type Unit = 'unit' | 'g' | 'ml'
export type Tracking = 'quantity' | 'level'
/** 0 empty · 1 low · 2 half · 3 full */
export type Level = 0 | 1 | 2 | 3

export interface Category {
  name: string
  /** What it is called at home, under the receipt's own name. */
  nameEs?: string
  /** Material Symbols Rounded ligature. */
  icon: string
  /** Palette name from docs/design-system.md — never a raw colour. */
  hue: string
  kind: 'food' | 'household'
  sortOrder: number
}

export interface Location {
  name: string
  icon: string
  hue: string
  sortOrder: number
}

export interface Household {
  id: string
  name: string
  timezone: string
  currency: string
  memberIds: string[]
  members: Record<string, { displayName: string; photoURL?: string }>
  locations: Record<string, Location>
  categories: Record<string, Category>
  planConfig: { length: PlanLength; startWeekday: number }
}

/** The catalogue entry AND the stock, in one document. */
export interface Item {
  id: string
  name: string
  brand?: string
  categoryId: string
  locationId: string
  tracking: Tracking
  /** present when tracking === 'quantity' */
  unit?: Unit
  quantity?: number
  minQuantity?: number
  /** present when tracking === 'level' */
  level?: Level
  minLevel?: Level
  packSize?: string
  barcodes: string[]
  /** Every receipt line matched to this item, verbatim. See schema.md. */
  receiptNames?: string[]
  expiresAt?: IsoDate
  snoozedUntil?: IsoDate
  lastPriceCents?: number
  notes?: string
  updatedBy?: string
}

export interface Ingredient {
  label: string
  itemId?: string
  quantity?: number
  unit?: Unit
  optional: boolean
}

export interface Recipe {
  id: string
  title: string
  /** Material Symbols ligature shown on the card; defaults to `restaurant`. */
  icon?: string
  servings: number
  steps?: string
  tags: string[]
  ingredients: Ingredient[]
  timesCooked: number
  lastCookedAt?: IsoDate
}

export type DayStatus = 'planned' | 'cooked' | 'skipped'

export interface PlanDay {
  recipeId?: string
  label?: string
  status: DayStatus
  cookedAt?: IsoDate
}

export interface MealPlan {
  id: IsoDate
  startDate: IsoDate
  endDate: IsoDate
  length: PlanLength
  days: Record<IsoDate, PlanDay>
}

export type ShoppingSource = 'min' | 'plan' | 'manual'

export interface ShoppingEntry {
  id: string
  label: string
  itemId?: string
  quantity?: number
  unit?: Unit
  source: ShoppingSource
  /** Frozen when the row was added — it explains how the row got here. */
  reason?: string
  checked: boolean
  checkedBy?: string
  addedBy: string
  /**
   * Local metadata, never stored: this write hasn't reached the server yet.
   * The supermarket is exactly where there is no signal, so a row that only
   * exists on this phone is worth saying out loud.
   */
  pending?: boolean
}

export type MoveType = 'purchase' | 'cook' | 'adjust' | 'waste'

export interface Move {
  id: string
  itemId: string
  type: MoveType
  delta?: number
  levelFrom?: Level
  levelTo?: Level
  recipeId?: string
  planDate?: IsoDate
  by: string
  at?: Date
}
