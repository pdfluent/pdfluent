<!--
Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
See https://pdfluent.com/license for terms.
-->

# Mac App Store dossier

Everything needed to put PDFluent on the Mac App Store, except the two things
only the account holder can do: the upload and the Submit.

## State on 2026-09-07

| Thing | State |
|---|---|
| Apple Distribution + 3rd Party Mac Developer Installer certificates | in the login keychain, team 58Z6SVW7CN |
| Provisioning profile | `src-tauri/PDFluent_MAS.provisionprofile`, expires 2027-07-08 |
| Build script | `scripts/build-mas.sh` — no longer a draft; it has been run end to end from this code |
| Build number | `store/mas/build-number`, committed, strictly increasing |
| Entitlements in the signature | checked against `src-tauri/Entitlements.appstore.plist` after every build |
| Screenshots | `screenshots/` — six 2880×1800 PNGs from build 3, the same build as the package. One caveat, written up there: the App Store package cannot launch on a Mac no provisioning profile covers, so the capture runs a re-signed copy of the same binary |
| Listing, EULA note, privacy and export answers | `listing.md`, `eula.md`, `privacy.md`, `export-compliance.md` |
| App Store Connect record | **unknown to this repo** — the owner's account |
| Package | `dist-release/PDFluent_1.0.0_mas.pkg`, version 1.0.0 **build 3**, signed and entitlement-checked, ready to upload |
| Upload | **not done** — `UPLOAD-RUNBOOK.md` has the two routes |
| TestFlight smoke | **not done** — the script is in `review-notes.md`, it needs an uploaded build |

## Why the build number is a committed file

App Store Connect refuses a `CFBundleVersion` it has already seen for the same
marketing version, and it remembers numbers from builds that were rejected. The
script used to stamp `${MAS_BUILD_NUMBER:-1}`: every run that forgot the variable
produced build 1 again, and nothing on this machine recorded what had been
uploaded. `store/mas/build-number` holds the last number handed out; the script
refuses anything that does not exceed it, and writes the new number **before**
the build. Burning a number on a failed build costs nothing. Reusing one costs a
round trip through App Store Connect.

The counter starts at 1 because the only MAS package ever produced on this
machine (2026-07-08, from the beta line that preceded the 1.0.0 version line)
carried `CFBundleVersion` 1 and was never uploaded to anything. The first upload
is therefore build 2.

## Rebuilding

```sh
MAS_DRY_RUN=1 bash scripts/build-mas.sh          # what number would this be?
bash scripts/build-mas.sh                        # build, sign, package
node scripts/mas-entitlements.mjs --pkg dist-release/PDFluent_1.0.0_mas.pkg
```

The build takes the machine-wide gate lock elsewhere in this repo's tooling
(`scripts/cos/with_gate_lock.sh`) because it is a universal Rust build.

## What is checked, and where

`tests/mas-build-gate.test.ts` drives `scripts/build-mas.sh` in dry-run mode
(build-number arithmetic and every refusal) and `scripts/mas-entitlements.mjs`
against fixtures; when a signed artifact is present on the machine it compares
the real signature too, and says `SKIPPED (not a pass)` when it is not.
`tests/mas-store-assets.test.ts` checks the screenshot set and holds every
capability claim in `listing.md` against the generated UI register. Both run in
`quality-gates-fast` on every push.
