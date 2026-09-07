# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

**Both clients are built and live.** The web runs at `stock.cardozo.dev`
(Vercel, from `main`) and the iOS app is sideloaded on the phone, with a watchOS
companion embedded. The three console steps that used to be open are done: the
Firestore rules are deployed to `qcris-stock` (an anonymous read returns 403),
the domain serves Firebase's auth handler same-origin, and the iOS app is
registered — `Stock/Resources/GoogleService-Info.plist` carries the real client
id. `docs/setup.md` still describes those steps for a rebuild.

The free signing team lasts **7 days**: the phone build stops opening after that
and has to be reinstalled. Ajustes shows exactly when it expires.
`README.md` is the specification, [`docs/PLAN.md`](docs/PLAN.md) holds the
architecture decisions and the phase order.

The UI is implemented against the design system in
[`docs/design-system.md`](docs/design-system.md) — the scale by role, the palette
in both appearances, the shape rules and the anatomy of a screen. It is shared
with Gastos Diarios: same system, different brand colour. **Use those tokens —
don't invent colours.**

The raw Claude Design handover lives in `docs/design/`, which is gitignored: it
is a generated bundle, not source, and a clone builds without it.
`tools/icons/build-icons.sh` is the one thing that reads it.

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
  confirmation. Genuinely ONE batch: `inBatches` refuses past 166 rows rather than splitting,
  because splitting is what would break the guarantee this line makes.

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
  needs a **JDK 21 or newer** — firebase-tools 15 dropped the older ones and refuses to start
  rather than warning).
- `pnpm test:e2e` — Playwright, against the emulators. Needs `pnpm emulators` AND `pnpm seed`
  running first: the suite drives the seeded household through `Cerrar compra`, which is the
  operation with the most consequences and the least readable from source.
- `pnpm verify:pwa` — PWA smoke check (service worker, precache, offline cold start, and that
  the auth handler is never cached). Needs a PRODUCTION build already serving:
  `pnpm build && pnpm --filter web exec next start -p 3113`. Port 3113 and not 3112 because
  Gastos Diarios runs the same check on 3112.
- CI runs the web checks, the rules tests, the E2E suite and the PWA check on every push
  (`.github/workflows/ci.yml`). Ubuntu only: a macOS runner bills at 10x, so **the iOS tests
  are not in CI** and have to be run locally before a change lands.
- `pnpm emulators` — local emulator suite in its own block: Auth **9280**, Firestore **8280**
  (websocket **9380**), UI **4280**, hub **4680**, logging **4780**. Not one of them is a Firebase
  default, on purpose. Measured on 2026-09-07: an SSH forward on this machine holds 4000, 8080,
  8085, 9099, 9150 AND 9199 — the whole default set plus the 8085 this project used to use. And
  **no probe can tell the difference**: all three of 8280, 8085 and 8080 answer `Ok` at the root,
  and 8080 forwards to a real Firestore emulator that is merely EMPTY — same 404 JSON as ours,
  character for character. `wait-on` passes, a REST call gets a 200, and the failure arrives as
  `Cannot read properties of undefined`, which says nothing about a port. Only data you seeded
  distinguishes them. Check with `lsof -nP -iTCP:<port> -sTCP:LISTEN` before suspecting the rules.
  The number is decided in `firebase/firebase.json` and repeated as a default in nine files that
  cannot read it; `apps/web/src/lib/domain/ports.test.ts` holds all ten together.
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
