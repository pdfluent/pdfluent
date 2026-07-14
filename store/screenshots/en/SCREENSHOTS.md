<!--
Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
See https://pdfluent.com/license for terms.
-->

# English Microsoft Store screenshots — final raw set

Six raw **1920×1080 PNG** captures from the actual installed, Authenticode-signed
Windows candidate (`PDFluent_1.0.0-beta.18_x64_en-US.msi`, localized build), with the
full UI forced to **English** and a **neutral demo PDF** ("Project Proposal", a
fictional internal planning document — no personal or confidential content).

They are intentionally **raw and unbranded** (no overlays, no marketing text) so they
can be styled later. They meet the Store desktop spec (≥1366×768, PNG).

- Full raw PNGs: [`final/`](final) — the six selected captures, nothing else.
- Numbered contact sheet: [`final/contact-sheet.png`](final/contact-sheet.png).

## Files, captions, and focal areas

| # | File | Caption (≤200 chars) | Focal area |
|---|------|----------------------|------------|
| 1 | `01-welcome.png` | Open any PDF — everything runs locally on your device. | Centre: the "PDFluent Editor" mark, the one-line subtitle, and the **Open PDF** button. |
| 2 | `02-reading.png` | Fast, faithful reading with page thumbnails. | Right: the rendered page; left: the **page thumbnail rail**. Clean, uncluttered chrome. |
| 3 | `03-edit.png` | Edit text directly in the PDF — fonts, colours, inline. | Left **Edit panel** (font, B/I/U, colour) + the in-page caret/format bar where text is being edited. |
| 4 | `04-convert.png` | Convert to Word, Excel, PowerPoint, image or PDF/A. | Left **Convert panel**: the format list (Microsoft Word/Excel/PowerPoint, Image, Archive) and the **Convert to DOCX** action. |
| 5 | `05-tools.png` | Every tool in one place: compress, merge, split, redact, watermark, OCR. | Left **All tools** grid — the breadth of tools at a glance. |
| 6 | `06-sign.png` | Sign locally with a PAdES digital signature — nothing leaves your PC. | Left **Sign panel**: "Locally signed — nothing leaves this device" and **Add signature / Invite to sign**. |

## Recommended Store ordering

The Store shows the first one or two images most prominently, so lead with the
differentiator and the privacy promise:

1. **03-edit** — the headline capability (editing text inside a PDF).
2. **04-convert** — convert to Office formats, a top search intent.
3. **05-tools** — breadth (one app, every tool).
4. **06-sign** — signing + the local-only privacy message.
5. **02-reading** — clean, fast viewing.
6. **01-welcome** — the local-first opener / brand close.

(The files are numbered in capture order 01–06; reorder by dragging in Partner
Center per the list above.)

## Quality checklist (all hold for this set)

- English UI throughout (no unintended Dutch); verified at runtime on the candidate.
- Native 1920×1080 PNG.
- Neutral demo document; **no** PII, local paths, recent-files list, debug UI, or
  marketing overlays.
- Consistent window size, zoom, and document across all six.
