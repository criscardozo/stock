#!/usr/bin/env bash
# The README banner: one image carrying the mark and the name.
#
#   tools/icons/build-banner.sh
#
# Generated, never drawn. A hand-made banner is a second copy of the brand that
# nothing keeps in step: identical the day it is made, wrong the first time the
# mark changes. This reads the SAME icon the app ships (apps/web/public/icons)
# and the SAME typeface iOS bundles, so there is one brand and one font.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."
ICON=apps/web/public/icons/icon-512.png
FONT=apps/ios/Stock/Resources/Fonts/Outfit-Variable.ttf
OUT=apps/web/public/icons/banner.png

W=1080; H=340
GROUND='#f3f4ee'      # --ground, light
INK='#1b2119'         # --ink, light
PRIMARY='#2e9e5b'     # --primary
CARD=200              # the mark, as a rounded card like the system draws it

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

# The mark, straight from the file the web app ships. This source already
# carries its rounded corners, so there is no mask to apply — an earlier version
# built one and composited it with CopyOpacity, which read the mask's black
# interior as "transparent" and hollowed the card out. The result still looked
# like a green square, because the glow behind it showed through.
magick "$ICON" -resize ${CARD}x${CARD} "$tmp/card.png"

# No glow, no shadow. The design system says cards carry none — the single
# shadow in the whole product is the primary CTA's, coloured. An earlier version
# had one here and it read as a grey fringe on the light field, which is what
# inventing an effect outside the system looks like.

# The typeface is a VARIABLE font whose `wght` axis defaults to 100 — measured,
# not assumed — so anything that renders it by family or by file gets Thin, and
# `-weight 700` does nothing because there is no separate bold face to pick.
# It is instanced at 700 first, into a temp file, so the repo keeps exactly one
# copy of the font.
if ! "${PYTHON:-python3}" -c "import fontTools" 2>/dev/null; then
  echo "Falta fonttools para instanciar la fuente variable en wght=700." >&2
  echo "  python3 -m venv /tmp/fv && /tmp/fv/bin/pip install fonttools brotli" >&2
  echo "  luego: PYTHON=/tmp/fv/bin/python tools/icons/build-banner.sh" >&2
  exit 1
fi
"${PYTHON:-python3}" -c "
from fontTools import ttLib
from fontTools.varLib import instancer
f = ttLib.TTFont('$FONT')
instancer.instantiateVariableFont(f, {'wght': 700}, inplace=True)
f.save('$tmp/outfit-700.ttf')
"

# The word is RASTERISED here, never <text> in an SVG: GitHub serves an SVG as
# an image and does not load webfonts, so text that stays text is drawn with
# whatever the reader happens to have.
magick -background none -fill "$INK" -font "$tmp/outfit-700.ttf" -pointsize 132 \
  label:"Stock" -trim +repage "$tmp/word.png"

# Positioned by MEASURED ink, not by the nominal box: the mark's artwork does
# not fill its square, so centring the square leaves the drawing off-centre.
# `read` returns non-zero at EOF without a trailing newline, which under
# `set -e` ends the script silently right here.
IW=$(magick identify -format '%w' "$tmp/word.png")
IH=$(magick identify -format '%h' "$tmp/word.png")
GAP=44
BLOCK=$((CARD + GAP + IW))
X0=$(( (W - BLOCK) / 2 ))
CARD_Y=$(( (H - CARD) / 2 ))
WORD_Y=$(( (H - IH) / 2 ))

# Opaque field on purpose: composited over GitHub's two themes, a transparent
# banner loses the word in dark. One file works in both.
magick -size ${W}x${H} "xc:$GROUND" \
  "$tmp/card.png" -geometry "+$((X0))+${CARD_Y}" -composite \
  "$tmp/word.png" -geometry "+$((X0 + CARD + GAP))+${WORD_Y}" -composite \
  -strip "$OUT"

magick identify -format "  %f  %wx%h  %b\n" "$OUT"
