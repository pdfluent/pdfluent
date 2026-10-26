#!/usr/bin/env bash
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# Build the journey suite's app and its file reader from this checkout:
#   the e2e build — release profile, --features e2e, identifier
#   com.pdfluent.app.e2e (src-tauri/tauri.e2e.conf.json) so it never shares
#   app data, WebView storage or a quit target with an installed PDFluent;
#   pdfcheck — src-tauri/examples/pdfcheck.rs, same target directory.
# Expects the frontend in dist/ (npm run build). Writes PDFLUENT_E2E_APP and
# PDFLUENT_PDFCHECK to $GITHUB_ENV when it is set, and prints them.
#
# OCR: the app under test has the same bundled OCR as a shipped one (J-60 runs it).
# PDFLUENT_OCR_COMPONENT_BUILD (the build-tesseract.sh --out folder; the journeys
# jobs build it first, like quality:macos/windows) is staged as the bundle and the
# build runs with PDFLUENT_REQUIRE_OCR_BUNDLE=1, so an e2e app without OCR is a red
# build, not a journey that fails later. The runner's own build is not the pinned
# file, so the rehearsal pins it into a COPY of the manifest, and that copy replaces
# the checkout's manifest for this build only (it is compiled in, and restored when
# the script ends). The helper is signed without the sandbox entitlements: the e2e
# app is a bare binary, and a helper that inherits a sandbox it is not in is aborted.
# A shipped build never does either (tests/ocr-bundle.test.ts).
set -euo pipefail

[ -f dist/index.html ] || { echo "FAIL build-e2e: no dist/index.html; run npm run build first"; exit 1; }
[ -n "${CARGO_TARGET_DIR:-}" ] || { echo "FAIL build-e2e: CARGO_TARGET_DIR is not set"; exit 1; }

ocr_manifest_copy=""
if [ -n "${PDFLUENT_OCR_COMPONENT_BUILD:-}" ]; then
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*) ocr_key="windows-x86_64" ;;
    # The architecture cargo builds for, not `uname -m`: a shell started under
    # Rosetta answers x86_64 on an Apple Silicon Mac and the app would get the
    # wrong slice (its manifest then has no entry for the platform it runs on).
    *) ocr_key="macos-$(rustc -vV | sed -n 's/^host: \([a-z0-9_]*\)-apple-darwin$/\1/p')" ;;
  esac
  committed_manifest="src-tauri/resources/ocr/tesseract-component.json"
  ocr_dir="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/pdfluent-e2e-ocr.XXXXXX")"
  cp "$committed_manifest" "$ocr_dir/committed.json"
  trap 'cp "$ocr_dir/committed.json" "$committed_manifest"' EXIT
  ocr_manifest_copy="$ocr_dir/rehearsal.json"
  PDFLUENT_E2E_UNSANDBOXED_HELPER=1 node scripts/ocr-component/ocr-bundle.mjs \
    --stage "$PDFLUENT_OCR_COMPONENT_BUILD" --platform "$ocr_key" --rehearse "$ocr_manifest_copy"
  cp "$ocr_manifest_copy" "$committed_manifest"
  export PDFLUENT_REQUIRE_OCR_BUNDLE=1
elif [ "${PDFLUENT_E2E_REQUIRE_OCR:-0}" = "1" ]; then
  echo "FAIL build-e2e: PDFLUENT_E2E_REQUIRE_OCR=1 but PDFLUENT_OCR_COMPONENT_BUILD names no built component"; exit 1
else
  echo "SKIPPED (not a pass): PDFLUENT_OCR_COMPONENT_BUILD is not set; this e2e app has no bundled OCR and J-60 stays a known gap"
fi

TAURI_CONFIG="$(cat src-tauri/tauri.e2e.conf.json)"
export TAURI_CONFIG
cargo build --release --manifest-path src-tauri/Cargo.toml --features e2e --bin pdfluent-desktop --example pdfcheck

target="$CARGO_TARGET_DIR"
exe=""
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) target="$(cygpath -u "$CARGO_TARGET_DIR")"; exe=".exe" ;;
esac
app="$target/release/pdfluent-desktop$exe"
check="$target/release/examples/pdfcheck$exe"
[ -f "$app" ] || { echo "FAIL build-e2e: the build produced no $app"; exit 1; }
[ -f "$check" ] || { echo "FAIL build-e2e: the build produced no $check"; exit 1; }
if [ -n "$ocr_manifest_copy" ]; then
  # Where the app looks for it beside the executable (Tauri's resource folder in a
  # target/release layout, <exe dir>/resources/ocr). Put it there when the build
  # did not, then read it back against the rehearsal manifest.
  ocr_dest="$target/release/resources/ocr"
  if [ ! -d "$ocr_dest" ]; then
    mkdir -p "$target/release/resources"
    cp -R src-tauri/resources/ocr-bundle "$ocr_dest"
  fi
  node scripts/ocr-component/ocr-bundle.mjs --verify "$ocr_dest" --platform "$ocr_key" --manifest "$ocr_manifest_copy"
  # Tauri finds resources by a target/{debug,release} layout; a runner's Cargo
  # target folder is not named that, so the e2e build is told where its bundle is.
  ocr_bundle_env="$ocr_dest"
  if [ -n "$exe" ]; then ocr_bundle_env="$(cygpath -w "$ocr_dest")"; fi
  echo "PDFLUENT_OCR_BUNDLE_DIR=$ocr_bundle_env"
  if [ -n "${GITHUB_ENV:-}" ]; then echo "PDFLUENT_OCR_BUNDLE_DIR=$ocr_bundle_env" >> "$GITHUB_ENV"; fi
fi
grep -q "PDFLUENT-E2E-BUILD-NOT-SHIPPED" "$app" || { echo "FAIL build-e2e: $app does not carry the e2e marker; the feature did not reach the binary"; exit 1; }

if [ -n "$exe" ]; then app="$(cygpath -w "$app")"; check="$(cygpath -w "$check")"; fi
echo "PDFLUENT_E2E_APP=$app"
echo "PDFLUENT_PDFCHECK=$check"
if [ -n "${GITHUB_ENV:-}" ]; then
  { echo "PDFLUENT_E2E_APP=$app"; echo "PDFLUENT_PDFCHECK=$check"; } >> "$GITHUB_ENV"
fi
