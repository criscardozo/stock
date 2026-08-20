import type { Item } from '@/lib/domain/types'
import type { ReceiptLine } from './parse'

/**
 * Deciding which catalogue item a receipt line belongs to.
 *
 * Deliberately NOT clever. A wrong guess writes a price onto the wrong product
 * and nobody notices, so the only automatic match is one that cannot be wrong:
 * a line the household has already confirmed for that item, stored verbatim in
 * `receiptNames`. Everything else is a question for a person.
 *
 * The payoff is that a confirmation is permanent — say once that "COLES DRINK
 * SOY:REGU 1LITRE" is the soy milk, and every future till receipt lands on it.
 */

export type MatchStatus = 'known' | 'unknown'

export interface MatchedLine {
  line: ReceiptLine
  status: MatchStatus
  /** The item this line resolved to, when it did. */
  item: Item | null
  /**
   * Items whose name looks similar, offered only as an ordering for the picker.
   * Never applied on its own — see the note above about wrong guesses.
   */
  suggestions: Item[]
}

/** Lower case, no punctuation, single spaces. For suggestion ranking only. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñü ]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Words worth comparing: drops sizes, units and filler. */
function keywords(text: string): Set<string> {
  const stop = new Set([
    'coles', 'the', 'and', 'with', 'free', 'from', 'each', 'pack', 'perkg', 'per',
    'kg', 'g', 'ml', 'l', 'litre', 'gram', 'simply', 'approx',
  ])
  return new Set(
    normalise(text)
      .split(' ')
      .filter((w) => w.length > 2 && !stop.has(w) && !/^\d+$/.test(w)),
  )
}

/** Shared keywords, as a fraction of the smaller set. 0 when either is empty. */
export function similarity(a: string, b: string): number {
  const wa = keywords(a)
  const wb = keywords(b)
  if (wa.size === 0 || wb.size === 0) return 0
  let shared = 0
  for (const word of wa) if (wb.has(word)) shared++
  return shared / Math.min(wa.size, wb.size)
}

/**
 * Resolves each line against the catalogue.
 *
 * An item matches when the line's exact text is already in its `receiptNames`,
 * or when it equals the item's own name. Comparison ignores case and outer
 * space so that a receipt reprinting the same product in a different case still
 * lands, but nothing looser than that decides anything by itself.
 */
export function matchLines(lines: ReceiptLine[], items: Item[]): MatchedLine[] {
  const byReceiptName = new Map<string, Item>()
  for (const item of items) {
    for (const name of item.receiptNames ?? []) {
      byReceiptName.set(name.trim().toLowerCase(), item)
    }
    byReceiptName.set(item.name.trim().toLowerCase(), item)
  }

  return lines.map((line) => {
    const key = line.raw.trim().toLowerCase()
    const item = byReceiptName.get(key) ?? null
    if (item) return { line, status: 'known' as const, item, suggestions: [] }

    const suggestions = items
      .map((candidate) => ({
        candidate,
        score: Math.max(
          similarity(line.raw, candidate.name),
          candidate.nameEs ? similarity(line.raw, candidate.nameEs) : 0,
        ),
      }))
      .filter((s) => s.score >= 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((s) => s.candidate)

    return { line, status: 'unknown' as const, item: null, suggestions }
  })
}

/**
 * Cents per whole unit, for the price we store.
 *
 * A weighed line has no per-unit price that means anything — "$7.90/kg" is not
 * what one zucchini costs — so those keep the receipt's unit price as printed
 * and the caller decides whether it is worth storing.
 */
export function priceForItem(line: ReceiptLine): number | null {
  if (line.unitPriceCents !== null) return line.unitPriceCents
  if (line.quantity && line.quantity > 0) return Math.round(line.totalCents / line.quantity)
  return null
}
