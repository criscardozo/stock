// Matching a calendar event to a recipe.
//
// The calendar is the household's meals calendar, so every event in the week is
// a candidate — there is nothing to filter out. What varies is how confidently
// an event can be tied to a recipe, and this module's job is to be honest about
// that rather than to maximise hits: a plan that quietly says Thursday is
// aubergine milanesas when it is chicken ones is worse than a Thursday left
// blank, because nobody re-reads a plan that looks right.
//
// Nothing here writes. It returns proposals for a human to confirm.

import type { Recipe } from '../domain/types'

/** The parts of a Google Calendar event this cares about. */
export interface CalendarEvent {
  /** `YYYY-MM-DD`, already resolved in the household's timezone by the caller. */
  date: string
  summary: string
  description?: string
}

export type MatchSource =
  /** The description named the recipe outright — an instruction, not a guess. */
  | 'description'
  /** The event title equalled a recipe's short name. */
  | 'shortName'
  /** The event title equalled a recipe's title. */
  | 'title'

export interface Match {
  event: CalendarEvent
  /** Null when nothing matched, or when more than one thing did. */
  recipeId: string | null
  source: MatchSource | null
  /**
   * Set when the event named something that more than one recipe answers to.
   * The ids are carried so the UI can ask which, instead of picking one.
   */
  ambiguous?: string[]
}

/**
 * Case, padding and every diacritic folded away; everything else left alone.
 *
 * That includes `ñ` → `n`, which is not accent folding — `ñ` is its own letter
 * in Spanish, not an `n` wearing a tilde. It is folded anyway because this
 * matches what someone TYPES into a calendar on a phone, where "bolonesa" and
 * "boloñesa" are the same intent. The cost is that two words differing only by
 * a tilde would collide; among recipe names that is not a real scenario.
 *
 * Deliberately NOT fuzzy beyond that. Levenshtein or token overlap would turn
 * "Milanesas" into a match for "Milanesas de berenjena", which is the exact
 * failure this module exists to avoid. Anything short of equality is left
 * unmatched for a human to resolve — and the short name is the escape hatch for
 * when two titles really are that close.
 */
export function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
}

/**
 * The recipe a description points at, if any.
 *
 * Accepts a bare id, a `#short-name`, or either on its own line among other
 * prose — the description is also where a human writes "llevar postre", so the
 * marker has to survive company. `#` is matched first because it is
 * unambiguous; a bare token is only accepted when it is the entire description,
 * so a sentence mentioning "milanesas" does not become an instruction.
 */
function fromDescription(description: string, recipes: Recipe[]): Match['recipeId'] | undefined {
  const hashed = [...description.matchAll(/#([\p{L}\p{N}_-]+)/gu)].map((m) => m[1])
  // Two markers is someone thinking out loud ("#thai no, mejor #bolo"), not an
  // instruction. Refused for the same reason two recipes sharing a short name
  // are: this module does not break ties it was not given the means to break.
  if (hashed.length > 1) return null
  const candidate = hashed.length === 1 ? hashed[0] : description
  const folded = fold(candidate)
  if (folded === '') return undefined

  const byId = recipes.find((r) => r.id === candidate.trim())
  if (byId) return byId.id
  // Short name first, then title: both are handles a person might write, and
  // the short one is the more deliberate of the two.
  for (const handle of [(r: Recipe) => r.shortName, (r: Recipe) => r.title]) {
    const hits = recipes.filter((r) => {
      const value = handle(r)
      return value !== undefined && fold(value) === folded
    })
    if (hits.length === 1) return hits[0].id
    if (hits.length > 1) return null
  }
  return undefined
}

/**
 * One event to one proposal.
 *
 * The ladder, and why it is in this order: the description wins when it names
 * something, because writing an id there is a deliberate instruction and the
 * title is only ever an inference. That is what makes the field useful —
 * without it, an event titled "Milanesas" could never be pointed at the
 * aubergine ones.
 */
export function matchEvent(event: CalendarEvent, recipes: Recipe[]): Match {
  if (event.description?.trim()) {
    const byDescription = fromDescription(event.description, recipes)
    if (byDescription !== undefined) {
      if (byDescription === null) {
        return { event, recipeId: null, source: null, ambiguous: ambiguousFor(event, recipes) }
      }
      return { event, recipeId: byDescription, source: 'description' }
    }
  }

  const folded = fold(event.summary)
  if (folded === '') return { event, recipeId: null, source: null }

  const byShort = recipes.filter((r) => r.shortName && fold(r.shortName) === folded)
  if (byShort.length === 1) return { event, recipeId: byShort[0].id, source: 'shortName' }
  if (byShort.length > 1) {
    return { event, recipeId: null, source: null, ambiguous: byShort.map((r) => r.id) }
  }

  const byTitle = recipes.filter((r) => fold(r.title) === folded)
  if (byTitle.length === 1) return { event, recipeId: byTitle[0].id, source: 'title' }
  if (byTitle.length > 1) {
    return { event, recipeId: null, source: null, ambiguous: byTitle.map((r) => r.id) }
  }

  return { event, recipeId: null, source: null }
}

/**
 * Which recipes answer to what this event's description said — for the "which
 * one?" prompt. Empty when the description was refused for naming two things
 * rather than for naming one ambiguous thing; the UI falls back to asking
 * outright, which is the honest prompt for "I could not tell what you meant".
 */
function ambiguousFor(event: CalendarEvent, recipes: Recipe[]): string[] {
  const hashed = [...(event.description ?? '').matchAll(/#([\p{L}\p{N}_-]+)/gu)].map((m) => m[1])
  if (hashed.length > 1) return []
  const needle = fold(hashed.length === 1 ? hashed[0] : (event.description ?? ''))
  return recipes
    .filter((r) => [r.shortName, r.title].some((v) => v !== undefined && fold(v) === needle))
    .map((r) => r.id)
}

export function matchEvents(events: CalendarEvent[], recipes: Recipe[]): Match[] {
  return events.map((event) => matchEvent(event, recipes))
}

/**
 * Short names that more than one recipe uses.
 *
 * Rules cannot compare siblings, so uniqueness is enforced here and in the
 * editor. Surfaced rather than resolved: two recipes sharing a handle is a
 * mistake to fix, not a tie for this module to break.
 */
export function duplicateShortNames(recipes: Recipe[]): string[] {
  const seen = new Map<string, number>()
  for (const recipe of recipes) {
    if (!recipe.shortName) continue
    const key = fold(recipe.shortName)
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([key]) => key)
}
