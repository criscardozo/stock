#!/usr/bin/env bash
# Rebuilds every app icon from the design bundle, adding the gradient the flat
# export was missing.
#
# Run:  tools/icons/build-icons.sh
# Needs ImageMagick (brew install imagemagick) and the design bundle in
# docs/design/ (gitignored — it is a handover, not source). The PNGs it writes
# ARE committed, so a clone builds without it.
#
# The drawing is never redrawn here. Each source is a two-colour flat PNG, so
# the glyph comes out as a mask by normalising one channel between the two
# colours; the mask is then laid over a gradient. Geometry, scale and corners
# stay exactly as the designer exported them.
#
# Light puts the gradient on the FIELD. Dark puts it on the GLYPH, because in
# dark the field goes near-black and the mark carries the brand colour — the
# same move Apple makes (compare the App Store icon in both appearances) and
# the same one Gastos Diarios makes, so the two apps stay one family.
set -euo pipefail

cd "$(dirname "$0")/../.."
SRC=docs/design/project/assets
[ -d "$SRC" ] || { echo "Falta $SRC (bundle de diseño)"; exit 1; }

# Tokens, not invented colours — docs/design/tokens.md.
LIGHT_BG_FROM='#2E9E5B'   # primary
LIGHT_BG_TO='#1D7A43'     # primary-deep
LIGHT_GLYPH='#FCFCF8'     # surface

DARK_BG_FROM='#1E231C'    # surface-dark
DARK_BG_TO='#14170F'      # the ground the flat dark icon already used
DARK_GLYPH_FROM='#4FBE7A' # the green the flat dark icon already used
DARK_GLYPH_TO='#2E9E5B'   # primary

TINTED_BG='#1C1C1E'
TINTED_GLYPH_FROM='#CFD3C9'
TINTED_GLYPH_TO='#8A9386'

# render <src> <out> <size> <mask-black%> <mask-white%> <bg-spec> <glyph-spec>
# bg/glyph specs are ImageMagick images: "xc:#RGB" flat or "gradient:#A-#B".
render() {
  local src=$1 out=$2 size=$3 lo=$4 hi=$5 bg=$6 glyph=$7
  magick \
    \( -size "${size}x${size}" "$bg" \) \
    \( -size "${size}x${size}" "$glyph" \) \
    \( "$src" -resize "${size}x${size}" -channel R -separate +channel -level "${lo}%,${hi}%" \) \
    -composite \
    \( "$src" -resize "${size}x${size}" -alpha extract \) \
    -compose CopyOpacity -composite \
    "$out"
}

# The two colours each source is drawn in, as percentages of the red channel.
L_LO=18.04 L_HI=98.82   # #2E9E5B -> #FCFCF8
D_LO=7.84  D_HI=30.98   # #14170F -> #4FBE7A
T_LO=10.98 T_HI=81.18   # #1C1C1E -> #CFD3C9

IOS=apps/ios/Stock/Assets.xcassets/AppIcon.appiconset
WATCH=apps/ios/StockWatch/Assets.xcassets/AppIcon.appiconset
WEB=apps/web/public/icons

echo "iOS"
render "$SRC/appicon-1024.png" "$IOS/appicon-1024.png" 1024 $L_LO $L_HI \
  "gradient:$LIGHT_BG_FROM-$LIGHT_BG_TO" "xc:$LIGHT_GLYPH"
render "$SRC/appicon-dark-1024.png" "$IOS/appicon-dark-1024.png" 1024 $D_LO $D_HI \
  "gradient:$DARK_BG_FROM-$DARK_BG_TO" "gradient:$DARK_GLYPH_FROM-$DARK_GLYPH_TO"
render "$SRC/appicon-tinted-1024.png" "$IOS/appicon-tinted-1024.png" 1024 $T_LO $T_HI \
  "xc:$TINTED_BG" "gradient:$TINTED_GLYPH_FROM-$TINTED_GLYPH_TO"

echo "watchOS"
render "$SRC/appicon-1024.png" "$WATCH/appicon-1024.png" 1024 $L_LO $L_HI \
  "gradient:$LIGHT_BG_FROM-$LIGHT_BG_TO" "xc:$LIGHT_GLYPH"

echo "web"
render "$SRC/icon-192.png"            "$WEB/icon-192.png"            192 $L_LO $L_HI "gradient:$LIGHT_BG_FROM-$LIGHT_BG_TO" "xc:$LIGHT_GLYPH"
render "$SRC/icon-512.png"            "$WEB/icon-512.png"            512 $L_LO $L_HI "gradient:$LIGHT_BG_FROM-$LIGHT_BG_TO" "xc:$LIGHT_GLYPH"
render "$SRC/icon-maskable-512.png"   "$WEB/icon-maskable-512.png"   512 $L_LO $L_HI "gradient:$LIGHT_BG_FROM-$LIGHT_BG_TO" "xc:$LIGHT_GLYPH"
render "$SRC/apple-touch-icon-180.png" "$WEB/apple-touch-icon-180.png" 180 $L_LO $L_HI "gradient:$LIGHT_BG_FROM-$LIGHT_BG_TO" "xc:$LIGHT_GLYPH"
render "$SRC/favicon-32.png"          "$WEB/favicon-32.png"          32  $L_LO $L_HI "gradient:$LIGHT_BG_FROM-$LIGHT_BG_TO" "xc:$LIGHT_GLYPH"
render "$SRC/favicon-16.png"          "$WEB/favicon-16.png"          16  $L_LO $L_HI "gradient:$LIGHT_BG_FROM-$LIGHT_BG_TO" "xc:$LIGHT_GLYPH"

# iOS and watchOS reject an app icon carrying an alpha channel; watchOS is the
# strict one, and it fails as "did not have any applicable content".
for f in "$IOS"/*.png "$WATCH"/appicon-1024.png; do
  magick "$f" -background "$LIGHT_BG_TO" -alpha remove -alpha off "$f"
done

echo "listo"
