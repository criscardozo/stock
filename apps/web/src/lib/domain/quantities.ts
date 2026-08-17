/**
 * Quantities are stored as non-negative integers in the item's own unit — the
 * same reasoning as money in cents. Scaling to kg/L happens HERE, on the way to
 * the screen, and never on the way to the database.
 */
import type { Item, Level, Unit } from './types'

interface UnitSpec {
  symbol: string
  step: number
  scale?: { from: number; symbol: string; divisor: number; maxDecimals: number }
}

// Mirrors shared/units.json.
export const UNITS: Record<Unit, UnitSpec> = {
  unit: { symbol: 'u', step: 1 },
  g: { symbol: 'g', step: 100, scale: { from: 1000, symbol: 'kg', divisor: 1000, maxDecimals: 2 } },
  ml: { symbol: 'ml', step: 100, scale: { from: 1000, symbol: 'L', divisor: 1000, maxDecimals: 2 } },
}

export const LEVEL_NAMES: Record<Level, string> = {
  0: 'vacío',
  1: 'poco',
  2: 'medio',
  3: 'lleno',
}

export const UNIT_NAMES: Record<Unit, string> = {
  unit: 'unidades',
  g: 'gramos',
  ml: 'mililitros',
}

const numberFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 })

/** `1200, 'g'` → `"1,2 kg"`. `6, 'unit'` → `"6 u"`. */
export function formatQuantity(quantity: number, unit: Unit): string {
  const spec = UNITS[unit]
  if (spec.scale && Math.abs(quantity) >= spec.scale.from) {
    return `${numberFormat.format(quantity / spec.scale.divisor)} ${spec.scale.symbol}`
  }
  return `${numberFormat.format(quantity)} ${spec.symbol}`
}

export function stepFor(unit: Unit): number {
  return UNITS[unit].step
}

/** What an item's current stock reads as, whichever way it is tracked. */
export function formatStock(item: Item): string {
  if (item.tracking === 'quantity') {
    return formatQuantity(item.quantity ?? 0, item.unit ?? 'unit')
  }
  return LEVEL_NAMES[(item.level ?? 0) as Level]
}

export function formatPriceCents(cents: number, currency = 'AUD'): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency }).format(cents / 100)
}
