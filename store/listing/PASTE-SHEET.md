<!--
Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
See https://pdfluent.com/license for terms.
Paste-ready Microsoft Store listing (en-US). Copy each block into the matching
Partner Center field. Only ONE language listing (English) is required to launch.
-->

# Partner Center — Store listing paste sheet (English, en-US)

The listing is live (Store ID `XPDBXJ6XRLFQK2`). These blocks are what the English
listing **should** say; paste the ones that changed on
Partner Center → PDFluent → **Update** → *Store listing*, then Submit. See
[`../update-runbook.md`](../update-runbook.md) for when each field needs touching.

> The **Description** block below has not been pasted into Partner Center yet. The
> live description still carries the abolished paid-app grant — see
> [`../OWNER-BRIEF.md`](../OWNER-BRIEF.md) §1.

One English listing is enough; a listing per language is not required.

---

## Description  (field: "Description", max 10,000 chars)

```
PDFluent is a PDF editor that runs on your computer, not in the cloud. There is no account and no sign-in. Open a file and it opens. Whatever you do with it stays on your device.

Edit text straight in the PDF. Click a line, type, and the change goes into the document with the font and colour preserved. It even handles the awkward cases, like white text on a dark, coloured slide.

Convert a PDF to Word, Excel, PowerPoint, an image, or PDF/A. You get a real Office file you can keep working in, not a flat picture of the page.

Everything else is one click away in the tools panel: compress a heavy file, reorder or rotate pages, merge several PDFs into one, split one apart, redact text so it is actually removed, add a watermark, and run OCR to make a scan searchable.

Sign documents on your own machine. PDFluent produces a PAdES digital signature locally. It does not send your file to a signing service.

This is the point of PDFluent. Your contracts, IDs, and financial documents never leave your computer, because the app makes no network request to do any of the work above. It can check for an update, and it can send a crash or feedback report if you switch reporting on. Both are off the document path and reporting is off until you enable it.

The interface is available in 27 languages and follows your Windows display language.

PDFluent is completely free, including for business use. No account, no subscription, no licence file.

Under the hood it uses a pure-Rust PDF engine, so it starts fast and stays light.
```

## Short description  (field: "Short description", max 1,000 chars)

```
A PDF editor that runs entirely on your PC. Edit text, convert to Word or Excel, merge, redact, OCR, and sign documents locally. No account, no upload, nothing leaves your device.
```

## What's new in this version  (field: "What's new in this version")

```
Editing white text on a coloured page now shows the text while you type, and exporting to Word opens cleanly with its images intact. PDFluent still does the rest on your own PC: edit text in the PDF, convert to Word, Excel and PowerPoint, run OCR, and sign documents locally. No account, no upload. The interface follows your Windows display language.
```

## Product features  (field: "Product features" — add each as a separate bullet, max 20, ≤200 chars each)

```
Edit text directly inside the PDF, including white text on coloured pages
Convert to Word, Excel, PowerPoint, image, or PDF/A
Merge, split, reorder, rotate, and compress pages
Redact text permanently and add watermarks
OCR to make scanned PDFs searchable
Sign locally with a PAdES digital signature
Runs fully offline. No account, no upload, no tracking
```

## Search terms  (field: "Search terms" — add each separately, ≤30 chars each, up to 7)

```
pdf editor
edit pdf
convert pdf
pdf converter
sign pdf
pdf ocr
offline pdf
```

## Copyright and trademark info  (optional field)

```
© 2026 Innovation Trigger B.V.
```

## Additional license terms  (optional field)

```
https://pdfluent.com/license
```

---

## Images to upload (in the Store listing page)

**Screenshots** (Screenshots section — upload in this order; drag to reorder):
Source: the designer's set, exported from Figma on 2026-08-20 at 3840×2160 and
kept outside this repository with the other brand assets. That set is what the
live listing shows. The older raw captures under `../screenshots/en/final/`
must not be uploaded again: one of them shows an "Invite to sign" button that
was removed from the app in `993990d`. See `../BLOCKER-screenshots.md`.

1. `01.png` — The free private PDF editor (free, private, Rust, no account)
2. `02.png` — Convert PDFs without compromise (Word, images)
3. `03.png` — Sign PDFs in seconds (digital signatures, offline)
4. `04.png` — Open any PDF instantly (large documents included)
5. `05.png` — Everything you need in one PDF editor
6. `06.png` — Read PDFs without distractions

Captions are optional; the headline on each image already carries the message.

**Store logos:**
- 1:1 Box art (required) → `store/assets/store-logo-1080.png` (1080×1080)
- 2:3 Poster art (recommended) → `store/assets/store-poster-720x1080.png` (720×1080)

---

## Then
- **Save** the listing.
- Reviewer notes are on the **Properties/Submission options** step (from
  [`reviewer-instructions.md`](reviewer-instructions.md)).
- **Review** (top-right) to catch any missing required field.
- **Submit** — the listing is live, so this is an Update submission and goes
  through certification again. Track it to "In the Store", then refresh
  `../live-listing.json` with `../scripts/check-live-listing.sh`.
