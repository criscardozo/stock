# Firestore schema — source of truth

Both clients implement this document. When it disagrees with the code, the
document is right and the code is a bug. Reasoning behind the shape lives in
[`docs/PLAN.md`](../docs/PLAN.md); this file is the contract.

Conventions used throughout:

- **Dates are `"YYYY-MM-DD"` strings** computed in the household timezone. Never
  `Timestamp`, never UTC bucketing. Only audit fields (`createdAt`, `at`) are
  server timestamps, because they mark *when the write happened*, not what day
  something belongs to.
- **Quantities are non-negative integers** in the item's own `unit`. `1200` with
  `unit: "g"` renders as `1,2 kg`; it is never stored as `1.2`.
- **Money is integer cents** (AUD), and only ever the optional reference price.
- `?` marks an optional field. Absent and `null` are equivalent; clients write
  absent.

---

## `users/{uid}`

The signed-in person. Written only by that person.

| Field | Type | Notes |
|---|---|---|
| `displayName` | string | from the Google account, editable |
| `photoURL?` | string | from the Google account |
| `householdId?` | string | denormalised convenience. **`households/{id}.memberIds` is the authorisation source of truth** — never authorise off this field |
| `createdAt` | timestamp | server |
| `updatedAt` | timestamp | server |

## `households/{householdId}`

One document per household, read by both members on every screen: it carries the
config, the categories and the locations, so a single listener covers all of it.

| Field | Type | Notes |
|---|---|---|
| `name` | string | |
| `timezone` | string | IANA, default `Australia/Sydney`. Every calendar date in the app is computed in this zone |
| `currency` | string | `"AUD"`. Only used to format the optional reference price |
| `memberIds` | string[] | **max 2**, enforced in the rules. The authorisation boundary |
| `members` | map | `{ [uid]: { displayName, photoURL? } }` — denormalised for display, so showing "agregado por Cris" costs no extra read. Keys must match `memberIds` |
| `locations` | map | `{ [id]: { name, icon, hue, sortOrder } }` |
| `categories` | map | `{ [id]: { name, icon, hue, kind, sortOrder } }`, `kind: "food" \| "household"` — only `food` categories are offered as recipe ingredients |
| `planConfig` | map | `{ length: "weekly" \| "fortnightly", startWeekday: 0-6 }` where **0 = Sunday** (JS convention). Default `6` (Saturday): the plan is written on Friday and shopped on the weekend |
| `createdAt`, `updatedAt` | timestamp | server |

Categories and locations are **maps keyed by id, not arrays**: updating one entry
of an array of maps in Firestore means rewriting the whole array.

`icon` is a Material Symbols Rounded ligature (`nutrition`, `kebab_dining`, …)
and `hue` names an entry in the palette (`olive`, `wine`, `blue`, `amber`,
`violet`, `teal`, `magenta`, `brown`, `green`) rather than a raw colour — so
restyling the palette is one edit in `docs/design-system.md` and its CSS, not a
data migration.

## `households/{hid}/items/{itemId}`

The catalogue *and* the stock, in one document. There is no separate "product"
and "stock level" — for a two-person household the indirection only buys writes.

