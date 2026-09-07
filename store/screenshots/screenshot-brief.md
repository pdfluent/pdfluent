<!--
Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
See https://pdfluent.com/license for terms.
-->

# Screenshot brief

> **Historical record.** These six raw 1920×1080 captures came from the installed
> `1.0.0-beta.18` candidate and are **not** what the Store shows. The live listing
> uses the designer's 3840×2160 set of 2026-08-20, listed in
> `../listing/PASTE-SHEET.md`. Kept for provenance and for the caption/ordering
> reasoning below.


Six **raw 1920×1080 PNG** captures taken from the **actual installed Windows
candidate** (`PDFluent_1.0.0-beta.18_x64_en-US.msi`, Windows 11). They meet the
Microsoft Store desktop screenshot spec (≥1366×768, PNG, <50 MB) and are ready
to upload as-is. They are intentionally **raw** (unbranded) so they can be
polished later.

## Files, order, and captions (≤200 chars)

Upload in this order (drag to reorder in Partner Center); captions optional but recommended:

| # | File | Caption (en) |
|---|---|---|
| 1 | `raw/01-welcome.png` | Open any PDF — everything runs locally on your device. |
| 2 | `raw/02-viewer.png` | Fast, faithful viewing with page thumbnails. |
| 3 | `raw/03-edit.png` | Edit text directly in the PDF — fonts, colours, inline. |
| 4 | `raw/04-convert.png` | Convert to Word, Excel, PowerPoint, image or PDF/A. |
| 5 | `raw/05-tools.png` | Every tool in one place: compress, merge, split, redact, watermark, OCR. |
| 6 | `raw/06-sign.png` | Sign documents locally with a PAdES digital signature. |

Contact sheet for quick review: [`contact-sheet.png`](contact-sheet.png).

## ⚠ Demo content caveat (owner decision)

The document shown in shots 2–6 is `Brainstorm.pdf`, the test deck used during
validation (an internal recruiting brainstorm). It is fine for these raw captures
and the private repo, but it would be **public** on the Store listing. For launch,
re-capture the same flows with a **neutral demo PDF** (a generic report, invoice,
or contract template) so no internal content is shown publicly.

## ⚠ Language caveat (owner decision)

> **RESOLVED (2026-06-22):** the shipped v3 editor has been fully internationalized
> (react-i18next, complete en+nl, guard test), a new Authenticode-signed candidate was
> built, and the **English (en-US) screenshot set is ready** in
> [`en/final/`](en/final) — see [`en/SCREENSHOTS.md`](en/SCREENSHOTS.md) for ordering and
> focal-area notes. Use that English set for an en-US listing (this nl-NL `raw/` set
> remains for a Dutch listing). Background: [`en/ENGLISH-BLOCKER.md`](en/ENGLISH-BLOCKER.md).

The raw captures are in **Dutch (nl-NL)**. Given the blocker above, the options are:

- **A (do this for an en-US listing):** localize the hardcoded strings in the v3
  shell, rebuild + re-validate the MSI, then run the harness in [`en/harness/`](en/harness)
  (it forces the `t()`-driven UI to English and uses the neutral demo PDF). An
  English *OS session alone is not enough*.
- **B:** ship the nl-NL captures under a **Dutch (nl-NL)** Store listing and add a
  separate en-US listing after the localization fix.
- **C:** ship as-is (functional, but mixed-language for an English listing — not
  recommended for a polished launch).

## How these were captured (reproducible)

On the Windows box, in the active console session (so the desktop is real): the
installed `pdfluent-desktop.exe` is launched (optionally with a PDF argument), its
window is sized to exactly 1920×1080 with `MoveWindow`, panels are opened by
**UI Automation by accessible name** (`Bewerken`, `Converteer`, `Alle tools`,
`Ondertekenen`), and each state is captured with `Graphics.CopyFromScreen` into a
1920×1080 PNG. The driver script ran via an interactive scheduled task (session 1).
A sample `Brainstorm.pdf` was used as document content.

## Design briefs for later branded versions

For a polished store gallery (owner / designer task — out of scope for the raw set):

- **Consistent frame:** place each app capture on a branded backdrop (PDFluent
  indigo/neutral), 1920×1080, with a one-line headline in the **top two-thirds**
  (Store overlays can dim the bottom third — keep key visuals/text high).
- **Headlines, one per shot:** "Edit text right in the PDF", "Convert to Office in
  a click", "Every PDF tool, on your device", "Sign locally — nothing leaves your
  PC", "Open and read instantly", "Organize, redact, protect".
- **No extra logos/marketing inside the capture** (Store guideline); keep the app
  UI clean and readable; avoid heavy gradients/stripes that fight text overlays.
- **Optional 16:9 hero (1920×1080, no text):** an abstract PDFluent-branded visual
  (not the app UI, no device chrome) if you want eligibility for promotional
  placement. Not required to submit.
- **Localization:** generate the branded set per listing language (en-US first).
