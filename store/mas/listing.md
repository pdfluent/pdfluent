<!--
Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
See https://pdfluent.com/license for terms.

Customer-facing copy. It is an adaptation of the Microsoft Store listing that has
been live since 2026-07-27 (store/listing/listing-copy.md), which went through the
Humanizer pass before publication: same product, same voice, macOS wording, and
the claims re-checked against docs/UI_REGISTER.md. New sentences written for this
listing are marked; run those through the usual external-copy route before Submit
if you want them rewritten.
-->

# App Store listing (en-US)

## App Store Connect fields

| Field | Value |
|---|---|
| Name (30) | `PDFluent` |
| Subtitle (30) | `Edit PDFs on your Mac` |
| Primary category | Productivity |
| Secondary category | Business |
| Price | Free |
| Age rating | 4+ |
| Copyright | `2026 Innovation Trigger B.V.` |
| Marketing URL | `https://pdfluent.com` |
| Support URL | `https://pdfluent.com/support` |
| Privacy Policy URL | `https://pdfluent.com/privacy` |
| Version | `1.0.0` |
| Build | from `store/mas/build-number` |
| Custom EULA | yes — see `eula.md` |

## Keywords (100 characters, comma separated, no spaces)

```
pdf,editor,edit,convert,word,docx,merge,split,compress,redact,sign,ocr,offline,annotate
```

(86 characters. Do not repeat words from the app name or subtitle; Apple indexes
those already.)

## Promotional text (170)

Everything happens on your Mac. No account, no upload, no subscription. Free for
everyone, including businesses.

## Description

PDFluent is a PDF editor that runs on your Mac, not in the cloud. There is no
account and no sign-in. Open a file and it opens. Whatever you do with it stays
on your device.

Edit text straight in the PDF. Click a line, type, and the change goes into the
document with the font and colour preserved. It even handles the awkward cases,
like white text on a dark, coloured slide.

Convert a PDF to Word, Excel, PowerPoint, an image, or PDF/A. You get a real
Office file you can keep working in, not a flat picture of the page.

Everything else is one click away in the tools panel: compress a heavy file,
reorder or rotate pages, merge several PDFs into one, split one apart, redact
text so it is actually removed, add a watermark, and run OCR to make a scan
searchable.

Sign documents on your own machine. PDFluent produces a PAdES digital signature
locally. It does not send your file to a signing service.

This is the point of PDFluent. Your contracts, IDs, and financial documents never
leave your computer, because the app makes no network request to do any of the
work above. It can check for an update, and it can send a crash or feedback
report if you switch reporting on. Both are off the document path and reporting
is off until you enable it.

PDFluent is completely free, including for business use. No account, no
subscription, no licence file.

Under the hood it uses a pure-Rust PDF engine, so it starts fast and stays light.

## Feature bullets, and what each one rests on

Every bullet names its proof, and `tests/mas-store-assets.test.ts` checks each one:

- `tile:<id>` — the id must be in `src/viewer/tools/wiredTools.generated.ts`, the
  list the UI register generates by walking the shipped shell. A tool that loses
  its wiring drops out of that file and takes this listing red with it.
- `command:<name>` — the backend command must be registered in
  `src-tauri/src/lib.rs` **and** invoked from the shipped frontend. This is the
  proof for the Office conversions, which run from the export dialog rather than
  from a tool tile, so the register does not cover them yet.

| Bullet | Proven by |
|---|---|
| Edit text directly inside the PDF, including white text on coloured pages | `tile:toolbar.editText` |
| Convert to Word, Excel or PowerPoint | `command:convert_to_docx`, `command:convert_to_xlsx`, `command:convert_to_pptx` |
| Export a page as PNG or JPEG | `command:export_page_as_image` |
| Convert to PDF/A for archiving | `tile:toolbar.pdfa` |
| Merge several PDFs, or split one apart | `tile:toolbar.merge`, `tile:toolbar.split` |
| Reorder, rotate, insert and delete pages | `tile:toolbar.rotateRight`, `tile:toolbar.insertPage`, `tile:toolbar.deletePage` |
| Compress a heavy file | `tile:toolbar.compress` |
| Redact text permanently | `tile:toolbar.redact` |
| Add a watermark | `tile:toolbar.watermark` |
| Protect a document with a password | `tile:toolbar.password` |
| OCR to make a scanned PDF searchable | `tile:toolbar.ocrScan` |
| Sign locally with a PAdES digital signature | `tile:toolbar.signature` |
| Highlight, underline, strike through and comment | `tile:toolbar.highlight`, `tile:toolbar.underline`, `tile:toolbar.strikethrough`, `tile:toolbar.comment` |
| Search across the document | `tile:toolbar.searchText` |

## What's New (first release)

First release on the Mac App Store. PDFluent has been available as a direct
download from pdfluent.com; this is the same editor, sandboxed for the App Store
and without the built-in updater, because the App Store handles updates.

## Notes for whoever pastes this in

- The description above is the live Microsoft Store text with "PC" changed to
  "Mac" and the Windows-only lines dropped. Keeping the two stores on one text is
  deliberate: two descriptions drift, and then one of them is wrong.
- The subtitle, keywords, promotional text and "What's New" are new for this
  listing.
- Do not add "invite to sign", "cloud sync" or "AI summary" to any field. None of
  those exist in the app.
