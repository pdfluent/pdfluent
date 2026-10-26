<!--
Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
See https://pdfluent.com/license for terms.
-->

# What in the store texts changes for 1.1.0

**DRAFT, nothing here is approved or submitted.** This lists what has to change and why. Replacement prose is not
written here: external text comes from the model route (`scripts/screenshots/draft-copy.mjs` for the screenshot
copy, same route for the listing), then the Humanizer pass, then Jasper. Every new claim needs a `CLAIMS.md` ID
first. Claim IDs below are the ones that exist today; "NEEDS-ID" means nothing registers it yet.

## Screenshot headlines and captions

The live set (2026-08, Figma) has six frames: free private editor, convert, sign, open instantly, everything in one
editor, read without distractions. All six are blue and all six go stale with the monochrome editor. The 1.1.0 set
is in `layout.json` (10 frames); drafts in `copy.json` (`draft: true`).

| Frame | New for 1.1.0 | Blocked by | Claim |
|---|---|---|---|
| 01 open | monochrome UI | monochrome branch landing | NEEDS-ID if the headline says anything about speed ("instantly" had none either) |
| 02 edit text + font | system fonts | none (J-43's gap id is stale, see report) | NEEDS-ID |
| 03 Markdown | Markdown export, Preview label | none | B51 covers the SDK extraction preview; the editor feature needs its own ID |
| 04 Excel | tables to Excel, Preview label | none | same |
| 05 OCR (both stores) | OCR built in: the scan after OCR, no download dialog (DECIDED 19-10) | J-60 gap `ocr-text-layer`; the built-in OCR claim has no ID yet (B63, the opt-in download, is obsolete) | NEEDS-ID (proposal in the pull request of `feat/ocr-bundled-everywhere`), B08, B30 |
| 06 images | editing page images | J-45 gap `page-images-767` | NEEDS-ID |
| 07 typed signature | typed signature with font | J-62 gap `typed-signature-767` | NEEDS-ID |
| 08 XFA | XFA form filling | J-59 gap `xfa-fill-in-place` | NEEDS-ID |
| 09 organiser | unchanged feature, new look | none | none needed |
| 10 All tools | All tools | none | none needed |

Dropped from the live set: "Read PDFs without distractions" and "Open any PDF instantly" (no new proof; the
"instantly" and "large documents" lines were never in CLAIMS.md). "Sign PDFs in Seconds" becomes frame 07.

## Listing texts (Microsoft `store/listing/listing-copy.md`, Mac `store/mas/listing.md`)

| Text | Change needed | Why |
|---|---|---|
| Description, Convert paragraph | add Markdown and tables to Excel, as Preview | new export formats |
| Description, Edit paragraph | mention choosing a system font | new |
| Description, tools paragraph | OCR: say it is built in and works offline (both stores; DECIDED 19-10, no optional download any more) | NEEDS-ID; B63 (the opt-in download) is obsolete |
| Description, privacy paragraph ("makes no network request ... can check for an update, and it can send a crash or feedback report") | rewrite to match B08/B30: the kinds of outbound connection in 1.1.0 are the update check and the opt-in crash and feedback reports; OCR makes none (it is built in) | the sentence stays true for OCR; it still needs the feedback and report wording |
| Description, Sign paragraph | add typed signature | after J-62 gap closes |
| Description, forms | XFA filling, if claimed | after J-59 gap closes; today only flatten works |
| Feature bullets | add Markdown export, tables to Excel, system fonts, page images, typed signature | each Mac bullet needs a proof in `tests/mas-store-assets.test.ts` (`tile:` or `command:`), so add the matching wired tile or command |
| Mac keywords (100 characters, 86 used) | room for 14 more characters, e.g. markdown | indexing |
| Search terms (Microsoft, 7 max) | full at 7; swap one if Markdown matters | |
| What's new, Microsoft `store/listing/release-notes.md` | replace the 1.0.0-beta.21 text | it describes an older release |
| What's new, Mac (`store/mas/listing.md`, "first release") | rewrite for the release that actually ships first | |
| Version field, Mac | 1.0.0 -> 1.1.0, build number | |
| OCR, both stores | DECIDED 19-10 (owner): Tesseract and the six language packs are bundled in every build (Mac DMG and site, Windows MSI and Microsoft Store, Mac App Store), so OCR works everywhere with no download and no consent dialog (`docs/BUNDLED_OCR.md`). Replaces "OCR is an optional download (Microsoft only)" and "do not promise OCR on Mac". The Mac review notes explain the sandbox-inheriting helper | NEEDS-ID ("OCR is built in, works offline, nothing to download"; the size and language list must come from the measured bundle, `docs/BUNDLED_OCR.md`). Frame 05 (OCR) now runs on both stores; the Mac-only frame 05m is dropped |
| `docs/store_visuals_parity.json` | add the controls the new frames show | `tests/store-visuals-parity.test.ts` |
