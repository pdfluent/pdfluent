<!--
Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
See https://pdfluent.com/license for terms.
-->

# PDFluent on the Microsoft Store

PDFluent has been live on the Microsoft Store since **2026-07-27**. This folder is
the dossier behind that listing: what is published, how the next version gets
there, and every field the submission form asks for.

| | |
|---|---|
| Listing | <https://apps.microsoft.com/detail/XPDBXJ6XRLFQK2> |
| Store ID | `XPDBXJ6XRLFQK2` |
| Publisher | PDFluent - Innovation Trigger BV (developer name `Innovation Trigger B.V.`) |
| Price | Free, all markets |
| Version shown | 1.0.0 (package `1.0.0-beta.21`) |
| Package last updated | 2026-07-27 |

> **Shipping a new version?** Read [`update-runbook.md`](update-runbook.md). The
> Store serves a URL, not our bytes: an update that does not change the package
> URL keeps handing users the old MSI. The machine-readable record of what is
> live is [`live-listing.json`](live-listing.json), and
> `tests/store-listing-truth.test.ts` fails if this folder drifts away from it.

## Packaging route (decided)

**Win32 app (EXE/MSI), not MSIX.** PDFluent ships an Authenticode-signed `.msi`,
hosted by us, submitted as a Win32 app. This preserves the app's own auto-updater
and `.pdf` file associations — both of which MSIX's AppContainer sandbox +
Store-managed updates would break. Full rationale + the MSIX trade-off:
[`packaging-route.md`](packaging-route.md). (The editor itself is free for
everyone, including commercial use, and no longer has any licensing UI — see
`LICENSE.md`.)

## The published package

| | |
|---|---|
| Product | PDFluent — privacy-first desktop PDF editor |
| Version | 1.0.0-beta.21 (the Store shows it as 1.0.0) |
| Installer | `PDFluent_1.0.0-beta.21_x64_en-US.msi` (~20 MB, offline, per-user/per-machine WiX MSI) |
| Package URL (self-hosted, what the Store downloads) | `https://pdfluent.com/releases/1.0.0-beta.21/PDFluent_1.0.0-beta.21_x64_en-US.msi` |
| SHA-256 | `f6262ac4ef35920f0b6d2992dd9bf4701a21751309a85b1e938533af10364f12` |
| Code signing | Authenticode **Valid** — Azure Trusted Signing, `CN=Innovation Trigger B.V.` (Microsoft ID Verified CS chain, RFC3161 TSA) |
| Architecture | x64 (Windows 10 / 11) |
| Product code | `{aee448fb-9ac3-4519-956e-60b7a232cda8}` |
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
| [`screenshots/raw/`](screenshots/raw) | Superseded raw captures, kept for provenance (see `screenshots/screenshot-brief.md`) |
| [`screenshots/contact-sheet.png`](screenshots/contact-sheet.png) | Review montage of all six |
| [`screenshots/screenshot-brief.md`](screenshots/screenshot-brief.md) | Captions, ordering, the language caveat, design briefs for branded versions |
| [`assets/store-logo-300.png`](assets/store-logo-300.png) | 300×300 Store logo (1:1 app tile) |
| [`update-runbook.md`](update-runbook.md) | **How a new release reaches the Store** — the update-submission loop |
| [`live-listing.json`](live-listing.json) | Machine-readable record of what is live; the guard test reads this |
| [`scripts/check-live-listing.sh`](scripts/check-live-listing.sh) | Re-reads the live listing and diffs it against that record |
| [`OWNER-BRIEF.md`](OWNER-BRIEF.md) | What is left that only the owner can do |

## Certification status (validated on the published package, Windows 11 box)

- ✅ Authenticode signature Valid on both the MSI and the installed `.exe`.
- ✅ Offline installer (self-contained WiX MSI, no downloads during setup).
- ✅ Silent install (`msiexec /i … /quiet`) exit `0`.
- ✅ Clean silent uninstall exit `0` — Program Files, uninstall entry and ProgID all removed.
- ✅ Proper Add/Remove Programs registration ("PDFluent v1.0.0").
- ✅ `.pdf` file association registered (`PDFluent.pdf` ProgID → `pdfluent-desktop.exe "%1"`).
- ✅ Auto-updater feed (`pdfluent.com/releases/latest.json`) advertises
  1.0.0-beta.21 for windows-x86_64 and darwin-aarch64; the self-hosted package
  URL above is live (HTTP 200).
- ✅ Frontend-embed gate clean (ships the current bundle, no stale assets).
- ◻️ Windows App Certification Kit (WACK) — present on the box; an optional deeper pass the owner can run interactively (see the pipeline doc). Not required for Win32 Store submissions.
