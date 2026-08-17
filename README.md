# Stock

Household pantry tracker for two people: what's in the house, how much is left,
what needs buying — and a fortnightly meal plan that feeds the shopping list.
A SwiftUI iOS app for the quick checks you do standing in front of the fridge, a
Next.js web app for everything you sit down to do on a Friday night, both talking
directly to Firebase (Auth + Firestore, Spark free tier), with no custom backend
and **$0 infrastructure**.

> **Status: design stage.** Nothing is implemented yet — this README is the
> specification, [`docs/PLAN.md`](docs/PLAN.md) is the architecture and the
> phased build order.

| | |
|---|---|
| 📱 iOS | `apps/ios` — SwiftUI, iOS 17+, Firebase SDK via SPM, offline-first. Barcode scanning, expiry notifications, home-screen widget |
| 🌐 Web | `apps/web` — Next.js App Router, Tailwind, Vercel (`stock.cardozo.dev`). Also an installable **PWA**, which is how it stays on the phone |
| 🔥 Firebase | `firebase/` — security rules (the only security boundary), indexes, emulator tests |
| 🤝 Contracts | `shared/` — Firestore schema, seed categories, and the test vectors both platforms must pass |
| 📐 Design | `docs/design/` — tokens + Claude Design reference |
| 🗺 Plan | [`docs/PLAN.md`](docs/PLAN.md) — architecture decisions and phases |
| 📜 Rules | [`docs/reglas.md`](docs/reglas.md) — the project's constraints and the reasoning behind them |

## What it does

Three questions, in the order they get asked:

1. **What do we have?** A catalogue of everything the household keeps in stock —
   food, cleaning, toiletries — each with a quantity, a location (fridge /
   freezer / pantry / …) and a reorder minimum.
2. **What are we eating?** Recipes live in the app, and every Friday the next
   week or fortnight gets planned: one meal per day, picked from the recipes.
   Marking a meal as cooked offers to subtract its ingredients from stock.
3. **What has to be bought?** A list that builds itself from two sources: items
   at or below their minimum, and ingredients the planned meals need but the
   house doesn't have. Ticking something off asks how much came in and puts it
   back into stock — at which point it drops off the list on its own.

Everything is shared between the two members of the household: both see the same
stock, the same plan and the same list, in real time.

### How quantities work

Weighing flour is not a thing anyone sustains, so **each item picks how it's
measured**:

- **Counted** — an integer quantity in `unit`, `g` or `ml`, with a minimum.
  `Huevos: 8 u (mín. 6)`. This is what makes an exact shortfall computable.
- **Level** — `vacío / poco / medio / lleno`, for staples nobody measures:
  salt, oil, flour, dish soap. No arithmetic, just a four-step dial.

Recipes can only compute a numeric shortfall against counted items. When a
planned meal needs a level-tracked item that sits at `poco` or `vacío`, the item
goes on the list with the meal as its reason — no invented numbers.

## Screens

Spanish UI. iOS is the one used on the move; web is the one used sitting down.
The two share the same data and most of the same views, deliberately: the
difference is what each is optimised for, not what each can do.

### Web (`stock.cardozo.dev`)

| Screen | What it's for |
|---|---|
| **Stock** (home) | The catalogue. Search, filter by location and category, status chips (`Falta`, `Poco`, `Vence pronto`). Inline `+ / −` on quantity, level dial for the rest. Add item. |
| **Falta comprar** | The shopping list, grouped by category. Every row shows *why* it's there (`quedan 2, mínimo 6` · `para Fideos boloñesa, miércoles`). Manual extras. Ticking opens the restock sheet. |
| **Plan** | The week or fortnight: one row per day, each holding a recipe, a free-text label (`Afuera`, `Sobras`) or nothing. This is the Friday screen. `Cocinada` opens the consumption sheet. |
| **Recetas** | List + detail + editor. Ingredients link to stock items, so the detail shows an availability traffic light and a "faltan 3 ingredientes" summary. |
| **Ajustes** | Household, invite code, locations, categories, plan length (weekly/fortnightly) and which weekday it starts. |

### iOS

| Screen | What it's for |
|---|---|
| **Stock** | Same catalogue, thumb-first. Search, quick `+ / −`, scan a barcode to find or create an item. |
| **Falta comprar** | Supermarket mode: big tap targets, tick as you walk, restock on the way out. The single most-used screen. |
| **Hoy** | What's being cooked today, its ingredients, and one button to mark it cooked. |
| **Recetas** | Read-mostly, for cooking from the phone. |
| **Ajustes** | Mirror of the web's. |
| Widget | Today's meal + how many items are missing. |

