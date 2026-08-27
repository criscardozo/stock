import { describe, expect, it } from 'vitest'
import { duplicateShortNames, fold, matchEvent, matchEvents } from './match'
import type { Recipe } from '../domain/types'

function recipe(id: string, title: string, shortName?: string): Recipe {
  return {
    id,
    title,
    ...(shortName ? { shortName } : {}),
    servings: 2,
    tags: [],
    ingredients: [],
    timesCooked: 0,
  }
}

const RECIPES = [
  recipe('r-milanesas', 'Milanesas de pollo', 'milanesas'),
  recipe('r-berenjena', 'Milanesas de berenjena', 'berenjena'),
  recipe('r-thai', 'Comida thai'),
  recipe('r-bolo', 'Boloñesa', 'bolo'),
]

function event(summary: string, description?: string) {
  return { date: '2026-08-27', summary, ...(description ? { description } : {}) }
}

describe('fold', () => {
  it('folds case, padding and every diacritic — including the ñ', () => {
    expect(fold('  MILANESAS ')).toBe('milanesas')
    // `ñ` → `n` is deliberate and is NOT accent folding: it is what makes a
    // calendar typed on a phone match, where "bolonesa" and "boloñesa" are the
    // same intent. If this ever needs to change, the reason is in the docstring.
    expect(fold('Boloñesa')).toBe('bolonesa')
    expect(fold('bolonesa')).toBe(fold('boloñesa'))
    // Not fuzzy beyond that: these must stay different.
    expect(fold('Milanesas')).not.toBe(fold('Milanesas de pollo'))
  })
})

describe('matching by title', () => {
  it('matches a title exactly, ignoring case and accents', () => {
    const m = matchEvent(event('boloñesa'), RECIPES)
    expect(m).toMatchObject({ recipeId: 'r-bolo', source: 'title' })
  })

  it('matches a short name written as the title', () => {
    expect(matchEvent(event('milanesas'), RECIPES)).toMatchObject({
      recipeId: 'r-milanesas',
      source: 'shortName',
    })
  })

  it('leaves a near miss unmatched rather than guessing', () => {
    // The whole point: "Milanesas de" is not "Milanesas de pollo", and a fuzzy
    // matcher would plan the wrong dinner without anyone noticing.
    const m = matchEvent(event('Milanesas de'), RECIPES)
    expect(m.recipeId).toBeNull()
    expect(m.source).toBeNull()
  })

  it('leaves an event nobody has a recipe for unmatched', () => {
    expect(matchEvent(event('Asado en lo de mi vieja'), RECIPES).recipeId).toBeNull()
  })
})

describe('the description outranks the title', () => {
  it('takes the hashed short name even when the title matches something else', () => {
    // This is the case the field exists for: the title says milanesas and the
    // recipe meant is the aubergine one.
    expect(matchEvent(event('Milanesas', '#berenjena'), RECIPES)).toMatchObject({
      recipeId: 'r-berenjena',
      source: 'description',
    })
  })

  it('takes a hashed name among other prose', () => {
    expect(matchEvent(event('Cena', 'llevar postre\n#bolo'), RECIPES)).toMatchObject({
      recipeId: 'r-bolo',
      source: 'description',
    })
  })

  it('matches a hashed TITLE too, for a recipe with no short name', () => {
    // `#comida thai` would not survive the token regex, but the recipe's title
    // is still a handle someone might reach for.
    expect(matchEvent(event('Cena', 'Comida thai'), RECIPES)).toMatchObject({
      recipeId: 'r-thai',
      source: 'description',
    })
  })

  it('refuses a description that names two recipes', () => {
    // Someone thinking out loud is not an instruction, and picking the first
    // would plan a dinner nobody asked for.
    const m = matchEvent(event('Cena', '#thai no, mejor #bolo'), RECIPES)
    expect(m.recipeId).toBeNull()
    expect(m.source).toBeNull()
  })

  it('takes a bare recipe id', () => {
    expect(matchEvent(event('Cena', 'r-thai'), RECIPES)).toMatchObject({
      recipeId: 'r-thai',
      source: 'description',
    })
  })

  it('takes a bare short name only when it is the whole description', () => {
    expect(matchEvent(event('Cena', 'bolo'), RECIPES)).toMatchObject({ recipeId: 'r-bolo' })
    // A sentence that merely mentions one is prose, not an instruction.
    const mentioned = matchEvent(event('Cena', 'preguntar si quieren bolo o pizza'), RECIPES)
    expect(mentioned.recipeId).toBeNull()
  })

  it('falls back to the title when the description names nothing', () => {
    expect(matchEvent(event('Comida thai', 'llevar vino'), RECIPES)).toMatchObject({
      recipeId: 'r-thai',
      source: 'title',
    })
  })
})

describe('ambiguity is refused, not broken', () => {
  const twins = [
    recipe('r-a', 'Tarta de verdura', 'tarta'),
    recipe('r-b', 'Tarta de atún', 'tarta'),
  ]

  it('refuses two recipes sharing a short name and says which', () => {
    const m = matchEvent(event('tarta'), twins)
    expect(m.recipeId).toBeNull()
    expect(m.ambiguous).toEqual(['r-a', 'r-b'])
  })

  it('refuses the same through the description', () => {
    expect(matchEvent(event('Cena', '#tarta'), twins).recipeId).toBeNull()
  })

  it('reports duplicate short names so the editor can refuse them', () => {
    expect(duplicateShortNames(twins)).toEqual(['tarta'])
    expect(duplicateShortNames(RECIPES)).toEqual([])
  })
})

describe('a week at a time', () => {
  it('keeps every event, matched or not, in order', () => {
    const week = [event('Milanesas'), event('Cumple de Meli'), event('Cena', '#bolo')]
    const matches = matchEvents(week, RECIPES)
    expect(matches).toHaveLength(3)
    // The unmatched one is kept: the plan takes it as a free-text label rather
    // than dropping the day.
    expect(matches.map((m) => m.recipeId)).toEqual(['r-milanesas', null, 'r-bolo'])
    expect(matches[1].event.summary).toBe('Cumple de Meli')
  })
})
