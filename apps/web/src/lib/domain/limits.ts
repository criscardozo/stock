/**
 * The sizes Firestore's rules refuse, mirrored where a form can say so first.
 *
 * The rules are the boundary and they do reject — but a rejected write does not
 * LOOK rejected. Firestore applies it to the local cache immediately, so the
 * person watches the thing save and then, a moment later, gets an error dialog
 * about it. For one character too many. Saying so at the field is the
 * difference between a constraint and a trap.
 *
 * Nothing here truncates. Typing is allowed past the limit and the form says by
 * how much, because the alternative — `maxLength`, which silently drops the tail
 * of a pasted recipe — loses text somebody wrote without telling them. Two
 * fields used to work that way and no longer do.
 *
 * `parity.test.ts` reads `firestore.rules` and fails if any of these drifts, so
 * this is a mirror and not a second opinion.
 */
export const FIELD_LIMITS = {
  householdName: 60,
  itemName: 80,
  itemNameEs: 80,
  recipeTitle: 120,
  recipeShortName: 40,
  recipeSteps: 5000,
  shoppingLabel: 80,
} as const

/**
 * How far past the limit, counting the way the rules count.
 *
 * `.trim()` because that is what every writer here sends: the rules see the
 * trimmed string, so a field warning about trailing spaces would be warning
 * about something that never reaches the server.
 */
export function overBy(value: string, limit: number): number {
  return Math.max(0, value.trim().length - limit)
}
