import type { Item } from '@/lib/domain/types'
import type { NewItem, ReceiptAction } from '@/lib/firebase/mutations'
import { priceToStore, type ConsolidatedLine } from './consolidate'
import type { MatchedLine } from './match'

/**
 * Turning a reviewed receipt into writes.
 *
 * Extracted from the sheet because it is the part that can be wrong in a way
 * nobody sees: a decision that silently lands in the default category, or a
 * price taken from a special. The UI around it is easy to look at; this is not.
 */

export type Decision =
  | { kind: 'skip' }
  | { kind: 'link'; itemId: string }
  /** Category and location are per line: a receipt mixes avocados with chocolate. */
  | { kind: 'create'; categoryId?: string; locationId?: string }

export interface Defaults {
  categoryId: string
  locationId: string
}

export function buildActions(
  resolved: { line: ConsolidatedLine; match: MatchedLine }[],
  decisions: Record<string, Decision>,
  defaults: Defaults,
): ReceiptAction[] {
  return resolved.map(({ line, match }) => {
    const priceCents = priceToStore(line)
    const receiptName = line.raw

    // Already confirmed for an item: refresh its price without asking again.
    if (match.status === 'known' && match.item) {
      return { kind: 'link', itemId: match.item.id, priceCents, receiptName }
    }

    const decision = decisions[line.raw] ?? { kind: 'skip' }

    if (decision.kind === 'link') {
      return { kind: 'link', itemId: decision.itemId, priceCents, receiptName }
    }

    if (decision.kind === 'create') {
      const item: NewItem = {
        name: line.name,
        // Per line first, the screen default only as a fallback.
        categoryId: decision.categoryId ?? defaults.categoryId,
        locationId: decision.locationId ?? defaults.locationId,
        tracking: 'quantity',
        unit: 'unit',
        // Past shops say nothing about what is in the house right now.
        quantity: 0,
        minQuantity: 0,
        barcodes: [],
      }
      return { kind: 'create', item, priceCents, receiptName }
    }

    return { kind: 'skip' }
  })
}

/** Counts for the apply button, so the label cannot disagree with the writes. */
export function summarise(actions: ReceiptAction[]) {
  return {
    prices: actions.filter((a) => a.kind === 'link').length,
    created: actions.filter((a) => a.kind === 'create').length,
    skipped: actions.filter((a) => a.kind === 'skip').length,
  }
}

/** Only used to keep the Item type honest in tests. */
export type { Item }
