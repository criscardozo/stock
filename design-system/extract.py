#!/usr/bin/env python3
"""Build `tokens.json` from the files that are the truth TODAY.

This is an extractor, not a generator: it reads `globals.css` and `Theme.swift`
and writes the token file that will later generate them back. It runs once per
change and its output is committed, so the JSON is never hand-typed — a
hand-typed token file would be a FOURTH copy of the palette, which is the exact
problem the file exists to end.

Nothing here is portable, on purpose. Every path and every naming rule below is
Stock's. Gastos' equivalent carries Gastos' paths for the same reason, and the
shared thing between them is the FORMAT, not this script.

    python3 design-system/extract.py          # print what would change
    python3 design-system/extract.py --write  # write tokens.json
"""

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSS = ROOT / "apps/web/src/app/globals.css"
SWIFT = ROOT / "apps/ios/Stock/Design/Theme.swift"
OUT = Path(__file__).resolve().parent / "tokens.json"


def strip_comments(text: str) -> str:
    """Blank out `/* ... */`, keeping newlines so line numbers still line up.

    Not optional. This file opens with a comment that NAMES both `:root` and
    `@theme`, so a plain `index()` finds the prose and brace-counts from there.
    Looking for `@theme` returned the `:root` block — a different block, fully
    parseable, silently wrong. Reading `:root` "worked" only because the regex
    below ignores prose; one `--x: #fff;` written inside a comment would have
    made it wrong too, with nothing to say so.
    """
    return re.sub(r"/\*.*?\*/", lambda m: re.sub(r"[^\n]", " ", m.group(0)), text, flags=re.S)


def css_block(text: str, marker: str) -> str:
    """The whole brace-balanced body starting at `marker`."""
    text = strip_comments(text)
    start = text.index(marker)
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    raise SystemExit(f"unclosed block: {marker}")


def declarations(block: str) -> dict:
    return {m[1]: m[2].strip() for m in re.finditer(r"--([a-z0-9-]+):\s*([^;]+);", block)}


def as_value(raw: str):
    """`#rrggbb` stays a string; `rgba(r, g, b, a)` becomes `{base, alpha}`.

    Keeping the alpha pair apart is not tidiness. `--line-card` and
    `--neutral-soft` are THE SAME ink at different strengths, and flattening
    both to an opaque rgba would throw away the fact that changing the ink has
    to move both.
    """
    raw = raw.strip()
    if raw.startswith("#"):
        return raw.lower()
    m = re.fullmatch(r"rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)", raw)
    if not m:
        raise SystemExit(f"cannot read colour: {raw!r}")
    r, g, b = (int(m[i]) for i in (1, 2, 3))
    return {"base": "#%02x%02x%02x" % (r, g, b), "alpha": float(m[4])}


def swift_names(src: str) -> dict:
    """CSS name -> the EXACT Swift identifier, never derived.

    Three of these are not reachable from the CSS name by any rule
    (`--ink-secondary` is `ink2`), and a kebab-to-camel emitter would be wrong
    on them while looking right on the other thirteen. That is the more
    dangerous ratio: a convention that fails most tokens announces itself on
    the first build; one that fails three looks like it works.
    """
    declared = set(re.findall(r"static let (\w+) = Color\.hex\(", src))
    mapping = {
        "ground": "ground", "surface": "surface",
        "ink": "ink", "ink-secondary": "ink2", "ink-tertiary": "ink3",
        "ink-quaternary": "ink4",
        "line-card": "line", "line-soft": "lineSoft", "line-strong": "lineStrong",
        "neutral-soft": "neutralSoft", "track": "track",
        "primary": "primary", "primary-deep": "primaryDeep",
        "primary-soft": "primarySoft", "on-primary": "onPrimary",
        "mark-from": "markFrom", "mark-to": "markTo", "mark-glyph": "markGlyph",
        "danger": "danger", "danger-deep": "dangerDeep",
        "danger-soft": "dangerSoft", "on-danger": "onDanger",
        "member-a": "memberA", "member-b": "memberB",
    }
    missing = sorted(v for v in mapping.values() if v not in declared)
    if missing:
        raise SystemExit(f"Theme.swift no longer declares: {missing}")
    return mapping


DESCRIPTIONS = {
    "ground": "App background",
    "surface": "Cards and sheets",
    "ink": "Primary text",
    "ink-secondary": "Secondary text",
    "ink-tertiary": "Tertiary text, section labels",
    "ink-quaternary": "Quaternary text, the faintest readable step",
    "line-card": "Card border",
    "line-soft": "Hairline between rows",
    "line-strong": "Border that has to be seen",
    "neutral-soft": "Inset fills",
    "track": "Progress and level track",
    "primary": "Brand green",
    "primary-deep": "Green for text on light surfaces",
    "primary-soft": "Green tint behind the accent",
    "on-primary": "Text ON the accent",
    "mark-from": "App mark gradient, top",
    "mark-to": "App mark gradient, bottom",
    "mark-glyph": "The drawing on the mark",
    "danger": "Out of stock, expired",
    "danger-deep": "Danger for text on light surfaces",
    "danger-soft": "Danger tint",
    "on-danger": "Text ON danger",
    "member-a": "Member C",
    "member-b": "Member M",
}

