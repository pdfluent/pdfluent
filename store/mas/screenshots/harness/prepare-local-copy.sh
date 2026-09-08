#!/usr/bin/env bash
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# prepare-local-copy.sh — make the Mac App Store build launchable on this Mac.
#
# The package that goes to Apple cannot run here, and that is by design: the
# profile in src-tauri/PDFluent_MAS.provisionprofile is a Mac App Store
# *distribution* profile, so it carries no ProvisionedDevices and macOS refuses
# the launch with "Launchd job spawn failed" (POSIX 163) no matter where the app
# sits. Only the App Store and TestFlight can start that binary.
#
# For screenshots we want the App Store build's own pixels: the updater compiled
# out, MAS_BUILD set in the frontend, App Sandbox on. So this takes the .app the
# MAS build produced, drops the embedded profile, and re-seals it with the
# Developer ID identity and the same sandbox entitlements minus the two keys that
# only mean something inside a provisioning profile. Nothing is recompiled. The
# copy is a signature change, not a different build.
#
# usage: prepare-local-copy.sh [/path/to/PDFluent.app] [/path/to/output.app]
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "${HERE}/../../../.." && pwd)"

SRC="${1:-${REPO}/src-tauri/target/universal-apple-darwin/release/bundle/macos/PDFluent.app}"
DST="${2:-/private/tmp/pdfluent-mas-local/PDFluent.app}"
IDENTITY="${MAS_LOCAL_IDENTITY:-Developer ID Application: Innovation Trigger B.V. (58Z6SVW7CN)}"

[ -d "${SRC}" ] || { echo "✘ no app bundle at ${SRC}"; exit 1; }
security find-identity -v | grep -q "Developer ID Application: Innovation Trigger" \
  || { echo "✘ no Developer ID Application identity in the keychain"; exit 1; }

rm -rf "${DST}"; mkdir -p "$(dirname "${DST}")"
cp -R "${SRC}" "${DST}"
rm -f "${DST}/Contents/embedded.provisionprofile"

# A different bundle id, so this copy gets its own empty sandbox container. The
# App Store build and the direct download share com.pdfluent.app, which means
# they share a recent-files list: without this, the welcome screenshot would
# show whatever documents the person at this Mac last opened, and clearing that
# list to take a picture would throw away their data. macOS protects
# ~/Library/Containers, so moving the container aside is not an option.
SHOT_ID="${MAS_LOCAL_BUNDLE_ID:-com.pdfluent.app.screenshots}"
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier ${SHOT_ID}" "${DST}/Contents/Info.plist"

ENT="$(mktemp -t mas-local-ent).plist"
cat > "${ENT}" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.app-sandbox</key>
    <true/>
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
    <key>com.apple.security.files.bookmarks.app-scope</key>
    <true/>
    <key>com.apple.security.network.client</key>
    <true/>
</dict>
PLIST
printf '</plist>\n' >> "${ENT}"

INHERIT="${REPO}/src-tauri/Entitlements.appstore.inherit.plist"
MAIN_EXE="$(/usr/bin/find "${DST}/Contents/MacOS" -maxdepth 1 -type f -perm -u+x | head -1)"
while IFS= read -r bin; do
  [ "${bin}" = "${MAIN_EXE}" ] && continue
  file -b "${bin}" | grep -q "Mach-O" || continue
  codesign --force --sign "${IDENTITY}" --options runtime --entitlements "${INHERIT}" "${bin}"
done < <(find "${DST}/Contents" -type f \( -perm -u+x -o -name '*.dylib' -o -name '*.so' \))

codesign --force --sign "${IDENTITY}" --options runtime --entitlements "${ENT}" "${DST}"
codesign --verify --deep --strict "${DST}"
rm -f "${ENT}"

echo "✓ launchable copy: ${DST} (bundle id ${SHOT_ID})"
echo "  (signature only; the binary is the one scripts/build-mas.sh produced)"
