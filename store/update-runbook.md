<!--
Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
See https://pdfluent.com/license for terms.
-->

# Shipping a new version to the Microsoft Store

Listing: <https://apps.microsoft.com/detail/XPDBXJ6XRLFQK2> (Store ID
`XPDBXJ6XRLFQK2`). Record of what is live: [`live-listing.json`](live-listing.json).

PDFluent is a **Win32 (EXE/MSI) app** on the Store. Microsoft does not host the
installer; it hosts a **URL** that points at our own MSI on `pdfluent.com`, plus
a hash of the file it found there. Two consequences run through everything below:

1. **A new version is a new update submission.** There is no upload step that
   quietly replaces the bytes. Partner Center → the app → **Update** → change the
   package URL and the version → **Submit**. Until that update submission is
   certified, the Store keeps serving the previous MSI.
2. **The URL must change.** Our releases are versioned
   (`/releases/<version>/PDFluent_<version>_x64_en-US.msi`), so this happens by
   itself — but never re-publish a new build to an already-submitted URL. The
   Store validated a hash for that URL; a swapped file makes the listing serve
   something the Store never checked, and the auto-updater and the Store then
   disagree about what is installed.

The Store install is a normal install: **the in-app Tauri updater stays on** in it.
A user who installs from the Store can therefore be moved forward by the updater
before the Store submission is certified. That is fine and intended — the Store is
a distribution channel, not the update channel — but it means the Store listing
may legitimately lag the updater feed by a few days. It must never lag by a
release train.

## The loop

Run this after `RELEASE.md` steps 1–4, i.e. once the MSI is signed, published to
R2 and reachable at its public URL.

```bash
# 1. Validate the candidate exactly as the Store will see it.
store/scripts/validate-store-candidate.sh <version>

# 2. Refresh the record of what is live (network; safe to run any time).
store/scripts/check-live-listing.sh
```

3. **Partner Center** → PDFluent → **Update**.
   - *Packages*: replace the package URL with the new
     `https://pdfluent.com/releases/<version>/PDFluent_<version>_x64_en-US.msi`.
     Silent-install args stay `/quiet /norestart`.
   - *Store listing → What's new in this version*: paste from
     [`listing/release-notes.md`](listing/release-notes.md). This is the field
     that dates a listing fastest; write what changed for a user, not a version
     number.
   - *Store listing → Description*: only when the product claims changed. The
     paste-ready text is [`listing/PASTE-SHEET.md`](listing/PASTE-SHEET.md), which
     is held against `LICENSE.md` by `tests/licensing-claims-guard.test.ts`.
   - *Screenshots*: only when the UI in them changed. Sources and order are in the
     paste sheet.
   - **Submit**, then wait for certification (typically hours, up to three days).

4. **After certification**, re-run `store/scripts/check-live-listing.sh` and commit
   the refreshed [`live-listing.json`](live-listing.json). The guard test
   (`tests/store-listing-truth.test.ts`) then holds the whole dossier, the in-app
   About copy and `RELEASE.md` against the new values — which is what stops this
   folder describing a version nobody can install.

## What the guard cannot see

`check-live-listing.sh` needs the network, so it is a release step, not a CI step.
It exits 0 on a match, 1 on drift and 3 when it could not run at all — check the
code, not just the output: a check that never ran used to exit 0 like one that
passed.
CI only checks that the dossier agrees with `live-listing.json`; if nobody ever
refreshes that file, CI is consistent with a stale record. The refresh is step 4
above for that reason, and the script prints
`SKIPPED (not a pass): <reason>` rather than a green line when it cannot reach the
Store.

## Open item for the owner

The **live description still carries the abolished paid-app grant** — it tells
readers that business use needs a paid seat, which stopped being true on
2026-07-11 (`LICENSE.md`: the editor is free for everyone, including business
use). The corrected text has been in [`listing/PASTE-SHEET.md`](listing/PASTE-SHEET.md)
since then; it has never been pasted into Partner Center. This needs a listing
update on its own, and does not have to wait for a new build. See
[`OWNER-BRIEF.md`](OWNER-BRIEF.md) §1.
