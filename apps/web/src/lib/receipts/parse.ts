/**
 * Coles receipts, both shapes, into lines a human can review.
 *
 * This file takes TEXT, not a PDF: extracting text from the PDF is the caller's
 * job (see pdf.ts). Keeping the two apart is what makes the hard part — the
 * parsing — testable against fixtures without a browser or a PDF library.
 *
 * The two formats are genuinely different documents:
 *
 *   online   Coles Regular Soy Milk 1L        3    3    $1.85    $5.55
 *            name, ordered, picked, unit price, total, in columns under a
 *            category heading. A weighed item shows "1.395kg" as picked.
 *
 *   in-store   COLES DRINK SOY:REGU 1LITRE          1.75
 *              name and TOTAL only, upper case and abbreviated. Quantity and
 *              unit price, when they exist, are on the following line:
 *                  0.301 kg NET @ $7.90/kg
 *                  2 @ $1.70 EACH
 *
 * The same product is printed differently by each: "Coles Regular Soy Milk 1L"
 * online is "COLES DRINK SOY:REGU 1LITRE" in store. That is why an item carries
 * a LIST of receipt names, the way it carries a list of barcodes.
 */

export type ReceiptKind = 'online' | 'instore'

export interface ReceiptLine {
  /** Exactly as printed. This is what gets stored to match on next time. */
  raw: string
  /** Cleaned up for display and for a new item's name. */
  name: string
  /** Whole units, or null when the line was sold by weight. */
  quantity: number | null
  /** Kilograms, when sold by weight. */
  kilos: number | null
  /** Cents each. Null when the receipt only gives a total for a weighed line. */
  unitPriceCents: number | null
  /** Cents charged for the whole line. Always present. */
  totalCents: number
  /** The receipt's own section, e.g. "Pantry". Only the online format has them. */
  section: string | null
}

export interface Receipt {
  kind: ReceiptKind
  /** YYYY-MM-DD, in the receipt's own words. Null when it could not be read. */
  date: string | null
  lines: ReceiptLine[]
  /** Lines that looked like products but could not be parsed. Never silent. */
  skipped: string[]
}

/** "$1.85" / "1.85" -> 185. Returns null for anything else. */
function cents(text: string): number | null {
  const m = text.match(/\$?\s*(\d+(?:\.\d{1,2})?)/)
  if (!m) return null
  return Math.round(Number(m[1]) * 100)
}

/**
 * `COLES DRINK SOY:REGU 1LITRE` -> `Coles Drink Soy:Regu 1litre`.
 *
 * Receipts shout. Only the in-store format is fully upper case, but running
 * this over both keeps one rule instead of two. A word that is already mixed
 * case is left alone — "McKenzie's" and "CSR" are how the brand writes itself,
 * and re-casing them would be worse than the shouting.
 */
export function titleCase(text: string): string {
  return text
    .split(' ')
    .map((word) => {
      if (word.length === 0) return word
      const isAllCaps = word === word.toUpperCase() && /[A-Z]/.test(word)
      if (!isAllCaps) return word
      // Keep the digits, lower the unit: 500ML -> 500ml, 6PACK -> 6pack.
      if (/^\d/.test(word)) return word.toLowerCase()
      return word.charAt(0) + word.slice(1).toLowerCase()
    })
    .join(' ')
}

/** Receipts escape apostrophes by doubling them: `I''m` -> `I'm`. */
function unescapeQuotes(text: string): string {
  return text.replace(/''/g, "'")
}

const ONLINE_MARKER = /Invoice number:|Online order/
const INSTORE_MARKER = /Served By:|Register:\s*\d+/

export function detectKind(text: string): ReceiptKind | null {
  if (ONLINE_MARKER.test(text)) return 'online'
  if (INSTORE_MARKER.test(text)) return 'instore'
  return null
}

/** `07 March 2026` or `18/08/2026` -> `2026-03-07` / `2026-08-18`. */
const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
}

export function parseDate(text: string): string | null {
  const long = text.match(/Invoice date:\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/)
  if (long) {
    const month = MONTHS[long[2].toLowerCase()]
    if (month) return `${long[3]}-${month}-${long[1].padStart(2, '0')}`
  }
  const short = text.match(/Date:\s*(\d{2})\/(\d{2})\/(\d{4})/)
  if (short) return `${short[3]}-${short[2]}-${short[1]}`
  return null
}

/** Section headings in the online invoice, which are also its category names. */
const ONLINE_SECTIONS = new Set([
  'Drinks', 'Pantry', 'Meat & Seafood', 'Fruit & Vegetables', 'Dairy, Eggs & Fridge',
  'Chips, Chocolates & Snacks', 'Cleaning & Laundry', 'Frozen', 'Home & Garden',
  'Bakery', 'Health & Beauty', 'Baby', 'Pet', 'Liquor', 'Deli',
])

