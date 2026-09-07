<!--
Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
See https://pdfluent.com/license for terms.
-->

# Owner brief — Microsoft Store

The Store account, the submission and the certification are done. PDFluent has
been live since 2026-07-27 at
<https://apps.microsoft.com/detail/XPDBXJ6XRLFQK2>, free, all markets, published
by *PDFluent - Innovation Trigger BV*, installing the signed `1.0.0-beta.21` MSI
from our own domain.

Partner Center is no longer a gate. What is left needs your account access, and
the first item is a correctness problem rather than a nicety.

## 1. The live description is out of date (needs a listing update)

The description on the Store page still describes the paid-app model that was
abolished on 2026-07-11: it tells a reader that business use needs a paid seat.
`LICENSE.md` says the opposite, the website says the opposite, and the app has no
licence UI left. Anyone comparing the Store page with the product is reading a
promise we withdrew.

The corrected text is ready in [`listing/PASTE-SHEET.md`](listing/PASTE-SHEET.md)
(Description block). This is a **Store listing update, not a package update**: no
new build, no new MSI, no re-validation. Partner Center → PDFluent → Update →
Store listing → paste → Submit.

## 2. The next release needs a Store submission

New version means a new **Update** submission with a new package URL. The loop is
written out in [`update-runbook.md`](update-runbook.md) and referenced from
`RELEASE.md` step 5, so it is now part of cutting a release rather than something
to remember.

## 3. winget — waiting on a moderator, nothing to do

`microsoft/winget-pkgs` PR #430389 (`InnovationTrigger.PDFluent 1.0.0-beta.21`)
has the CLA signed and validation completed; it is queued for a moderator. The
manifests match the live MSI URL and hash. No action until it merges or a
moderator asks for a change.

## 4. Chocolatey — not started, and not urgent

Nothing exists. Worth doing once there is a stable `1.0.0` rather than a beta
package name that would need renaming.

## 5. Screenshots

The Store currently shows the set from the designer (3840×2160, exported
2026-08-20), listed in [`listing/PASTE-SHEET.md`](listing/PASTE-SHEET.md). The
older raw captures under `screenshots/` are kept for provenance only and are
marked as historical. Re-upload only if the UI in them changes.

## Values that are already correct on the listing

- Privacy policy: `https://pdfluent.com/privacy` · Website: `https://pdfluent.com`
- Support contact: `https://pdfluent.com/support`
- Additional licence terms: `https://pdfluent.com/license`
- Category: Productivity · Architecture: x64 · Min OS: Windows 10 1809
- Age rating: PEGI 3 / everyone · Price: Free · Markets: all
- Data collection: none by default (opt-in diagnostics only)
