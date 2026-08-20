import { describe, expect, it } from 'vitest'
import type { Item } from '@/lib/domain/types'
import { buildActions, summarise, type Decision } from './actions'
import type { ConsolidatedLine } from './consolidate'
import type { MatchedLine } from './match'

const DEFAULTS = { categoryId: 'frutas-verduras', locationId: 'heladera' }

function line(raw: string, extra: Partial<ConsolidatedLine> = {}): ConsolidatedLine {
  return {
    raw,
    name: raw,
    buys: 1,
    dates: [],
    normalPriceCents: 500,
    lastPriceCents: 500,
    onlyEverOnSpecial: false,
    ...extra,
  }
}

function unknown(l: ConsolidatedLine) {
  return { line: l, match: { status: 'unknown', item: null, suggestions: [] } as unknown as MatchedLine }
}

function known(l: ConsolidatedLine, item: Item) {
  return { line: l, match: { status: 'known', item, suggestions: [] } as unknown as MatchedLine }
}

describe('buildActions', () => {
  it('puts a created item where the LINE says, not where the screen defaults', () => {
    const decisions: Record<string, Decision> = {
      CHOC: { kind: 'create', categoryId: 'snacks-dulces', locationId: 'alacena' },
    }
    const [action] = buildActions([unknown(line('CHOC'))], decisions, DEFAULTS)
    expect(action).toMatchObject({
      kind: 'create',
      item: { categoryId: 'snacks-dulces', locationId: 'alacena' },
    })
  })

  it('falls back to the screen default when the line says nothing', () => {
    const [action] = buildActions([unknown(line('X'))], { X: { kind: 'create' } }, DEFAULTS)
    expect(action).toMatchObject({ kind: 'create', item: DEFAULTS })
  })

  it('carries the Spanish name through when one was typed', () => {
    const decisions: Record<string, Decision> = {
      SOY: { kind: 'create', nameEs: '  Leche de soja  ' },
    }
    const [action] = buildActions([unknown(line('SOY'))], decisions, DEFAULTS)
    expect(action).toMatchObject({ kind: 'create', item: { nameEs: 'Leche de soja' } })
  })

  it('leaves nameEs off entirely when it is blank', () => {
    // An empty string would fail the rules' string check for no reason, and
    // an empty subtitle renders as a stray separator in the row.
    const [action] = buildActions([unknown(line('X'))], { X: { kind: 'create', nameEs: '   ' } }, DEFAULTS)
    expect(action.kind).toBe('create')
    if (action.kind === 'create') expect('nameEs' in action.item).toBe(false)
  })

  it('creates at zero stock: a shop from March is not food in the kitchen', () => {
    const [action] = buildActions([unknown(line('X'))], { X: { kind: 'create' } }, DEFAULTS)
    expect(action).toMatchObject({ kind: 'create', item: { quantity: 0, minQuantity: 0 } })
  })

  it('stores the normal price, not the discounted one', () => {
    const l = line('CHOC', { normalPriceCents: 1000, lastPriceCents: 500 })
    const [action] = buildActions([unknown(l)], { CHOC: { kind: 'create' } }, DEFAULTS)
    expect(action).toMatchObject({ priceCents: 1000 })
  })

  it('applies a known line without needing a decision', () => {
    const item = { id: 'soy', name: 'Soy' } as Item
    const [action] = buildActions([known(line('SOY'), item)], {}, DEFAULTS)
    expect(action).toMatchObject({ kind: 'link', itemId: 'soy', receiptName: 'SOY' })
  })

  it('a known line ignores any decision left over from a previous filter', () => {
    // The list is re-filtered as the threshold moves; a stale "create" must not
    // duplicate an item the household already has.
    const item = { id: 'soy', name: 'Soy' } as Item
    const [action] = buildActions([known(line('SOY'), item)], { SOY: { kind: 'create' } }, DEFAULTS)
    expect(action.kind).toBe('link')
  })

  it('does nothing for a line left alone', () => {
    const [action] = buildActions([unknown(line('BAGS'))], {}, DEFAULTS)
    expect(action).toEqual({ kind: 'skip' })
  })

  it('stores the receipt text verbatim, which is what matches next time', () => {
    const l = line('COLES DRINK SOY:REGU 1LITRE', { name: 'Coles Drink Soy:regu 1litre' })
    const [action] = buildActions([unknown(l)], { [l.raw]: { kind: 'create' } }, DEFAULTS)
    expect(action).toMatchObject({
      receiptName: 'COLES DRINK SOY:REGU 1LITRE',
      item: { name: 'Coles Drink Soy:regu 1litre' },
    })
  })
})

describe('summarise', () => {
  it('counts what will actually be written', () => {
    const item = { id: 'a', name: 'A' } as Item
    const actions = buildActions(
      [known(line('A'), item), unknown(line('B')), unknown(line('C'))],
      { B: { kind: 'create' } },
      DEFAULTS,
    )
    expect(summarise(actions)).toEqual({ prices: 1, created: 1, skipped: 1 })
  })
})
