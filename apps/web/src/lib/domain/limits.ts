/**
 * The sizes Firestore's rules refuse, mirrored where a form can stop them first.
 *
 * The rules are the boundary and they do reject — but a rejected write does not
 * look rejected. Firestore applies it to the local cache immediately, so the
 * person sees the thing saved and then, a moment later, an error dialog about
 * it. For one character too many. Stopping it at the input is not belt and
 * braces; it is the difference between a constraint and a trap.
 *
 * `parity.test.ts` reads `firestore.rules` and fails if any of these drifts from
 * it, so this file is a mirror rather than a second opinion. Raise one and the
 * test names the file that disagrees.
 *
 * Only the fields a form actually caps live here. Several others are capped in
 * the rules and enforced by neither client — listed in docs/plan-mejoras.md,
 * because deciding what a paste of 6000 characters should DO is a product
 * question, not a missing constant.
 */
export const FIELD_LIMITS = {
  /** The household's name, on the onboarding form and in Ajustes. */
  householdName: 60,
  /** A recipe's short name, which the meal plan matches free text against. */
  recipeShortName: 40,
} as const
