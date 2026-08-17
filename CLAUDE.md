# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

**Both clients are built.** The web is live at `stock.cardozo.dev` (Vercel, from
`main`); the iOS app builds and runs in the Simulator against the emulators.
What is NOT done: the Firestore rules are not deployed to `qcris-stock`, the
domain isn't in Firebase Auth's authorized list, and no iOS app is registered
(so its `GoogleService-Info.plist` is a placeholder and Google sign-in on iOS
cannot work yet). All three are console steps in `docs/setup.md`.
`README.md` is the specification, [`docs/PLAN.md`](docs/PLAN.md) holds the
architecture decisions and the phase order.

The UI is implemented against the design system in
[`docs/design/tokens.md`](docs/design/tokens.md), whose raw Claude Design export
is in `docs/design/reference/`. **Use those tokens — don't invent colours.** The
delivered design is light-only; a dark palette has to be designed, not guessed.

## What this is

A household pantry tracker for 2 users (Cristian + wife): what's in the house,
how much is left, what has to be bought, plus a weekly/fortnightly meal plan
that feeds the shopping list. Two clients, no custom backend:

- `apps/ios/` — SwiftUI app (iOS 17+, MVVM with `@Observable`, Firebase iOS SDK via SPM),
  optimised for the checks done standing in front of the fridge and for the supermarket.
  Barcode scanning (VisionKit + Open Food Facts), local expiry notifications, widget.
- `apps/web/` — Next.js App Router + TypeScript + Tailwind, fully client-rendered, deployed on
  Vercel Hobby at `stock.cardozo.dev`. Also an installable **PWA**, which is how the app stays
  permanently on the iPhone without Apple signing. This is where you sit down on a Friday to
  plan meals and write recipes.
- `firebase/` — Firestore security rules, indexes, emulator config, and rules tests
  (vitest + `@firebase/rules-unit-testing`).
- `shared/` — the cross-platform contract: `schema.md` (Firestore schema source of truth),
  `categories.json`, `locations.json`, `units.json`, `plan-period-vectors.json`,
  `shopping-vectors.json` (the suggestion rules, run by both platforms).

pnpm workspaces for the JS side (web + rules-tests). Swift and TS share no code — only data
contracts in `shared/`.

## Hard constraints (do not violate)

> The rules Cristian set, with the reasoning behind each — including the process
> ones that don't live in code (when to push, what may cost money, how to verify)
> — are collected in [`docs/reglas.md`](docs/reglas.md). This section stays the
> authoritative short form for the technical ones.

- **$0 infra budget.** Firebase Spark plan only — never introduce Cloud Functions (they require
  the paid Blaze plan). Vercel Hobby for web hosting. No paid services.
- **No custom backend.** Both clients talk directly to Firebase (Auth + Firestore).
  **Firestore security rules are the only security boundary** — client-side route gating is
  cosmetic.
- **Quantities are integers** in the item's own unit (`unit` | `g` | `ml`). Never floats — the
  same reasoning as money in cents. `1200 g` is displayed as `1,2 kg`; it is never stored that
  way. Items that can't be counted in integers use the `level` mode (`vacío/poco/medio/lleno`),
  not a decimal.
- **Dates are `"YYYY-MM-DD"` strings computed in the household's timezone** (stored on the
  household doc, default `Australia/Sydney`) — never the device timezone, never UTC bucketing.
- **The shopping list is stored and shared; the SUGGESTIONS are what's derived.** One
  `shoppingList` collection both members listen to — a tick strikes the row through on the other
  phone and never deletes it. Suggestions (items below minimum + what the plan needs) are
  computed on the client and written only when the user adds them; a removed row comes back as a
  suggestion, never as a row. Ticking touches no stock — `Cerrar compra` does, in one batch that
  also deletes those rows and leaves the unticked ones for next week. See PLAN §6.
- **Item state (`out`/`low`/`expiring`/`expired`) is derived** — never a persisted field.
- **Google Sign-In only** on both platforms (one provider per person — mixing Apple/Google
  creates two distinct Firebase UIDs for the same person, and the household caps at 2). Web
  serves Firebase's auth handler same-origin (`next.config.ts` rewrites `/__/auth/*`;
  `authDomain` = the serving host) so BOTH flows work under Safari ITP: popup in a browser tab,
  `signInWithRedirect` when running as an installed PWA. Adding a domain requires whitelisting
  `https://<domain>/__/auth/handler` as an OAuth redirect URI — see `docs/setup.md`.
