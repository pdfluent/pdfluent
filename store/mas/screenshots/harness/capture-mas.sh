#!/usr/bin/env bash
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# capture-mas.sh — the six Mac App Store screenshots, from the MAS build itself.
#
# Apple takes 2880x1800 for macOS, which is a 1440x900 window on a 2x display:
# the capture returns backing-store pixels, so the arithmetic is exact and
# nothing is ever resampled. An upscaled screenshot is a lie about the app, and
# a resampled one looks soft next to every other listing on the page.
#
# Three things here are not obvious, and each of them cost a wrong set of images
# before it was fixed:
#
#  - **Language.** The app follows the OS locale, and this is a Dutch Mac, so the
#    first set came out in Dutch. `-AppleLanguages` as a launch argument lands in
#    the argument domain, which beats the system setting and needs no write into
#    the sandbox container.
#  - **What gets photographed.** `screencapture -R <rect>` photographs the screen,
#    so a notification banner or another process's keychain prompt floating over
#    the window lands in the picture. `-l <windowid>` photographs the window and
#    leaves everything above it out; window-id.py finds the id.
#  - **The All-tools panel.** Opening a document does not open it. It is one click
#    in the top bar, at a fixed point now that the language is fixed.
#
# Run prepare-local-copy.sh first: the App Store build cannot launch here.
#
# Needs Screen Recording and Accessibility permission for the terminal that runs
# it, and says so rather than writing black rectangles.
#
# usage: capture-mas.sh [/path/to/PDFluent.app] [/path/to/demo.pdf]
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$(cd "${HERE}/.." && pwd)"
REPO="$(cd "${HERE}/../../../.." && pwd)"

APP="${1:-/private/tmp/pdfluent-mas-local/PDFluent.app}"
DEMO="${2:-${REPO}/store/screenshots/en/demo/Project-Proposal.pdf}"
W=1440
H=900
X=0
Y=38          # below the menu bar; a window cannot sit under it

[ -d "${APP}" ] || { echo "✘ no app bundle at ${APP} — run prepare-local-copy.sh first"; exit 1; }
[ -f "${DEMO}" ] || { echo "✘ no demo document at ${DEMO}"; exit 1; }

osa() { osascript -e "$1"; }

quit_app() {
  osa 'tell application "System Events" to if exists (process "pdfluent-desktop") then tell process "pdfluent-desktop" to keystroke "q" using command down' >/dev/null 2>&1 || true
  sleep 3
  /usr/bin/pkill -x pdfluent-desktop >/dev/null 2>&1 || true
  sleep 1
}

place_window() {
  osa 'tell application "System Events" to tell process "pdfluent-desktop"
        set frontmost to true
        set position of window 1 to {'"${X}"', '"${Y}"'}
        set size of window 1 to {'"${W}"', '"${H}"'}
      end tell' >/dev/null
  sleep 1
}

# The frame as it ended up. A window can refuse a size — a minimum width, a
# full-screen state — and the shot would then be of a different app entirely.
frame_size() {
  osa 'tell application "System Events" to tell process "pdfluent-desktop"
        set s to size of window 1
        return ((item 1 of s) as string) & "x" & ((item 2 of s) as string)
      end tell'
}

shot() {
  local name="$1"
  [ "$(frame_size)" = "${W}x${H}" ] \
    || { echo "✘ window is $(frame_size) points, not ${W}x${H} — refusing to capture"; exit 1; }
  local wid
  wid="$(python3 "${HERE}/window-id.py" PDFluent)"
  screencapture -x -o -l "${wid}" "${OUT}/${name}.png"
  local dims
  dims="$(node -e 'const b=require("fs").readFileSync(process.argv[1]);process.stdout.write(b.readUInt32BE(16)+"x"+b.readUInt32BE(20))' "${OUT}/${name}.png")"
  [ "${dims}" = "$((W * 2))x$((H * 2))" ] \
    || { echo "✘ ${name}.png is ${dims}, expected $((W * 2))x$((H * 2)) — is this a 2x display?"; exit 1; }
  echo "   ${name}.png ${dims}"
}

key() { osa 'tell application "System Events" to tell process "pdfluent-desktop" to keystroke "'"$1"'"' >/dev/null; sleep "${2:-3}"; }
click_at() {
  osa 'tell application "System Events" to tell process "pdfluent-desktop" to set frontmost to true' >/dev/null
  sleep 1
  python3 "${HERE}/click-at.py" "$1" "$2"
  sleep "${3:-3}"
}

# The recent-files list lives in the sandbox container, and prepare-local-copy.sh
# gives this copy a bundle id of its own so the container starts empty and no
# one's file names end up in a listing image. The welcome shot is taken first, so
# on a fresh container the list is empty and on a repeat run it holds only the
# demo document.
echo "== 1/3  welcome screen =="
quit_app
open -na "${APP}" --args -AppleLanguages '(en-US)'
sleep 8
place_window
shot 01-welcome

echo "== 2/3  the document =="
open -a "${APP}" "${DEMO}"
sleep 9
place_window
shot 02-reading
click_at 200 98      # "All tools" in the top bar
shot 05-tools

echo "== 3/3  the modes =="
key 3; shot 03-edit          # 1-8 select a viewer mode; 3 = edit
key 8; shot 04-convert       # 8 = convert
key 4; shot 06-sign          # 4 = sign

# Two identical files mean a scene never changed, or the capture caught something
# other than the app. Both have happened.
echo "== distinctness =="
node -e '
const {createHash}=require("crypto"), fs=require("fs");
const names=["01-welcome","02-reading","03-edit","04-convert","05-tools","06-sign"];
const seen=new Map();
for (const n of names) {
  const h=createHash("sha256").update(fs.readFileSync(`'"${OUT}"'/${n}.png`)).digest("hex");
  if (seen.has(h)) { console.error(`✘ ${n}.png is byte-identical to ${seen.get(h)}.png`); process.exit(1); }
  seen.set(h,n);
}
console.log("   six distinct captures");
'
quit_app
echo "✓ six screenshots in ${OUT}"