### Design notes

- **Mobile-first, one-handed.** The list gets used walking around a supermarket
  with a trolley in the other hand.
- **Dense but scannable.** ~150 items is a long list; status has to read at a
  glance without colour being the only signal.
- Dark mode from the start — half of these checks happen at night.
- No chart library: bars are divs, lines are hand-written SVG.

## Data model

Full schema in `shared/schema.md` (source of truth); the shape and the reasoning
behind it in [`docs/PLAN.md`](docs/PLAN.md).

```
users/{uid}                                  displayName, householdId
households/{hid}                             memberIds (max 2), timezone, locations, categories, planConfig
households/{hid}/items/{id}                  the catalogue AND the stock: tracking, quantity|level, minimum,
                                             locationId, categoryId, barcodes, expiresAt, snoozedUntil
households/{hid}/recipes/{id}                title, servings, steps, ingredients[] → itemId
households/{hid}/mealPlans/{startDate}       one doc per period, one entry per day
households/{hid}/shoppingExtras/{id}         manual additions only — the rest of the list is derived
households/{hid}/moves/{id}                  append-only log: purchase | cook | adjust | waste
invites/{code}                               the code IS the document id
```

**The shopping list is not stored.** It's computed on the client from items +
the meal plan, both of which are already in cache. Only manual extras are
written. Buying something updates the item, which removes it from the list as a
side effect — zero writes to maintain a list.

## Tech stack

| Piece | Choice |
|---|---|
| iOS | SwiftUI, iOS 17+, MVVM with `@Observable`, Firebase iOS SDK via SPM, Firestore offline persistence, VisionKit `DataScannerViewController` for EAN-13, local `UserNotifications` for expiry, WidgetKit |
| Web | Next.js (App Router) + TypeScript, Tailwind CSS, Firebase JS SDK (client-only, `onSnapshot`), installable PWA with its own service worker |
| Data | Firebase Auth (Google only) + Cloud Firestore, Spark plan; rules and indexes versioned in `firebase/` |
| Product data | [Open Food Facts](https://world.openfoodfacts.org) — free, no API key — to fill in name/brand/size from a scanned barcode. Optional: an unknown code still saves, and the household's own catalogue recognises it next time |
| Hosting | Vercel Hobby, `stock.cardozo.dev` |
| Testing | `@firebase/rules-unit-testing` + emulator (vitest), Playwright E2E against the emulators, XCTest, shared vectors run by both platforms |
| CI | GitHub Actions, Ubuntu only — macOS runners bill at 10×, so iOS is verified locally |

**No backend, on purpose.** Both clients talk straight to Firebase. Cloud
Functions require the paid Blaze plan and are therefore out of the question;
anything that would want a server runs in a client.

## Key invariants

- **Quantities are integers** in the item's own unit (`unit`, `g`, `ml`). No
  floats — same reasoning as money in cents. Display formatting (`1,2 kg`) is a
  client concern.
- **Dates are `"YYYY-MM-DD"` strings in the household timezone** (stored on the
  household doc, default `Australia/Sydney`) — never the device's, never UTC
  bucketing. A meal planned for Wednesday is Wednesday in Sydney.
- **One item, one row.** Expiry is a single date on the item — the soonest one
  you care about — not a batch ledger. Two milks with different dates is not
  worth the modelling cost for a two-person household.
- **Firestore security rules are the security boundary.** Client-side gating is
  cosmetic; client config is public by design.
- **Bounded reads.** The catalogue is small and bounded (~150 docs) so it can be
  listened to whole; `moves` grows forever and is therefore always paged with
  `limit()` via `getDocs`, never a live listener. In React, always return the
  unsubscribe from `useEffect`.
- **Google Sign-In only**, on both platforms — mixing providers creates two
  Firebase UIDs for the same person, and the household caps at 2.
- Logic duplicated across Swift and TypeScript must pass the shared vectors in
  `shared/` (plan period arithmetic, shopping-list derivation). Change the
  vectors first.
- **Source code and comments in English**; the UI is Spanish only.
- MIT license.

## Quick start

Nothing to run yet — see [`docs/PLAN.md`](docs/PLAN.md) Phase 0. Once scaffolded:

```sh
pnpm install
pnpm dev            # web on :3000
pnpm test           # web unit tests + Firestore rules (emulator, needs Java)
pnpm emulators      # Auth 9099, Firestore 8080, UI 4000
cd apps/ios && xcodegen && open Stock.xcodeproj
```

One-time console setup (Firebase project, Vercel, domain): [`docs/setup.md`](docs/setup.md).

## License

[MIT](LICENSE)