- **Bounded reads.** The item catalogue is small and bounded (~150 docs) so it may be listened
  to whole; `moves` grows forever and is therefore always read with `getDocs` + `limit()`, never
  a live listener. In React, always return the unsubscribe from `useEffect` (StrictMode
  double-mount duplicating `onSnapshot` burns the free tier).
- **Open Food Facts is a convenience, never a dependency.** Every flow must work with the API
  unreachable: an unknown barcode still saves onto the item and the household's own catalogue
  recognises it next time.
- **Source code and comments in English. The UI is Spanish only** (no i18n framework — this was
  a deliberate call, unlike Gastos Diarios). Conversation with the user is in Spanish
  (Argentina).
- MIT license.

## Key design decisions (rationale in PLAN.md)

- **The item IS the stock.** One document holds both the catalogue entry and the current
  quantity — no separate product/stock-level indirection.
- **Hybrid measurement per item**: `tracking: "quantity"` (integer + unit + minimum) or
  `tracking: "level"` (0–3 dial). Recipes can only compute a numeric shortfall against counted
  items; a level-tracked ingredient that sits at `poco`/`vacío` goes on the list with the meal
  as its reason, without an invented number.
- **One expiry date per item**, not a batch ledger. A conscious simplification for a two-person
  household — see PLAN §5.
- Household join flow uses the **invite code as the document ID** (`invites/{code}`) because
  rules cannot secure `where` clause values. Self-add rule caps `memberIds` at 2.
- **Meal plan**: one slot per day (dinner), materialized lazily as one doc per period
  (`mealPlans/{startDate}`, deterministic ID → idempotent). Period length and start weekday are
  configurable (default fortnightly-capable, starting Saturday, because planning happens on
  Friday). Changing the config only affects future periods.
- **Cooking and buying are `writeBatch` operations** (items + moves + plan/recipe in one atomic
  write), and the UI never awaits the write promise — Firestore only resolves it on server
  confirmation.

## Family with Gastos Diarios

`/Users/cristian/dev/personal/gastos-diarios` is the sibling app: same author,
same household, same visual language. Refinements proven there have been ported
here and are listed with their reasoning in [`docs/reglas.md`](docs/reglas.md)
§10 — the CSS layering rule, the 16px touch-field rule, the version card, the
bundled Outfit, the signing-expiry warning, `hasPendingWrites`. **Look there
before inventing a pattern this project has already met.**

## Commands

- `pnpm dev` — Next.js dev server (`apps/web`). Point it at the emulators with
  `NEXT_PUBLIC_USE_EMULATORS=1`, which also turns on the emulator-only sign-in
  buttons so screens can be driven without a Google account.
- `pnpm seed` — fills the emulators with a household that looks real (24 items, 5
  recipes, a plan, a half-ticked list). Needs `pnpm emulators` running.
- `pnpm typecheck && pnpm lint && pnpm build` — web checks.
- `pnpm test:web` — vitest, includes the shared vector tests.
- `pnpm test:rules` — Firestore rules tests (spins up the emulator via `firebase emulators:exec`;
  needs Java).
- `pnpm emulators` — local emulator suite (Auth 9099, Firestore **8085**, UI 4000). 8085 and not
  the usual 8080 because Cristian's own Docker stack (`ecko`/`holocron`) lives there.
- iOS: `cd apps/ios && xcodegen && open Stock.xcodeproj`. CLI tests:
  `xcodebuild test -project Stock.xcodeproj -scheme Stock -destination 'platform=iOS Simulator,name=<iPhone>' -only-testing:StockTests`.
  `StockTests` compiles `Stock/Domain` directly rather than depending on the app
  target — the shared vectors don't need Firebase, and shouldn't wait for it.
- Driving the iOS app without a Google account:
  `xcrun simctl launch booted dev.cardozo.stock -useEmulators -devSignIn -tab falta`
  (`-devSignIn` and `-tab` only exist when pointed at the emulators).
- Deploy rules: `firebase deploy --only firestore:rules,firestore:indexes --config firebase/firebase.json --project qcris-stock`.
- One-time console setup (Firebase project creation, Google provider, Vercel, domain):
  `docs/setup.md`.