| Field | Type | Notes |
|---|---|---|
| `name` | string | 1–80 chars. For anything bought at Coles this is the receipt's own English name, so a later receipt matches it |
| `nameEs?` | string | ≤80. What it is called at home, shown as the subtitle. `Leche de soja` under `Coles Regular Soy Milk 1L` |
| `brand?` | string | |
| `categoryId` | string | key into `households.categories` |
| `locationId` | string | key into `households.locations` |
| `tracking` | string | `"quantity"` or `"level"` — decides which pair of fields below applies |
| `unit` | string | `"unit" \| "g" \| "ml"`. **Required when `tracking == "quantity"`** |
| `quantity` | int ≥ 0 | current stock in `unit`. Required when `tracking == "quantity"` |
| `minQuantity` | int ≥ 0 | reorder threshold. Required when `tracking == "quantity"` |
| `level` | int 0–3 | `0` empty · `1` low · `2` half · `3` full. Required when `tracking == "level"` |
| `minLevel` | int 0–3 | suggest at or below this. Default `1`. Required when `tracking == "level"` |
| `spare?` | int ≥ 0 | sealed containers behind the open one. Only meaningful with `tracking == "level"`: `level` measures the bottle in use, `spare` counts the ones still closed |
| `minSpare?` | int ≥ 0 | how many sealed ones to keep. Its presence is what turns the reserve on — an item without it behaves exactly as before |
| `autoSuggest?` | bool | `false` makes the item **catalogue only**: it keeps every detail and stays visible in stock, but running out never puts it on the list. For the things bought once in a while. Absent or `true` ⇒ the behaviour that predates the field |
| `packSize?` | string | free text like `"500 g"`, informational, usually from Open Food Facts |
| `barcodes` | string[] | EANs seen for this item. Matched with `array-contains` when scanning |
| `receiptNames` | string[] | ≤20. Every line a receipt has used for this product, verbatim. Same idea as `barcodes` and for the same reason: one product has several names. Coles prints `Coles Regular Soy Milk 1L` online and `COLES DRINK SOY:REGU 1LITRE` at the till |
| `expiresAt?` | date | the one expiry that matters (the soonest). **Not a batch ledger** — see PLAN §5 |
| `snoozedUntil?` | date | silences the *suggestion* until this date. Does not affect the list |
| `lastPriceCents?` | int ≥ 0 | reference only. No totals, no budget — that's Gastos Diarios' job |
| `notes?` | string | |
| `createdAt`, `updatedAt` | timestamp | server |
| `updatedBy` | string | uid. Attribution, not ownership: either member may edit anything |

A catalogue-only item is still `out` when it is empty — the state is a fact
about the stock, not about whether anyone wants to be told. What `autoSuggest`
changes is the SUGGESTION, and only the part of it the minimum drives: a planned
meal still asks for the item, because planning one is an explicit request and an
ingredient nobody buys is a dinner that does not happen.

**Derived, never stored**: `out` (`quantity == 0` / `level == 0`), `low`
(`<= min`), `expired` (`expiresAt < today`), `expiring` (`expiresAt <= today+3`). With a
reserve, `out` needs the open one empty AND no spare left, and `low` also fires
on `spare < minSpare` — opening the last bottle of a pair is what puts detergent
on the list, not waiting for it to run dry.
Persisting these would mean rewriting documents to keep them in sync with the
fields that already determine them.

## `households/{hid}/recipes/{recipeId}`

| Field | Type | Notes |
|---|---|---|
| `title` | string | 1–120 chars |
| `shortName?` | string | 1–40 chars. A short handle for the recipe, so a calendar event can say `milanesas` instead of the full title. Matched case- and accent-insensitively. Uniqueness is a client concern — rules cannot compare siblings — and an ambiguous one makes the matcher refuse rather than pick |
| `servings` | int ≥ 1 | stored but **not used to scale** in the MVP — the recipe is cooked as written |
| `steps?` | string | free text |
| `tags` | string[] | e.g. `["rápido", "vegetariano"]` |
| `icon?` | string | Material Symbols ligature for the card (`ramen_dining`, `oven_gen`, …). Defaults to `restaurant` |
| `ingredients` | array of maps | see below |
| `timesCooked` | int ≥ 0 | |
| `lastCookedAt?` | date | |
| `createdAt`, `updatedAt` | timestamp | server |

Each ingredient:

| Field | Type | Notes |
|---|---|---|
| `label` | string | what the recipe calls it — always shown, even when linked |
| `itemId?` | string | link into `items`. **Only linked ingredients participate in any calculation** |
| `quantity?` | int | in `unit`. Only meaningful when the linked item is `tracking: "quantity"` |
| `unit?` | string | must match the linked item's unit |
| `optional` | bool | optional ingredients never generate a shortfall |

