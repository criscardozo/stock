import type { Receipt, ReceiptLine } from './parse'

/**
 * Many receipts into one list, so reviewing a folder is one pass instead of one
 * pass per shop.
 *
 * The point of consolidating is not tidiness, it is that frequency is the only
 * signal available about what belongs in a pantry. Across twenty real receipts,
 * 99 of 139 products were bought exactly once — those are cravings and one-off
 * specials, not stock. The eighteen bought three times or more are the pantry.
 */

export interface ConsolidatedLine {
  /** The receipt text, verbatim, as it will be stored for matching. */
  raw: string
  /** Cleaned up for display and for a new item's name. */
  name: string
  /** How many receipts this product appeared on. */
  buys: number
  /** Dates it was bought, oldest first. Nulls dropped. */
  dates: string[]
  /**
   * What it costs when nothing is discounted — the highest price seen on a line
   * with no special marker. This is the number worth storing: a reference price
   * taken from a special would read as normal forever.
   */
  normalPriceCents: number | null
  /** The most recent price paid, discounted or not. */
  lastPriceCents: number | null
  /** True when every single sighting was on special, so there is no normal. */
  onlyEverOnSpecial: boolean
}

/** Cents per unit for one line, dividing the total when that is all there is. */
function unitPrice(line: ReceiptLine): number | null {
  if (line.unitPriceCents !== null) return line.unitPriceCents
  if (line.quantity && line.quantity > 0) return Math.round(line.totalCents / line.quantity)
  return null
}

export function consolidate(receipts: Receipt[]): ConsolidatedLine[] {
  type Acc = {
    raw: string
    name: string
    sightings: { date: string | null; price: number | null; onSpecial: boolean }[]
  }
  const byName = new Map<string, Acc>()

  // Oldest first, so "last price" means what it says.
  const ordered = [...receipts].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))

  for (const receipt of ordered) {
    for (const line of receipt.lines) {
      const key = line.raw.trim().toLowerCase()
      if (!byName.has(key)) byName.set(key, { raw: line.raw, name: line.name, sightings: [] })
      byName.get(key)!.sightings.push({
        date: receipt.date,
        price: unitPrice(line),
        onSpecial: line.onSpecial,
      })
    }
  }

  return [...byName.values()]
    .map((acc) => {
      const priced = acc.sightings.filter((s) => s.price !== null)
      const normal = priced.filter((s) => !s.onSpecial).map((s) => s.price as number)
      const last = priced.length > 0 ? (priced[priced.length - 1].price as number) : null
      return {
        raw: acc.raw,
        name: acc.name,
        buys: acc.sightings.length,
        dates: acc.sightings.map((s) => s.date).filter((d): d is string => d !== null),
        // Highest, not average: a receipt can catch a product mid-markdown, and
        // the ceiling is what it costs on an ordinary week.
        normalPriceCents: normal.length > 0 ? Math.max(...normal) : null,
        lastPriceCents: last,
        onlyEverOnSpecial: priced.length > 0 && normal.length === 0,
      }
    })
    .sort((a, b) => b.buys - a.buys || a.name.localeCompare(b.name))
}

/** The price to store: what it normally costs, falling back to what was paid. */
export function priceToStore(line: ConsolidatedLine): number | null {
  return line.normalPriceCents ?? line.lastPriceCents
}
