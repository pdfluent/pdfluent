<!--
Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
See https://pdfluent.com/license for terms.

Customer-facing copy for the Mac App Store, editor 1.1.1. The field texts below
are the final, claim-checked texts (every sentence rests on a registered claim
ID; the release owner holds the register). Edit a sentence only together with
its claim. Withdrawn wording ("pure-Rust", "runs fully offline", PAdES) must not
come back: tests/store-listing-truth.test.ts fails on it.
-->

# App Store listing (en-US)

## App Store Connect fields

| Field | Value |
|---|---|
| Name (30) | `PDFluent: PDF Editor` |
| Subtitle (30) | `Sign, fill, OCR and merge` |
| Primary category | Productivity |
| Secondary category | Business |
| Price | Free |
| Age rating | 4+ |
| Copyright | `2026 Innovation Trigger B.V.` |
| Marketing URL | `https://pdfluent.com` |
| Support URL | `https://pdfluent.com/support` |
| Privacy Policy URL | `https://pdfluent.com/privacy` |
| Version | `1.1.1` |
| Build | from `store/mas/build-number` |
| Custom EULA | yes, see `eula.md` |

If "PDFluent: PDF Editor" is not free in App Store Connect, fall back to the
name `PDFluent`; every other field stays valid.

## Keywords (100 bytes, comma separated, no spaces)

```
convert,word,compress,redact,annotate,highlight,split,watermark,scan,offline,private,free,forms
```

(95 bytes. No word from the name or subtitle is repeated; Apple
indexes those already. `free` is the one word Apple may object to in review;
drop it if it does.)

## Promotional text (170)

Edit PDF text, fill forms, sign, redact and OCR contracts and ID scans on your Mac. Everything stays on your device. Free for everyone, including commercial use.

## Description

```
Handle business PDFs
Contracts, invoices and ID scans open on your Mac, ready to be edited, signed and redacted. OCR reads a scan so you can search and copy the text. The editor is free for everyone, including business and commercial use, with no account and no sign-in.

Edit text on the page
Double-click a line or a paragraph, rewrite it and save. Pick a font from the fonts installed on your Mac, plus size and colour. Move, replace or delete a picture that is already on a page.

Mark up a document
Highlight, underline and strike through text. Add sticky-note comments, draw freehand, attach a file. Delete or edit an annotation again whenever you want.

Fill in PDF forms
Totals and other calculations work once you allow them. When a form carries scripts, the app asks before anything runs. Open an older XFA form, fill in its fields and save: the values are in the file when you reopen it.

Certificate signatures
Sign with your own .p12 or .pfx file on your Mac. Check the signatures already in a document.

Searchable scans
Run OCR on a scanned PDF and the text becomes easy to find and copy. OCR is built in, so there is nothing to download. It reads six languages: English, Dutch, German, French, Spanish and Italian.

Organize a PDF
Merge, split and extract pages. Rotate, delete, reorder and insert pages. Compress a heavy file, set or remove a password, add a watermark and edit document properties. A password-protected PDF asks for its password.

Redact by search or area
Choose a term or draw a box around what should disappear. Once applied and saved, the text is gone from the file.

Convert to Word or PowerPoint
A PDF becomes a real Office file you can work with. Export pages as PNG or JPEG, or convert to PDF/A. You can also export as Markdown and export tables to Excel; both are labelled Preview in the app.

Open many documents
Several PDFs can sit in their own tabs at the same time. Documents open fitted to the window. Search, select and copy text. Print and jump by thumbnail. Dark mode is remembered. After a crash the app offers your unsaved work back.

Everything stays on your device
Works without internet. Opening, editing, signing, converting, redacting and OCR all run on your Mac, and documents are not uploaded. The Mac App Store build has no update check, because the App Store delivers updates. Crash and feedback reports are sent only if you choose to send one. The app runs in the macOS App Sandbox and reads and writes only the files you choose. It runs natively on Apple silicon and Intel Macs.

Free for everyone
The editor costs nothing. The interface is available in 27 languages.

For developers
PDFluent is built on the PDFluent SDK, the engine developers embed in their own products. Learn more at pdfluent.com.
```

## Feature bullets, and what each one rests on

Every bullet names its proof, and `tests/mas-store-assets.test.ts` checks each one:

- `tile:<id>`: the id must be in `src/viewer/tools/wiredTools.generated.ts`, the
  list the UI register generates by walking the shipped shell. A tool that loses
  its wiring drops out of that file and takes this listing red with it.
- `command:<name>`: the backend command must be registered in
  `src-tauri/src/lib.rs` **and** invoked from the shipped frontend. This is the
  proof for the Office conversions, which run from the export dialog rather than
  from a tool tile, so the register does not cover them yet.

Forms, tabs, dark mode and crash recovery have no tile; they rest on their
claim IDs and on the journeys jobs in CI, not on this table.

| Bullet | Proven by |
|---|---|
| Edit text on the page | `tile:toolbar.editText` |
| Move, replace or delete a picture on a page | `tile:toolbar.image` |
| Highlight, underline, strike through, comment, draw freehand | `tile:toolbar.highlight`, `tile:toolbar.underline`, `tile:toolbar.strikethrough`, `tile:toolbar.comment`, `tile:toolbar.freeDraw` |
| Sign with your own .p12 or .pfx certificate | `tile:toolbar.signature` |
| OCR a scanned PDF so it becomes searchable | `tile:toolbar.ocrScan` |
| Merge, split and extract pages | `tile:toolbar.merge`, `tile:toolbar.split` |
| Rotate, delete, reorder and insert pages | `tile:toolbar.rotateRight`, `tile:toolbar.insertPage`, `tile:toolbar.deletePage` |
| Compress a heavy file | `tile:toolbar.compress` |
| Set or remove a password | `tile:toolbar.password` |
| Add a watermark | `tile:toolbar.watermark` |
| Edit document properties | `tile:toolbar.metadata` |
| Redact by search or area | `tile:toolbar.redact` |
| Convert to Word or PowerPoint | `command:convert_to_docx`, `command:convert_to_pptx` |
| Export tables to Excel (labelled Preview) | `command:convert_to_xlsx` |
| Export pages as PNG or JPEG | `command:export_page_as_image` |
| Convert to PDF/A | `tile:toolbar.pdfa` |
| Search, select and copy text | `tile:toolbar.searchText` |

## What's New (4000)

```
Open several PDFs at once, each in its own tab. Scanned documents become searchable and copyable with built-in OCR, in six languages. Fill in PDF forms and let totals and other calculations run once you allow them. Move, replace or delete a picture that is already on a page. Dark mode is remembered between sessions. After a crash the app offers your unsaved work back. No uploads, and the Mac App Store build has no update check.
```

## Notes for whoever pastes this in

- The App Review note for this version is in `review-notes.md`.
- Do not add "invite to sign", "cloud sync" or "AI summary" to any field. None of
  those exist in the app.
- "Sign" means signing with the user's own certificate. Typed or drawn
  signatures are not claimed.
- "Works without internet" and "Everything stays on your device" are gated on the
  runtime check and the offline allowlist job named in the claim register; do not
  paste before those are green.
