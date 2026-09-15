#!/usr/bin/env python3
"""Generate Stock's colour declarations from tokens.json.

Re-pointed at kyber's `design/tokens.py`, once Gastos Diarios generated too and
kyber's filter — a shared thing enters only once it is won in two projects —
was satisfied. What moved there is the machinery both consumers had written
separately, down to the same reasoning in the comments: walking the token
document, spelling a value, rewriting a declaration WHERE IT ALREADY SITS, and
the verify/write pair with its reporting.

What stays here is SPELLING, on purpose, and it is not a thin wrapper around
identical logic — it is the one part kyber's own doc says will never move:
"what a destination's declaration LOOKS like is that project's business."
Three things below are Stock's alone:

- CSS writes BOTH light and dark, always, even when they are equal
  (`--mark-glyph`) — every colour token appears exactly 3 times in
  globals.css (`:root`, the media query, the forced selector), never 2, so
  `declarations()` returns three strings per token, not two.
- Theme.swift wraps past 102 columns, measured against every declaration on
  disk before this number was chosen (see the git history on this file).
- WatchTheme.swift carries a SUBSET, dark half only, in its own `init(hex:)`,
  because the watch target compiles no phone code. WHICH tokens is read from
  the file by kyber's `subset=True`, not listed here — this file typed out
  eight identifiers once and the file grew a ninth, which then sat outside the
  generator and drifted. What that flag cannot answer is whether a token is
  MISSING from the watch; `tokens.test.ts` holds that.

Radius and type stay hand-written, matching kyber's own decision on radius —
Stock names radii by ROLE (`--radius-card`), Gastos by value (`r18`), and iOS
has no radius tokens at all yet. Reconciling that is a second pass.

  python3 design-system/emit.py            print what each platform should say
  python3 design-system/emit.py --verify   compare against the files on disk
  python3 design-system/emit.py --write    rewrite the files from tokens.json
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[0]
CSS = REPO / "apps/web/src/app/globals.css"
SWIFT = REPO / "apps/ios/Stock/Design/Theme.swift"
WATCH = REPO / "apps/ios/StockWatch/WatchTheme.swift"


# The line-wrap cutoff is not a guess: every `static let` declaration in
# Theme.swift was measured before this was written. Collapsed to one line, the
# longest one that stayed on one line is 102 columns (`track`); the shortest
# one that was already wrapped is 105 (`lineSoft`). Nothing sits between them.
WRAP_AT = 102

sys.path.insert(0, str(REPO / "kyber" / "design"))
from tokens import Block, Destination, css_value, load, main  # noqa: E402


def is_colour(entry: dict) -> bool:
    """A destination takes what it is FOR, and says so by type.

    With one group this never came up — everything the walk produced was a
    colour. Passing `groups=["color", "radius"]` feeds every token to every
    destination, so each one declines what is not its own. By `$type` and not
    by the shape of `$value`: a colour is a pair and a dimension is a string
    TODAY, and reading the type asks the question the document answers rather
    than one it happens to imply.
    """
    return entry.get("$type") == "color"


def css_declarations(name: str, entry: dict) -> list[str]:
    if not is_colour(entry):
        return []
    lv = css_value(entry["$value"]["light"])
    dv = css_value(entry["$value"]["dark"])
    return [f"--{name}: {lv};", f"--{name}: {dv};", f"--{name}: {dv};"]


def css_pattern(name: str, entry: dict) -> re.Pattern:
    return re.compile(rf"--{re.escape(name)}:\s*[^;]+;")


def swift_args(entry: dict) -> str | None:
    """The `light: ..., dark: ...[, lightAlpha: ..., darkAlpha: ...]` argument
    list Theme.swift's `Color.hex` takes — or None for a token that names no
    Swift identifier (every `hue-*` token: `Theme.hue()` is a switch, not a
    flat list of `static let`, and generating into it is out of scope here)."""
    if "swift" not in entry.get("$extensions", {}):
        return None
    lv, dv = entry["$value"]["light"], entry["$value"]["dark"]
    if isinstance(lv, str):
        return f'light: "{lv.upper()}", dark: "{dv.upper()}"'
    return (
        f'light: "{lv["base"].upper()}", dark: "{dv["base"].upper()}", '
        f'lightAlpha: {lv["alpha"]:.2f}, darkAlpha: {dv["alpha"]:.2f}'
    )


def swift_declarations(name: str, entry: dict) -> list[str]:
    if not is_colour(entry):
        return []
    args = swift_args(entry)
    if args is None:
        return []
    ident = entry["$extensions"]["swift"]
    one_line = f"    static let {ident} = Color.hex({args})"
    if len(one_line) <= WRAP_AT:
        return [one_line]
    return [f"    static let {ident} = Color.hex(\n        {args})"]


def swift_pattern(name: str, entry: dict) -> re.Pattern | None:
    if not is_colour(entry):
        return None
    ident = entry.get("$extensions", {}).get("swift")
    if ident is None:
        return None
    return re.compile(
        rf'    static let {re.escape(ident)} = Color\.hex\(\s*\n?\s*'
        r'light: "#[0-9A-F]+", dark: "#[0-9A-F]+"'
        r'(?:, lightAlpha: [\d.]+, darkAlpha: [\d.]+)?\)'
    )


def watch_declarations(name: str, entry: dict) -> list[str]:
    if not is_colour(entry):
        return []
    ident = entry.get("$extensions", {}).get("swift")
    if ident is None:
        return []
    dv = entry["$value"]["dark"]
    if not isinstance(dv, str):
        return []
    return [f'    static let {ident} = Color(hex: "{dv.upper()}")']


def watch_pattern(name: str, entry: dict) -> re.Pattern | None:
    if not is_colour(entry):
        return None
    ident = entry.get("$extensions", {}).get("swift")
    if ident is None:
        return None
    return re.compile(rf'    static let {re.escape(ident)} = Color\(hex: "#[0-9A-F]+"\)')


def radius_declarations(name: str, entry: dict) -> list[str]:
    """One `static let` per role, inside `enum Radius`.

    CGFloat and not Double: every caller is a SwiftUI dimension, and a literal
    that arrives as the wrong numeric type is a compile error at each of them
    rather than here.
    """
    if entry.get("$type") != "dimension":
        return []
    value = entry["$value"]
    if not value.endswith("px"):
        raise ValueError(f"radius {name} is not in px: {value!r}")
    return [f"    static let {name}: CGFloat = {value[:-2]}"]


if __name__ == "__main__":
    doc = load(ROOT / "tokens.json")
    destinations = [
        Destination(CSS, css_declarations, css_pattern, label="globals.css"),
        Destination(SWIFT, swift_declarations, swift_pattern, label="Theme.swift"),
        Destination(WATCH, watch_declarations, watch_pattern, label="WatchTheme.swift", subset=True),
        # A BLOCK and not a Destination: Theme.swift names no radius at all, so
        # there is nothing for a pattern to find and swap. This one owns the
        # region between two anchors and writes the whole set into it.
        Block(
            SWIFT,
            radius_declarations,
            "// kyber:radius start",
            "// kyber:radius end",
            label="Theme.swift · Radius",
        ),
    ]
    sys.exit(main(doc, destinations, groups=["color", "radius"]))
