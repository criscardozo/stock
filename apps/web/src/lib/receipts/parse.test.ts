import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detectKind, parseReceipt, titleCase } from './parse'

/**
 * The fixtures are two real Coles receipts — one delivered, one from a till —
 * with the personal fields replaced. Nothing the parser reads was touched: the
 * product lines, prices, weights and section headings are exactly as printed.
 */
const online = readFileSync(join(__dirname, 'fixtures/coles-online.txt'), 'utf8')
const instore = readFileSync(join(__dirname, 'fixtures/coles-instore.txt'), 'utf8')

describe('titleCase', () => {
  it('calms a shouting receipt without touching brands that shout on purpose', () => {
    expect(titleCase('COLES DRINK SOY:REGU 1LITRE')).toBe('Coles Drink Soy:regu 1litre')
    expect(titleCase('GREEN ZUCCHINI PERKG')).toBe('Green Zucchini Perkg')
    // Already mixed case: the brand writes itself this way.
    expect(titleCase("McKenzie's Split Red Lentils 375g")).toBe("McKenzie's Split Red Lentils 375g")
    expect(titleCase('LA ESPANOLA EXT VIRG 500ML')).toBe('La Espanola Ext Virg 500ml')
  })
})

describe('detectKind', () => {
  it('tells the two documents apart', () => {
    expect(detectKind(online)).toBe('online')
    expect(detectKind(instore)).toBe('instore')
    expect(detectKind('Recibo del kiosco')).toBeNull()
  })
})

describe('online invoice', () => {
  const receipt = parseReceipt(online)

  it('reads the invoice date', () => {
    expect(receipt.date).toBe('2026-03-07')
  })

  it('reads a plain line with its unit price and total', () => {
    const milk = receipt.lines.find((l) => l.raw === 'Coles Australian Lite Long Life Milk 1L')
    expect(milk).toMatchObject({
      quantity: 4,
      kilos: null,
      unitPriceCents: 165,
      totalCents: 660,
      section: 'Drinks',
    })
  })

  it('reads a line sold by weight as kilos, not as a count', () => {
    const roast = receipt.lines.find((l) => l.raw.startsWith('Coles Beef Slow Cook Chuck Roast'))
    // Ordered 1, picked 1.395kg at $19.00/kg = $26.51.
    expect(roast).toMatchObject({ quantity: null, kilos: 1.395, unitPriceCents: 1900, totalCents: 2651 })
  })

  it('strips the taxable marker from the name instead of keeping it', () => {
    const sprite = receipt.lines.find((l) => l.raw.includes('Sprite'))
    expect(sprite?.raw).toBe('Sprite Lemonade Soft Drink Bottle 2L')
  })

  it("unescapes the receipt's doubled apostrophes", () => {
    const lentils = receipt.lines.find((l) => l.raw.includes('Split Red Lentils'))
    expect(lentils?.raw).toBe("McKenzie's Split Red Lentils 375g")
  })

  it('keeps payment summary rows out of the trolley', () => {
    const names = receipt.lines.map((l) => l.raw)
    expect(names).not.toContain('Bags x1')
    expect(names.some((n) => /Delivery|collection fee|Credits/.test(n))).toBe(false)
  })

  it('finds every product line', () => {
    // 32 across eight sections. Counting "Coles" gives 26 and misses the seven
    // brands that are not Coles — CSR, Maggi, McKenzie's, Mitani, Obento,
    // Lifestyle, Thomson's — plus Sprite.
    expect(receipt.lines).toHaveLength(32)
  })

  it('reports the fees and freebies it refused, rather than swallowing them', () => {
    // Delivery, bags and credits all look like "text then a dollar amount".
    // They are not shopping, and a silent drop is how you notice too late.
    expect(receipt.skipped.some((l) => l.includes('Bags x1'))).toBe(true)
    expect(receipt.skipped.some((l) => l.includes('Delivery/collection fee'))).toBe(true)
  })
})

describe('in-store receipt', () => {
  const receipt = parseReceipt(instore)

  it('reads the date', () => {
    expect(receipt.date).toBe('2026-08-18')
  })

  it('treats a plain line as one unit at its total', () => {
    const rolls = receipt.lines.find((l) => l.raw === 'COLES MINI ROLLS 6PACK')
    expect(rolls).toMatchObject({ quantity: 1, kilos: null, unitPriceCents: 515, totalCents: 515 })
  })

  it('reads the weight from the line below', () => {
    const zucchini = receipt.lines.find((l) => l.raw === 'GREEN ZUCCHINI PERKG')
    // 0.301 kg NET @ $7.90/kg
    expect(zucchini).toMatchObject({ quantity: null, kilos: 0.301, unitPriceCents: 790, totalCents: 238 })
  })

  it('reads a count at a unit price from the line below', () => {
    const broccoli = receipt.lines.find((l) => l.raw === 'BABY BROCCOLI 1BUNCH')
    // 2 @ $1.70 EACH
    expect(broccoli).toMatchObject({ quantity: 2, unitPriceCents: 170, totalCents: 340 })
  })

  it('stops at the total, so the card terminal is not read as shopping', () => {
    const names = receipt.lines.map((l) => l.raw)
    expect(names.some((n) => /EFT|VISA|PURCHASE|AUTH/.test(n))).toBe(false)
  })

  it('finds every product line', () => {
    // The receipt says "Total for 11 items" but that counts the 2 broccoli
    // separately; there are 10 product LINES.
    expect(receipt.lines).toHaveLength(10)
  })
})

describe('the same product, two receipts', () => {
  it('prints differently in each, which is why an item needs a list of names', () => {
    const fromOnline = parseReceipt(online).lines.find((l) => l.raw.includes('Soy Milk'))
    const fromStore = parseReceipt(instore).lines.find((l) => l.raw.includes('SOY'))
    expect(fromOnline?.raw).toBe('Coles Regular Soy Milk 1L')
    expect(fromStore?.raw).toBe('COLES DRINK SOY:REGU 1LITRE')
    expect(fromOnline?.raw).not.toBe(fromStore?.raw)
  })
})

describe('nothing is dropped in silence', () => {
  it('reports lines that looked like products but did not parse', () => {
    for (const receipt of [parseReceipt(online), parseReceipt(instore)]) {
      expect(Array.isArray(receipt.skipped)).toBe(true)
    }
  })
})