An ingredient without `itemId` (salt, "un chorrito de vinagre") is free text: it
shows in the recipe and is invisible to the suggestion engine, on purpose.

## `households/{hid}/mealPlans/{startDate}`

One document per planning period. **The document id is `startDate`**, which makes
lazy creation idempotent: if both clients materialise the period at the same
moment they write the same doc with the same values.

| Field | Type | Notes |
|---|---|---|
| `startDate`, `endDate` | date | inclusive range; `endDate = startDate + (7\|14) - 1 days` |
| `length` | string | `"weekly" \| "fortnightly"` — the value in force when this period was created. Changing the config never rewrites past periods |
| `days` | map | `{ [date]: { recipeId?, label?, status, cookedAt? } }` — one dinner slot per day, `status: "planned" \| "cooked" \| "skipped"` |
| `createdAt`, `updatedAt` | timestamp | server |

A day entry may carry a `recipeId` (a real recipe), just a `label` (`"Afuera"`,
`"Sobras"`) or neither (nothing planned). Only `planned` days with a `recipeId`
generate shopping suggestions; `cooked` ones are already eaten.

## `households/{hid}/shoppingList/{entryId}`

**The** list — one, shared, live, no history. Both members hold a listener on it,
which is what makes a tick in one aisle strike the row through in the other.

| Field | Type | Notes |
|---|---|---|
| `label` | string | what the row reads |
| `itemId?` | string | absent for a loose addition that isn't in the catalogue |
| `quantity?` | int, `unit?` | how much to buy |
| `source` | string | `"min" \| "plan" \| "manual"` — where the row came from |
| `reason?` | string | **frozen when added** (`"quedan 2, mínimo 6"`). Not recomputed: it explains why the row got here, not what's true now |
| `checked` | bool | ticked = struck through. The row stays visible so nobody buys it twice |
| `checkedAt?` | timestamp, `checkedBy?` | uid |
| `addedAt` | timestamp, `addedBy` | uid |

Adding is explicit — suggestions are computed on the client and written only when
the user accepts them, so a row you deleted never comes back as a row (it comes
back as a suggestion, which is different). `Cerrar compra` is one batch: ticked
rows fold into stock, write their `moves`, and are deleted; unticked rows stay
for next week.

## `households/{hid}/moves/{moveId}`

Append-only log of everything that changed a stock level. Create-only in the
rules: never updated, never deleted.

| Field | Type | Notes |
|---|---|---|
| `itemId` | string | |
| `type` | string | `"purchase" \| "cook" \| "adjust" \| "waste"` |
| `delta?` | int | signed, in the item's unit. For `tracking: "quantity"` items |
| `levelFrom?`, `levelTo?` | int 0–3 | for `tracking: "level"` items |
| `recipeId?`, `planDate?` | string, date | context when `type == "cook"` |
| `at` | timestamp | server |
| `by` | string | uid |

**This collection grows forever**, so it is never listened to: it's read with
`getDocs` + `limit()` for an item's recent history, and that's the only reason it
exists in the MVP.

## `invites/{code}`

Top-level on purpose: someone who is not yet a member has to be able to read it.
**The code is the document id** — the capability *is* knowing it — because rules
cannot inspect the values in a `where` clause, so `where code == …` could not be
secured.

| Field | Type | Notes |
|---|---|---|
| `householdId` | string | |
| `createdBy` | string | uid |
| `createdAt` | timestamp | server |

`get` is allowed to any signed-in user; **`list` is denied**, so ids cannot be
enumerated. Only members create or delete them.

---

## Index requirements

Everything else is covered by Firestore's automatic single-field indexes.

| Collection | Index | Why |
|---|---|---|
| `moves` | `itemId ASC, at DESC` | an item's recent history |
