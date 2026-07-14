<!--
Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
See https://pdfluent.com/license for terms.
-->

# PDFluent — Microsoft Store submission dossier

Everything needed to submit PDFluent to the Microsoft Store, assembled from the
**actual live candidate** (`1.0.0-beta.20`). Nothing here is published or
submitted — this is a ready-to-upload package plus a field-by-field guide.

> **Status:** SUBMISSION-READY pending the owner actions in
> [`OWNER-BRIEF.md`](OWNER-BRIEF.md) (Partner Center account + a few values).
> No secrets are stored in this folder.

## Packaging route (decided)

**Win32 app (EXE/MSI), not MSIX.** PDFluent ships an Authenticode-signed `.msi`,
hosted by us, submitted as a Win32 app. This preserves the app's own auto-updater
and `.pdf` file associations — both of which MSIX's AppContainer sandbox +
Store-managed updates would break. Full rationale + the MSIX trade-off:
[`packaging-route.md`](packaging-route.md). (The editor itself is free for
everyone, including commercial use, and no longer has any licensing UI — see
`LICENSE.md`.)

## The candidate

| | |
|---|---|
| Product | PDFluent — privacy-first desktop PDF editor |
| Version | 1.0.0-beta.20 |
| Installer | `PDFluent_1.0.0-beta.20_x64_en-US.msi` (~20 MB, offline, per-user/per-machine WiX MSI) |
| Package URL (self-hosted) | `https://pdfluent.com/releases/1.0.0-beta.20/PDFluent_1.0.0-beta.20_x64_en-US.msi` |
| SHA-256 | `8DAA08BE555FBF60B1D4AC68E1700A606CC1EE65E5E115F77168740E0885FFD8` |
| Code signing | Authenticode **Valid** — Azure Trusted Signing, `CN=Innovation Trigger B.V.` (Microsoft ID Verified CS chain, RFC3161 TSA) |
| Architecture | x64 (Windows 10 / 11) |
| Publisher (cert identity) | Innovation Trigger B.V., Heemstede, NL |

## What's in this folder

| Path | Contents |
|---|---|
| [`packaging-route.md`](packaging-route.md) | Win32-vs-MSIX decision + rationale |
| [`build-validation-pipeline.md`](build-validation-pipeline.md) | Reproducible Store-candidate build + the full certification checklist |
| [`scripts/validate-store-candidate.sh`](scripts/validate-store-candidate.sh) | One-command validation gate (signature, embed, updater feed, installer rules) |
| [`partner-center-upload-guide.md`](partner-center-upload-guide.md) | **Field-by-field** Partner Center walkthrough (no access needed to follow) |
| [`listing/listing-copy.md`](listing/listing-copy.md) | Store description, feature bullets, search terms (human-reviewed) |
| [`listing/release-notes.md`](listing/release-notes.md) | "What's new" copy for this submission |
| [`listing/system-requirements.md`](listing/system-requirements.md) | Min/recommended hardware + OS |
| [`listing/privacy-compliance.md`](listing/privacy-compliance.md) | Privacy-policy URL, data-collection answers, age-rating (IARC) answers |
| [`listing/reviewer-instructions.md`](listing/reviewer-instructions.md) | Notes to certification reviewers (no login needed, how to test) |
| [`screenshots/raw/`](screenshots/raw) | 6 raw **1920×1080** captures from the actual installed candidate |
| [`screenshots/contact-sheet.png`](screenshots/contact-sheet.png) | Review montage of all six |
| [`screenshots/screenshot-brief.md`](screenshots/screenshot-brief.md) | Captions, ordering, the language caveat, design briefs for branded versions |
| [`assets/store-logo-300.png`](assets/store-logo-300.png) | 300×300 Store logo (1:1 app tile) |
| [`OWNER-BRIEF.md`](OWNER-BRIEF.md) | The only remaining human actions + exact missing values |

## Certification status (validated on the real candidate, Windows 11 box)

- ✅ Authenticode signature Valid on both the MSI and the installed `.exe`.
- ✅ Offline installer (self-contained WiX MSI, no downloads during setup).
- ✅ Silent install (`msiexec /i … /quiet`) exit `0`.
- ✅ Clean silent uninstall exit `0` — Program Files, uninstall entry and ProgID all removed.
- ✅ Proper Add/Remove Programs registration ("PDFluent v1.0.0").
- ✅ `.pdf` file association registered (`PDFluent.pdf` ProgID → `pdfluent-desktop.exe "%1"`).
- ✅ Auto-updater feed reachable (`pdfluent.com/releases/latest.json`); still
  advertises 1.0.0-beta.19 — flipping it to 1.0.0-beta.20 is a separate,
  deliberately un-done step (doesn't block Store submission, which only needs
  the package URL above to be live).
- ✅ Frontend-embed gate clean (ships the current bundle, no stale assets).
- ◻️ Windows App Certification Kit (WACK) — present on the box; an optional deeper pass the owner can run interactively (see the pipeline doc). Not required for Win32 Store submissions.
