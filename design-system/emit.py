#!/usr/bin/env python3
"""Generate Stock's colour declarations from tokens.json.

Mirrors Gastos Diarios' `design-system/emit.py` on purpose — same shape, same
reasoning, so the day kyber extracts a shared emitter (its filter: only once
BOTH consumers generate — see `08dbf42`) the two are close enough to fold into
one. Radius is deliberately excluded from this first pass, matching that same
kyber decision: Stock's radius tokens are named by ROLE (`--radius-card`), not
by value like Gastos' `r18`, and iOS carries no radius tokens at all — every
`cornerRadius:` is a raw number at its call site. Reconciling that is a second
pass, not this one. Type is excluded too: nothing here writes a font size.

  python3 design-system/emit.py            print what each platform should say
  python3 design-system/emit.py --verify   compare against the files on disk
  python3 design-system/emit.py --write    rewrite the files from tokens.json

`--verify` is the switch. Before it, tokens.json mirrors globals.css and
Theme.swift, extracted by extract.py, and a test checks they have not drifted.
After `--write` runs once and `--verify` passes, the files are written FROM
tokens.json — the check becomes "regenerate and see nothing changed," which is
stronger than comparing text because it proves the files can be rebuilt, not
merely that they currently match.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[0]
TOKENS = json.loads((ROOT / "tokens.json").read_text())
CSS = REPO / "apps/web/src/app/globals.css"
SWIFT = REPO / "apps/ios/Stock/Design/Theme.swift"
# The watch is a THIRD copy, dark half only. `StockWatch` compiles no phone
# code — the extension would collide with Theme.swift's if both were linked —
# so it carries its own `init(hex:)` and a SUBSET of names. The rewrite below
# is a no-op for a name this file does not declare, so the subset needs no
# list of its own to go stale; `WATCH_NAMES` exists only to decide whether to
# even ATTEMPT the no-op, not to gate correctness.
WATCH = REPO / "apps/ios/StockWatch/WatchTheme.swift"
WATCH_NAMES = {"ground", "surface", "ink", "ink2", "ink3", "primary", "primaryDeep", "onPrimary"}

# The line-wrap cutoff below is not a guess: every `static let` declaration in
# Theme.swift was measured before this was written. Collapsed to one line, the
# longest one that stayed on one line is 102 columns (`track`); the shortest
# one that was already wrapped is 105 (`lineSoft`). Nothing sits between them.
WRAP_AT = 102


def flat() -> list[tuple[str, dict]]:
    """Every colour token as (name, entry), in tokens.json's own group order."""
    return [(name, entry) for group in TOKENS["color"].values() for name, entry in group.items()]


def css_value(v) -> str:
    """A token's CSS spelling: a hex, or rgba() when it carries opacity."""
    if isinstance(v, str):
        return v
    r, g, b = (int(v["base"][i : i + 2], 16) for i in (1, 3, 5))
    return f"rgba({r}, {g}, {b}, {v['alpha']})"


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


def swift_decl(entry: dict) -> str | None:
    """The full declaration text, wrapped past `WRAP_AT` columns exactly the
    way the hand-written file already wraps a long one."""
    args = swift_args(entry)
    if args is None:
        return None
    name = entry["$extensions"]["swift"]
    one_line = f'    static let {name} = Color.hex({args})'
    if len(one_line) <= WRAP_AT:
        return one_line
    return f'    static let {name} = Color.hex(\n        {args})'


def swift_pattern(name: str) -> re.Pattern:
    """Matches EITHER layout — single line, or wrapped after the open paren —
    for a given identifier, so verify/write do not need to know which one is
    on disk."""
    return re.compile(
        rf'    static let {re.escape(name)} = Color\.hex\(\s*\n?\s*'
        r'light: "#[0-9A-F]+", dark: "#[0-9A-F]+"'
        r'(?:, lightAlpha: [\d.]+, darkAlpha: [\d.]+)?\)'
    )


def watch_decl(entry: dict) -> str | None:
    name = entry.get("$extensions", {}).get("swift")
    if name not in WATCH_NAMES:
        return None
    dv = entry["$value"]["dark"]
    if not isinstance(dv, str):
        return None
    return f'    static let {name} = Color(hex: "{dv.upper()}")'


def watch_pattern(name: str) -> re.Pattern:
    return re.compile(rf'    static let {re.escape(name)} = Color\(hex: "#[0-9A-F]+"\)')