function parseOnline(text: string): Receipt {
  const lines: ReceiptLine[] = []
  const skipped: string[] = []
  let section: string | null = null

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trimEnd()
    const trimmed = line.trim()
    if (trimmed.length === 0) continue

    if (ONLINE_SECTIONS.has(trimmed)) {
      section = trimmed
      continue
    }
    // Column header, footer, payment summary — everything that is not a product.
    if (/^Product\s+Ordered/.test(trimmed)) continue
    if (/Invoice date:|Page:|Tax Invoice|Payment|Flybuys|Total amount|GST|^Store:|^Email:/.test(trimmed)) continue

    // name ... ordered ... picked ... $unit ... $total
    // picked is either an integer or a weight like 1.395kg
    const m = trimmed.match(
      /^(.+?)\s{2,}(\d+)\s+([\d.]+kg|\d+)\s+\$([\d.]+)\s+\$([\d.]+)$/,
    )
    if (!m) {
      // A product whose name wrapped onto its own line has no numbers at all;
      // it is not an error, but it is not a line we can use either.
      if (/\$[\d.]+/.test(trimmed)) skipped.push(trimmed)
      continue
    }

    const [, rawName, , picked, unit, total] = m
    // A leading % marks a taxable line, not part of the name.
    const cleanName = unescapeQuotes(rawName.replace(/^%\s*/, '').trim())
    const weighed = picked.endsWith('kg')
    const totalCents = cents(total)
    if (totalCents === null) {
      skipped.push(trimmed)
      continue
    }

    lines.push({
      raw: cleanName,
      name: titleCase(cleanName),
      quantity: weighed ? null : Number(picked),
      kilos: weighed ? Number(picked.replace('kg', '')) : null,
      unitPriceCents: cents(unit),
      totalCents,
      section,
    })
  }

  return { kind: 'online', date: parseDate(text), lines, skipped }
}

/** `0.301 kg NET @ $7.90/kg` or `2 @ $1.70 EACH` */
function parseDetail(line: string): { quantity: number | null; kilos: number | null; unitPriceCents: number | null } | null {
  const byWeight = line.match(/([\d.]+)\s*kg\s+NET\s*@\s*\$([\d.]+)\/kg/i)
  if (byWeight) {
    return { quantity: null, kilos: Number(byWeight[1]), unitPriceCents: cents(byWeight[2]) }
  }
  const byEach = line.match(/^(\d+)\s*@\s*\$([\d.]+)\s*EACH/i)
  if (byEach) {
    return { quantity: Number(byEach[1]), kilos: null, unitPriceCents: cents(byEach[2]) }
  }
  return null
}

function parseInstore(text: string): Receipt {
  const lines: ReceiptLine[] = []
  const skipped: string[] = []
  const rows = text.split('\n')

  for (let i = 0; i < rows.length; i++) {
    const trimmed = rows[i].trim()
    if (trimmed.length === 0) continue
    // Everything after the total belongs to the payment terminal, not the trolley.
    if (/^Total for \d+ items?:/i.test(trimmed)) break
    if (/^(Store|Store Manager|Phone|Served By|Register|Date|Description)\b/i.test(trimmed)) continue

    //  [* or %] NAME IN CAPS      12.34
    const m = trimmed.match(/^([*%]?)\s*([A-Z0-9][A-Z0-9 .,:\-/&']*?)\s{2,}(\d+\.\d{2})$/)
    if (!m) {
      if (/\d+\.\d{2}\s*$/.test(trimmed) && !parseDetail(trimmed)) skipped.push(trimmed)
      continue
    }

    const [, , rawName, total] = m
    const totalCents = cents(total)
    if (totalCents === null) {
      skipped.push(trimmed)
      continue
    }

    // The line below may qualify it: a weight, or a count at a unit price.
    const detail = i + 1 < rows.length ? parseDetail(rows[i + 1].trim()) : null
    if (detail) i++

    const name = unescapeQuotes(rawName.trim())
    lines.push({
      raw: name,
      name: titleCase(name),
      quantity: detail ? detail.quantity : 1,
      kilos: detail?.kilos ?? null,
      unitPriceCents: detail?.unitPriceCents ?? totalCents,
      totalCents,
      section: null,
    })
  }

  return { kind: 'instore', date: parseDate(text), lines, skipped }
}

/** The one entry point. Throws only when the text is not a Coles receipt. */
export function parseReceipt(text: string): Receipt {
  const kind = detectKind(text)
  if (kind === null) {
    throw new Error('No reconozco este PDF como un recibo de Coles.')
  }
  return kind === 'online' ? parseOnline(text) : parseInstore(text)
}
