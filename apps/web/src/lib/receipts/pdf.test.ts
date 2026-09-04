import { describe, expect, it } from 'vitest'
import { layoutPage } from './pdf'

/**
 * Column reconstruction, on the fragment shape pdfjs actually hands back.
 *
 * A receipt's meaning is in its columns, and parse.ts splits fields on two or
 * more spaces. So the failure that matters here is not a crash — it is output
 * that still reads like a receipt to a human while the name has run into the
 * quantity, which parse.ts then reads as one field.
 */

/** `transform` is a 6-element matrix; pdfjs puts x at [4] and y at [5]. */
function frag(text: string, x: number, y: number, width = text.length * 4.7) {
  return { str: text, transform: [1, 0, 0, 1, x, y], width }
}

describe('layoutPage', () => {
  it('separates columns by at least the two spaces parse.ts splits on', () => {
    const line = layoutPage([
      frag('Leche entera', 50, 700, 60),
      frag('2', 300, 700, 5),
      frag('1.250,00', 400, 700, 40),
    ])
    expect(line).toMatch(/Leche entera {2,}2 {2,}1\.250,00/)
  })

  it('keeps fragments of one word together', () => {
    // pdfjs splits on font changes mid-word. A gap of zero must not become a
    // space, or "Leche" and "ntera" arrive at parse.ts as two fields.
    expect(layoutPage([frag('Le', 50, 700, 9.4), frag('che', 59.4, 700, 14.1)])).toBe('Leche')
  })

  it('groups a row by y within tolerance and orders rows top-down', () => {
    // Out of order on input, and the second fragment sits 2pt low — a
    // subscript, not a new line.
    expect(
      layoutPage([frag('abajo', 50, 600, 20), frag('arriba', 50, 700, 25), frag('x', 90, 698, 5)]),
      // The exact space count is PT_PER_SPACE's business, tested above as
      // "2 or more". What this asserts is the grouping and the order.
    ).toMatch(/^arriba {2,}x\nabajo$/)
  })

  it('starts a new row when the drop is a real line', () => {
    expect(layoutPage([frag('uno', 50, 700, 15), frag('dos', 50, 690, 15)])).toBe('uno\ndos')
  })

  it('drops whitespace-only fragments without losing the gap they sat in', () => {
    // The bug this guards: filtering only `''` lets a ' ' fragment through, and
    // its x + width advances the cursor past the column gap, so the two columns
    // are joined by one space and parse.ts reads them as a single field.
    // A ONE-character blank, whose width spans the whole gap: it contributes a
    // single space of its own and leaves the cursor at the next column, so the
    // gap is never measured. A wider blank would smuggle in enough spaces of
    // its own to hide the bug, which is why this fixture is the narrow one.
    const line = layoutPage([
      frag('Arroz', 50, 700, 25),
      frag(' ', 75, 700, 325),
      frag('890,00', 400, 700, 30),
    ])
    expect(line).toMatch(/Arroz {2,}890,00/)
  })

  it('is empty for a page with nothing on it', () => {
    expect(layoutPage([])).toBe('')
    expect(layoutPage([frag('  ', 50, 700, 10)])).toBe('')
  })
})
