/**
 * Item state is derived on every render, never stored: persisting it would mean
 * rewriting documents to keep a field in sync with the fields that already
 * determine it.
 */
import { addDays, type IsoDate } from './dates'
import type { Item, Level } from './types'

export type StockStatus = 'out' | 'low' | 'ok'
export type ExpiryStatus = 'expired' | 'expiring' | 'fresh' | 'none'

/** How many days ahead counts as "vence pronto". */
export const EXPIRING_WITHIN_DAYS = 3

export function stockStatus(item: Item): StockStatus {
  if (item.tracking === 'quantity') {
    const quantity = item.quantity ?? 0
    if (quantity === 0) return 'out'
    return quantity <= (item.minQuantity ?? 0) ? 'low' : 'ok'
  }
  const level = (item.level ?? 0) as Level
  // With a reserve, what is at hand is the open container PLUS the sealed ones.
  // An empty bottle with two spares behind it is not "out": you open one.
  if (item.minSpare !== undefined) {
    const spare = item.spare ?? 0
    if (level === 0 && spare === 0) return 'out'
    if (spare < item.minSpare) return 'low'
    return level <= ((item.minLevel ?? 1) as Level) && spare === 0 ? 'low' : 'ok'
  }
  if (level === 0) return 'out'
  return level <= ((item.minLevel ?? 1) as Level) ? 'low' : 'ok'
}

export function expiryStatus(item: Item, today: IsoDate): ExpiryStatus {
  if (!item.expiresAt) return 'none'
  if (item.expiresAt < today) return 'expired'
  return item.expiresAt <= addDays(today, EXPIRING_WITHIN_DAYS) ? 'expiring' : 'fresh'
}

/** A snooze silences the SUGGESTION, not the item: today itself is still quiet. */
export function isSnoozed(item: Item, today: IsoDate): boolean {
  return !!item.snoozedUntil && item.snoozedUntil >= today
}

export function needsAttention(item: Item, today: IsoDate): boolean {
  return stockStatus(item) !== 'ok' || ['expired', 'expiring'].includes(expiryStatus(item, today))
}
