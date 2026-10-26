#!/usr/bin/env bash
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# The WebDriver tools the Windows journey job drives the app with, put next to
# the runner's cargo target directory (the build volume) and reused across runs:
#
#   tauri-driver  2.1.0, from crates.io (cargo install --locked)
#   msedgedriver  the build matching the machine's WebView2 runtime, from
#                 Microsoft's driver host. A driver one major version off
#                 refuses the session, so the version is read, never assumed.
#
# Writes PDFLUENT_TAURI_DRIVER and PDFLUENT_NATIVE_DRIVER to $GITHUB_ENV.
# Every failure names its cause; nothing here falls back to "skip".
set -euo pipefail

TAURI_DRIVER_VERSION=2.1.0
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) ;;
  *) echo "journey-tools: only the Windows journey job needs WebDriver tools (macOS uses the e2e file bridge)"; exit 0 ;;
esac

[ -n "${CARGO_TARGET_DIR:-}" ] || { echo "FAIL journey-tools: CARGO_TARGET_DIR is not set; the runner's start hook routes it to the build volume"; exit 1; }
tools="$(cygpath -u "$CARGO_TARGET_DIR")/../e2e-tools"
mkdir -p "$tools"

driver="$tools/bin/tauri-driver.exe"
if ! { [ -x "$driver" ] && "$driver" --help 2>/dev/null | grep -q -i webdriver && [ -f "$tools/tauri-driver-$TAURI_DRIVER_VERSION" ]; }; then
  echo "journey-tools: installing tauri-driver $TAURI_DRIVER_VERSION"
  cargo install tauri-driver --version "$TAURI_DRIVER_VERSION" --locked --root "$(cygpath -w "$tools")"
  touch "$tools/tauri-driver-$TAURI_DRIVER_VERSION"
fi

# The WebView2 runtime version: per machine, then per user.
wv=""
for key in 'HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}' \
           'HKCU\Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'; do
  wv="$(reg query "$key" //v pv 2>/dev/null | awk '/pv/ {print $NF}' | tr -d '\r' || true)"
  [ -n "$wv" ] && break
done
[ -n "$wv" ] || { echo "FAIL journey-tools: no WebView2 runtime version in the registry; the app cannot start without WebView2"; exit 1; }
echo "journey-tools: WebView2 runtime $wv"

edge="$tools/msedgedriver-$wv/msedgedriver.exe"
if [ ! -f "$edge" ]; then
  mkdir -p "$tools/msedgedriver-$wv"
  zip="$tools/msedgedriver-$wv/edgedriver_win64.zip"
  url="https://msedgedriver.microsoft.com/$wv/edgedriver_win64.zip"
  echo "journey-tools: downloading $url"
  curl -fsSL --max-time 300 --retry 2 -o "$zip" "$url" || { echo "FAIL journey-tools: could not download msedgedriver $wv from $url"; exit 1; }
  (cd "$tools/msedgedriver-$wv" || exit 1; unzip -o -q edgedriver_win64.zip)
  [ -f "$edge" ] || { echo "FAIL journey-tools: the msedgedriver $wv archive holds no msedgedriver.exe"; exit 1; }
fi

{
  echo "PDFLUENT_TAURI_DRIVER=$(cygpath -w "$driver")"
  echo "PDFLUENT_NATIVE_DRIVER=$(cygpath -w "$edge")"
} >> "$GITHUB_ENV"
echo "journey-tools: tauri-driver $TAURI_DRIVER_VERSION, msedgedriver $wv"
