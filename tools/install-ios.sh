#!/usr/bin/env bash
# Build and install Stock on the phone, ALWAYS renewing the signature.
#
#   tools/install-ios.sh
#
# Why this is a script and not a list of steps in a doc: the free team's
# provisioning profile lasts 7 days and an ordinary build REUSES it, keeping the
# original expiry — so every install spends days off the same profile instead of
# starting a fresh one. On 2026-08-30 a normal install left the app 23 hours from
# dying, and reinstalling could not save it. Renewing is not a decision to make
# by looking at how many days are left: looking is exactly what leads to skipping
# it ("23 hours, still works").
#
# The four things a script can hold and a person cannot:
#
#   1. The build's status is captured BEFORE any pipe. `xcodebuild | grep`
#      returns GREP's exit code — measured: 0 for a build that failed with 65.
#      Reading "BUILD SUCCEEDED" out of the text works only because xcodebuild
#      happens to print it.
#   2. Nothing is read out of the bundle until the build is known to have
#      succeeded. When it fails the .app on disk is still the PREVIOUS one, so
#      its old profile dates read as "it did not renew" when the truth is
#      "nothing was issued".
#   3. The profiles come back when the build FAILS, so a failure never leaves
#      the machine unable to sign — and only then. After a success Xcode has
#      already issued replacements under new filenames, so putting the old ones
#      back restores nothing and piles up a dead pair every run.
#   4. It aborts when the freshly issued signature has under a day left — which
#      is precisely what "the renewal silently did not happen" looks like.
#
# And every exit says WHICH STAGE it died at. A negative result has to say
# where, not just that: the first version of this script failed its own
# failure-test at stage 1 (a multi-byte `»` swallowed into a variable name) and
# still printed a plausible "non-zero exit, profiles restored" — the build it
# claimed to be testing had never run.
#
# Ported from the Gastos Diarios script, which shares this problem exactly.
set -euo pipefail

DEVICE="${STOCK_DEVICE:-Kylo 👾}"
SCHEME=Stock
BUNDLE_ID=dev.cardozo.stock
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../apps/ios" && pwd)"
PROFILES="$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"
BACKUP="$(mktemp -d)"
APP="$PROJECT_DIR/build-device/Build/Products/Debug-iphoneos/$SCHEME.app"

STAGE="arranque"
say() { STAGE="$*"; printf '\n\033[1m%s\033[0m\n' "$*"; }

# Guard 3. ONLY on failure. Xcode issues the new profiles under new filenames,
# so putting the old ones back after a success does not restore anything — it
# accumulates a dead pair on disk every single run. Measured: 12 profiles became
# 16 after two runs before this flag existed.
renewed=0
on_exit() {
  local code=$?
  if [ "$renewed" -eq 0 ] && compgen -G "$BACKUP/*.mobileprovision" > /dev/null; then
    for f in "$BACKUP"/*.mobileprovision; do
      [ -e "$PROFILES/$(basename "$f")" ] || cp "$f" "$PROFILES/"
    done
    echo "   (perfiles restaurados: no se emitió ninguno nuevo)"
  fi
  # Where, not just whether. Without this a script that dies before the build
  # looks exactly like one whose build failed.
  [ "$code" -ne 0 ] && printf '\n\033[1mFALLÓ en: %s (exit %s)\033[0m\n' "$STAGE" "$code"
  rm -rf "$BACKUP"
  return 0
}
trap on_exit EXIT

say "1. Apartando los perfiles de $BUNDLE_ID"
# All of them together: each target is signed separately and Xcode reissues only
# what is missing, so removing one alone leaves the other on its old date — and
# the one that stops working first is the SHORTEST, not the app's.
moved=0
shopt -s nullglob
for f in "$PROFILES"/*.mobileprovision; do
  name=$(security cms -D -i "$f" 2>/dev/null | plutil -extract Name raw -o - - 2>/dev/null || true)
  case "$name" in
    *"$BUNDLE_ID"*) cp "$f" "$BACKUP/"; rm "$f"; echo "   $name"; moved=$((moved + 1)) ;;
  esac
done
shopt -u nullglob
echo "   $moved apartados (se reemiten en la misma pasada, así quedan alineados)"

say "2. Compilando para «${DEVICE}»"
rm -rf "$PROJECT_DIR/build-device"
# Guard 1: status first, and only then look at the log. No pipe on this line.
set +e
xcodebuild build -project "$PROJECT_DIR/$SCHEME.xcodeproj" -scheme "$SCHEME" \
  -destination "platform=iOS,name=$DEVICE" \
  -allowProvisioningUpdates -derivedDataPath "$PROJECT_DIR/build-device" \
  > "$BACKUP/build.log" 2>&1
build_status=$?
set -e

if [ $build_status -ne 0 ]; then
  echo "   el build falló ($build_status):"
  grep -E "error:" "$BACKUP/build.log" | head -5 | sed 's/^/     /' || true
  echo
  echo "   Si dice «No Accounts», Xcode perdió la sesión al actualizarse:"
  echo "   Xcode → Settings → Accounts, con cardozocristian@gmail.com."
  echo "   Los perfiles se restauran solos al salir."
  exit $build_status
fi
echo "   BUILD SUCCEEDED (exit 0, no leído del texto)"
# From here the old profiles are superseded, not worth putting back.
renewed=1

# Guard 2: reached only with build_status == 0, so the bundle is this build's.
say "3. Firma emitida"
soonest=$(python3 - "$APP" <<'PY'
import datetime, plistlib, subprocess, sys, pathlib
app = pathlib.Path(sys.argv[1])
found = list(app.rglob("embedded.mobileprovision"))
if not found:
    print("SIN PERFILES", flush=True); raise SystemExit(1)
soonest = None
for f in found:
    raw = subprocess.run(["security", "cms", "-D", "-i", str(f)], capture_output=True).stdout
    plist = plistlib.loads(raw)
    exp = plist["ExpirationDate"].replace(tzinfo=datetime.timezone.utc)
    print(f"   {plist['Name']:<52} vence {exp.isoformat()}", file=sys.stderr)
    soonest = exp if soonest is None else min(soonest, exp)
left = soonest - datetime.datetime.now(datetime.timezone.utc)
print(f"{int(left.total_seconds())}")
PY
)
days=$((soonest / 86400))
hours=$(((soonest % 86400) / 3600))
echo "   el más corto manda: quedan $days días y $hours horas"

# Guard 4. Under a day means the profiles were not actually reissued — which is
# exactly what a silent failure looks like from here.
if [ "$soonest" -lt 86400 ]; then
  echo "   ABORTO: una firma recién emitida dura 7 días, no $days d $hours h."
  echo "   No se reemitió nada. No instalo para no dejarte una app que muere hoy."
  exit 1
fi

say "4. Instalando"
# The phone sometimes answers "disconnected immediately after connecting" on the
# first try and is fine on the second.
for attempt in 1 2 3; do
  if xcrun devicectl device install app --device "$DEVICE" "$APP" > "$BACKUP/install.log" 2>&1; then
    grep -E "bundleID" "$BACKUP/install.log" | head -1 | sed 's/^/   /'
    echo "   watch: $(ls "$APP/Watch/" 2>/dev/null || echo 'no embebido')"
    say "Listo. Vence en $days días."
    exit 0
  fi
  echo "   intento $attempt falló, reintento en 20s"
  sleep 20
done

echo "   no pude instalar:"
grep -iE "error" "$BACKUP/install.log" | head -3 | sed 's/^/     /' || true
exit 1
