# Design tokens

Extracted from the Claude Design project
(`13dcbc91-3f4f-400f-b3c7-e17502fbb732`, synced 2026-08-17). The raw export
lives in [`reference/`](reference/) — when this file and the export disagree,
the export is right and this is a stale reading of it.

**Use these tokens. Do not invent colours.** They are declared once, in
`apps/web/src/app/globals.css`, as Tailwind v4 `@theme` variables, so every
utility class in the app resolves back here.

## The idea

Same grammar as Cristian's Gastos Diarios: Outfit, Material Symbols Rounded, a
cream ground, white cards with an 8 % hairline, 18–24 px radii, 999 px pills and
tabular numbers. What changed is the accent: **verde albahaca**, not coral.

Colour is rationed on purpose. The category circles are muted so the accent can
carry only the things that matter — the primary action, the active nav item, the
level dial and the `Poco` state.

## Palette

| Token | Value | Used for |
|---|---|---|
| `--color-ground` | `#F3F4EE` | page background, sunken controls inside cards |
| `--color-surface` | `#FCFCF8` | cards, sheets, sidebar boxes |
| `--color-ink` | `#1B2119` | primary text |
| `--color-ink-2` | `#7C8578` | secondary text, inactive nav |
| `--color-ink-3` | `#AFB6AA` | tertiary text, placeholders, section labels |
| `--color-ink-4` | `#CFD3C9` | disabled glyphs, em-dashes |
| `--color-line` | `rgba(27,33,25,.09)` | card hairline, dividers |
| `--color-line-soft` | `rgba(27,33,25,.07)` | row separators inside a card |
| `--color-line-strong` | `rgba(27,33,25,.18)` | unchecked checkbox border |
| `--color-primary` | `#2E9E5B` | primary action, active states, level dial |
| `--color-primary-deep` | `#1D7A43` | text/icon on soft primary, links |
| `--color-primary-soft` | `rgba(46,158,91,.13)` | active nav pill, `Poco` chip |
| `--color-danger` | `#E5484D` | `Falta` chip, badge counts |
| `--color-danger-deep` | `#C0353A` | `Vencido`, expired dates |
| `--color-danger-soft` | `rgba(229,72,77,.13)` | danger chip background |
| `--color-member-a` | `#2A6FDB` | first member's avatar |
| `--color-member-b` | `#E0447C` | second member's avatar |

Shadows: `0 6px 16px rgba(46,158,91,.3)` under a primary pill button,
`0 20px 50px rgba(27,33,25,.14)` under a sheet.

### Category colours

Each category owns a foreground/background pair. The background is the same hue
at ~14 % so a 36 px circle reads as a tint, not a blob.

| Hue | Foreground | Background | Categories |
|---|---|---|---|
| olive | `#6E7C1C` | `rgba(138,155,35,.14)` | Frutas y verduras |
| wine | `#9E3E53` | `rgba(180,72,95,.14)` | Carnicería |
| blue | `#286D91` | `rgba(46,127,168,.14)` | Pescadería · (Heladera, Freezer) |
| amber | `#996A0C` | `rgba(201,138,18,.15)` | Lácteos y huevos · Panadería |
| violet | `#6B54A0` | `rgba(139,111,190,.15)` | Almacén |
| teal | `#25808B` | `rgba(46,155,168,.15)` | Limpieza · (Lavadero) |
| magenta | `#A34E80` | `rgba(192,103,155,.15)` | Higiene |
| brown | `#8F5626` | `rgba(181,115,58,.15)` | (Alacena) |

Seed data carrying these lives in `shared/categories.json` and
`shared/locations.json`, keyed by hue name so the palette stays in one place.

## Type

**Outfit**, self-hosted through `next/font`. Weights in use: 400, 500, 600, 700.

| Role | Size / weight |
|---|---|
| Page title | 23 / 700, `letter-spacing:-0.02em` |
| Sheet title | 19 / 700 |
| Row title | 14.5–15 / 600 |
| Body | 13.5–14 / 400–600 |
| Row subtitle, chips | 12–12.5 |
| Section label | 11 / 700, uppercase, `letter-spacing:.07em`, `--color-ink-3` |

Every number that can change — quantities, counts, dates — is
`font-variant-numeric: tabular-nums`, so a row doesn't jitter when it updates.

**Material Symbols Rounded** for icons, loaded from Google with `display=block`
(a symbol that flashes as text is worse than one that arrives late).

## Shapes

| Element | Radius |
|---|---|
| Pills, steppers, chips, progress bars | `999px` |
| Sheets | `24px` |
| Cards (grouped list) | `20px` |
| Day rows, summary cards, sidebar boxes | `18px` |
| Inputs, sunken fields | `14px` |
| Nav items | `12px` |
| Level dial segments | `3px` |

## The pieces that carry meaning

- **Stepper** — a sunken pill: `remove` · tabular quantity · `add`. The `remove`
  glyph goes `--color-ink-4` at zero, which is the cheapest possible "you can't
  go lower".
- **Level dial** — four 14×8 segments; filled ones `--color-primary`, empty ones
  `rgba(27,33,25,.11)`, with the level's name beside it. Never a number.
- **State chips** — `Falta` is solid `--color-danger` with white text (the only
  place a chip is solid, because out-of-stock is the loudest state), `Poco` is
  `--color-primary-soft` with `--color-primary-deep` text, `Vence pronto` and
  `Lo pide el plan` are neutral `rgba(27,33,25,.07)`, and `Vencido` is solid
  `--color-danger-deep`.
- **Why a row is there** — every shopping row carries its reason as a subtitle,
  with plan-driven reasons in `--color-primary-deep` next to a `local_dining`
  glyph.

## Dark mode

**Not designed yet.** The delivered system is the light, cream one. Rather than
invent a dark palette next to a designed light one, the app ships light-only
until dark is designed — the README says dark mode is wanted, and that is still
true, it just isn't guessed at here.
