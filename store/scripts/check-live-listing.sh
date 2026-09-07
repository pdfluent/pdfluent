#!/usr/bin/env bash
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# check-live-listing.sh — read the live Microsoft Store listing and diff it
# against store/live-listing.json, the record the dossier and the guard test are
# written against.
#
#   store/scripts/check-live-listing.sh [--write]
#     --write   update store/live-listing.json in place (commit the result)
#
# This needs the network, so it is a release step (RELEASE.md §5), not a CI step.
# CI only proves the dossier agrees with the record; only this script proves the
# record agrees with the Store. When it cannot reach the Store it prints
# SKIPPED (not a pass) on stderr and exits 0 — a skipped check must never read
# as a passed one, and must never fail a release on someone's flaky wifi.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RECORD="${ROOT}/store/live-listing.json"
WRITE=0
[ "${1:-}" = "--write" ] && WRITE=1

skip() { echo "SKIPPED (not a pass): $*" >&2; exit 0; }
[ -r "$RECORD" ] || skip "no ${RECORD} to compare against"
command -v curl >/dev/null 2>&1 || skip "curl not installed"
command -v node >/dev/null 2>&1 || skip "node not installed"

STORE_ID="$(node -p "require('${RECORD}').storeId")"
URL="https://apps.microsoft.com/detail/${STORE_ID}"

html="$(mktemp)"
code="$(curl -sSL --max-time 60 -o "$html" -w '%{http_code}' "$URL" 2>/dev/null)" || \
  skip "could not reach ${URL}"
[ "$code" = "200" ] || skip "listing returned HTTP ${code} (offline, or rate limited)"

# The listing embeds its own product JSON; pull the fields a submission sets.
live="$(node -e '
  const fs = require("fs");
  const html = fs.readFileSync(process.argv[1], "utf8");
  const pick = (re) => { const m = html.match(re); return m ? m[1] : null; };
  const out = {
    storeId: pick(/"installer":\{"type":"[^"]*","id":"([^"]+)"/),
    packageType: pick(/"installer":\{"type":"([^"]*)"/),
    productCode: pick(/"productCode":"([^"]+)"/),
    listingVersion: pick(/"x64":\{"version":"([^"]+)"/),
    installerUrl: pick(/"sourceUri":"([^"]+)"/),
    installerSha256: pick(/"hash":"([0-9a-f]{64})"/),
    packageLastUpdateUtc: pick(/"packageLastUpdateDateUtc":"([^"]+)"/),
    developerName: pick(/"developerName":"([^"]+)"/),
    price: pick(/"displayPrice":"([^"]+)"/),
  };
  const m = out.installerUrl && out.installerUrl.match(/releases\/([^/]+)\//);
  out.installerVersion = m ? m[1] : null;
  process.stdout.write(JSON.stringify(out));
' "$html")" || skip "could not parse the listing page (Store markup changed?)"
rm -f "$html"

node -e '
  const fs = require("fs");
  const record = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const live = JSON.parse(process.argv[2]);
  const write = process.argv[3] === "1";
  const path = process.argv[1];

  const missing = Object.entries(live).filter(([, v]) => v === null).map(([k]) => k);
  if (missing.length === Object.keys(live).length) {
    console.error("SKIPPED (not a pass): no listing fields could be read");
    process.exit(0);
  }

  let drift = 0;
  for (const [key, value] of Object.entries(live)) {
    if (value === null) { console.log(`?  ${key}: not readable from the page`); continue; }
    const have = record[key];
    if (have === value) { console.log(`ok ${key}: ${value}`); continue; }
    drift++;
    console.log(`!! ${key}`);
    console.log(`     record: ${have}`);
    console.log(`     live:   ${value}`);
    if (write) record[key] = value;
  }

  if (!drift) { console.log("\nLive listing matches store/live-listing.json."); process.exit(0); }
  if (!write) {
    console.log(`\n${drift} field(s) drifted. Re-run with --write, then commit ` +
                "store/live-listing.json so the dossier guard sees the new values.");
    process.exit(1);
  }
  record.checkedAt = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path, JSON.stringify(record, null, 2) + "\n");
  console.log(`\nUpdated ${path}. Commit it: the dossier guard reads this file.`);
' "$RECORD" "$live" "$WRITE"