GROUPS = [
    ("core", ["ground", "surface", "ink", "ink-secondary", "ink-tertiary",
              "ink-quaternary"]),
    ("line", ["line-card", "line-soft", "line-strong", "neutral-soft", "track"]),
    ("accent", ["primary", "primary-deep", "primary-soft", "on-primary"]),
    ("mark", ["mark-from", "mark-to", "mark-glyph"]),
    ("state", ["danger", "danger-deep", "danger-soft", "on-danger"]),
    ("member", ["member-a", "member-b"]),
]

# The eight category hues, each a foreground plus its tint. They are the ramp:
# product identity, and the part Cristian kept per-app.
HUES = ["olive", "wine", "blue", "amber", "violet", "teal", "magenta", "brown"]


def tracked(*globs) -> list:
    out = []
    for g in globs:
        r = subprocess.run(["git", "ls-files", g], cwd=ROOT, capture_output=True, text=True)
        out += [ROOT / p for p in r.stdout.split("\n") if p]
    return out


def count(pattern: str, files: list) -> dict:
    """How often each captured value appears, across tracked files only."""
    tally: dict = {}
    for f in files:
        for m in re.finditer(pattern, f.read_text(encoding="utf-8")):
            tally[m[1]] = tally.get(m[1], 0) + 1
    return tally


def main() -> int:
    css = CSS.read_text(encoding="utf-8")
    swift = SWIFT.read_text(encoding="utf-8")
    light = declarations(css_block(css, ":root"))
    dark = declarations(css_block(css, "@media (prefers-color-scheme: dark)"))
    names = swift_names(swift)

    def token(css_name: str) -> dict:
        if css_name not in light:
            raise SystemExit(f"globals.css has no --{css_name}")
        # A token absent from the dark block keeps its light value there, which
        # is what the cascade already does. Saying so explicitly is the point:
        # `--mark-glyph` is the same cream in both appearances ON PURPOSE.
        t = {
            "$type": "color",
            "$description": DESCRIPTIONS.get(css_name, ""),
            "$value": {
                "light": as_value(light[css_name]),
                "dark": as_value(dark.get(css_name, light[css_name])),
            },
        }
        if css_name in names:
            t["$extensions"] = {"swift": names[css_name]}
        return t

    colour: dict = {}
    for group, members in GROUPS:
        colour[group] = {n: token(n) for n in members}
    colour["hue"] = {}
    for h in HUES:
        colour["hue"][f"hue-{h}"] = token(f"hue-{h}")
        colour["hue"][f"hue-{h}-soft"] = token(f"hue-{h}-soft")

    web = tracked("apps/web/src/**/*.tsx", "apps/web/src/**/*.css")
    ios = tracked("apps/ios/**/*.swift")

    sizes_web = count(r"text-\[([0-9.]+)px\]", web)
    sizes_ios = count(r"\.stock\(([0-9.]+)", ios)
    type_tokens = {}
    for size in sorted(set(sizes_web) | set(sizes_ios), key=float):
        key = "s" + size.replace(".", "_")
        type_tokens[key] = {
            "$type": "dimension",
            "$value": f"{size}px",
            "$extensions": {
                "stock.uses": {"web": sizes_web.get(size, 0), "ios": sizes_ios.get(size, 0)}
            },
        }

    # Radius is named by ROLE here, not by value. `--radius-card` survives a
    # decision to make cards 20px; an `r18` would have to be renamed, and every
    # use of it re-read to find out which ones were cards.
    # The radius tokens live in `@theme`, not `:root` — Tailwind v4 needs them
    # there to make `rounded-card` exist as a utility at all. Reading the wrong
    # block is how this script failed its first run, and it failed LOUDLY, which
    # is the only reason the mistake is in the git history and not in the JSON.
    radius_css = declarations(css_block(css, "@theme inline"))
    uses_class = count(r"rounded-(card|panel|sheet|field|nav)", web)
    radius = {}
    for role in ["card", "panel", "sheet", "field", "nav"]:
        key = f"radius-{role}"
        if key not in radius_css:
            raise SystemExit(f"globals.css has no --{key}")
        radius[role] = {
            "$type": "dimension",
            "$value": radius_css[key],
            "$extensions": {"stock.uses": {"web": uses_class.get(role, 0)}},
        }

    doc = {
        "$description": (
            "Stock's design tokens. Extracted from globals.css and Theme.swift by "
            "extract.py — never edited by hand, because a hand-edited copy is a "
            "fourth place the palette can disagree with itself."
        ),
        "color": colour,
        "type": type_tokens,
        "radius": radius,
    }
    text = json.dumps(doc, indent=2, ensure_ascii=False) + "\n"

    if "--write" in sys.argv:
        OUT.write_text(text, encoding="utf-8")
        print(f"wrote {OUT.relative_to(ROOT)}")
        return 0
    if OUT.exists() and OUT.read_text(encoding="utf-8") == text:
        print("tokens.json is up to date")
        return 0
    print("tokens.json would change; run with --write")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