def emit_css() -> list[str]:
    """Every declaration, in the order `flat()` walks tokens.json. Always
    BOTH light and dark, even when they are equal (`--mark-glyph`) — Stock
    writes that pair explicitly, unlike Gastos, which omits a dark line that
    would just repeat the light one. Measured: every one of the 40 colour
    tokens appears exactly 3 times in globals.css (`:root`, the media query,
    the forced-dark selector) — never 1, never 2 — so this assumes that shape
    rather than re-deriving it per token."""
    out = []
    for name, entry in flat():
        out.append(f'  --{name}: {css_value(entry["$value"]["light"])};')
        out.append(f'  --{name}: {css_value(entry["$value"]["dark"])};')
    return out


def verify() -> int:
    css_text = CSS.read_text(encoding="utf-8")
    swift_text = SWIFT.read_text(encoding="utf-8")
    watch_text = WATCH.read_text(encoding="utf-8")
    missing = []
    checked = 0
    for name, entry in flat():
        checked += 1
        light_line = f'--{name}: {css_value(entry["$value"]["light"])};'
        dark_line = f'--{name}: {css_value(entry["$value"]["dark"])};'
        occurrences = len(re.findall(rf'^\s*--{re.escape(name)}:', css_text, re.M))
        if occurrences < 2:
            missing.append(f'CSS   --{name} aparece {occurrences} vez(ces), esperaba al menos 2')
        elif light_line not in css_text:
            missing.append(f'CSS   {light_line}')
        elif dark_line not in css_text:
            missing.append(f'CSS   {dark_line}')

        decl = swift_decl(entry)
        if decl is not None and decl not in swift_text:
            missing.append(f'Theme.swift        {decl.strip()}')

        wdecl = watch_decl(entry)
        if wdecl is not None and wdecl not in watch_text:
            missing.append(f'WatchTheme.swift   {wdecl.strip()}')

    if missing:
        print(f"  {len(missing)} de {checked} tokens no coinciden con el código:")
        for m in missing:
            print(f"    · {m}")
        return 1
    print(f"  los {checked} tokens de color coinciden con el código, carácter por carácter")
    return 0


def write() -> int:
    """Rewrite each token's declaration in place, from tokens.json.

    Line-level, not block-level: declarations sit interleaved with comments
    and with things this generator does not own (the hue switch, `@theme`,
    `--shadow-*`). Replacing a region would either drop those or force them in
    here; replacing exactly the matched span leaves every other character
    exactly where its author put it.
    """
    css = CSS.read_text(encoding="utf-8")
    swift = SWIFT.read_text(encoding="utf-8")
    watch = WATCH.read_text(encoding="utf-8")

    for name, entry in flat():
        lv = css_value(entry["$value"]["light"])
        dv = css_value(entry["$value"]["dark"])
        seen = 0
        out_lines = []
        for line in css.split("\n"):
            m = re.match(rf'^(\s*)--{re.escape(name)}:\s*[^;]+;(.*)$', line)
            if m:
                indent, tail = m.group(1), m.group(2)
                value = lv if seen == 0 else dv
                line = f'{indent}--{name}: {value};{tail}'
                seen += 1
            out_lines.append(line)
        css = "\n".join(out_lines)

        decl = swift_decl(entry)
        if decl is not None:
            swift = swift_pattern(entry["$extensions"]["swift"]).sub(
                lambda m, d=decl: d, swift, count=1
            )

        wdecl = watch_decl(entry)
        if wdecl is not None:
            watch = watch_pattern(entry["$extensions"]["swift"]).sub(
                lambda m, d=wdecl: d, watch, count=1
            )

    CSS.write_text(css, encoding="utf-8")
    SWIFT.write_text(swift, encoding="utf-8")
    WATCH.write_text(watch, encoding="utf-8")
    written = "\n    ".join(str(p.relative_to(REPO)) for p in (CSS, SWIFT, WATCH))
    print(f"  reescritos desde tokens.json:\n    {written}")
    return 0


if __name__ == "__main__":
    if "--write" in sys.argv:
        sys.exit(write())
    if "--verify" in sys.argv:
        sys.exit(verify())
    print("/* light + dark, interleaved */")
    print("\n".join(emit_css()))
    print("\n// Swift (Theme.swift)")
    for _, entry in flat():
        if (line := swift_decl(entry)):
            print(line)
    print("\n// Swift (WatchTheme.swift)")
    for _, entry in flat():
        if (line := watch_decl(entry)):
            print(line)
