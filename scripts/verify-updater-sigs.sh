#!/usr/bin/env bash
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# verify-updater-sigs.sh — confirm every staged updater .sig was produced by the
# TRUSTED production key (the pubkey baked into src-tauri/tauri.conf.json, key id
# 9E2BAD9AABF995DD). This is the "no wrong key" gate: it defends against the
# rotated/wrong local keys (e.g. 4477C8918941A763) ever reaching latest.json.
#
# Read-only. It inspects PUBLIC signature files only — it never reads, derives,
# or prints any private key material.
#
#   scripts/verify-updater-sigs.sh [artifacts-dir]    # default: artifacts/
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ART_DIR="${1:-${REPO_ROOT}/artifacts}"
EXPECT="9E2BAD9AABF995DD"

# Key id embedded in a Tauri .sig (which is base64-of-a-minisign-signature).
# minisign stores the key id little-endian and displays it byte-reversed.
keyid_of() {
  node -e '
    const fs=require("fs");
    const t=Buffer.from(fs.readFileSync(process.argv[1],"utf8").trim(),"base64").toString();
    const l2=t.split("\n").filter(x=>x && !/^untrusted|^trusted/.test(x))[0];
    const id=Buffer.from(Buffer.from(l2,"base64").subarray(2,10)).reverse().toString("hex").toUpperCase();
    process.stdout.write(id);
  ' "$1"
}

# Self-check: the app must actually trust EXPECT (guards against a tauri.conf drift).
TRUSTED="$(node -e '
  const c=require(process.argv[1]);
  const t=Buffer.from(c.plugins.updater.pubkey,"base64").toString();
  process.stdout.write((t.match(/minisign public key:\s*([0-9A-Fa-f]+)/)||[])[1]||"");
' "${REPO_ROOT}/src-tauri/tauri.conf.json")"
echo "tauri.conf.json trusts updater key: ${TRUSTED}"
[ "${TRUSTED}" = "${EXPECT}" ] || { echo "FAIL tauri.conf pubkey ${TRUSTED} != expected ${EXPECT}"; exit 1; }

shopt -s nullglob
SIGS=("${ART_DIR}"/*/*.sig "${ART_DIR}"/*.sig)
if [ ${#SIGS[@]} -eq 0 ]; then
  # Nothing to verify is not "verified". This runs as step 1 of
  # stage-latest-json.sh, immediately before a feed is built from those same
  # files, so an exit 0 here says "the signatures are trusted" about a directory
  # that has none -- the shape that let a green run mean nothing three times in
  # this repository. The generator refuses a moment later today, which makes
  # this a soft spot rather than a hole; it is still the wrong answer.
  echo "SKIPPED (not a pass): no .sig files under ${ART_DIR} — nothing was verified." >&2
  echo "  The trusted-key self-check passed, but that says nothing about artefacts that are not there." >&2
  echo "  Build and sign first; the updater payloads land in artifacts/{macos,windows}/." >&2
  exit 3
fi

fail=0
for s in "${SIGS[@]}"; do
  id="$(keyid_of "$s")"
  if [ "$id" = "${EXPECT}" ]; then echo "OK  $(basename "$s"): ${id}"; else echo "BAD $(basename "$s"): ${id} (WRONG KEY)"; fail=1; fi
done
[ "$fail" -eq 0 ] || { echo "FAIL one or more artifacts signed with the wrong key — DO NOT upload"; exit 1; }
echo "OK  all updater signatures match the trusted key ${EXPECT}"
