<!--
Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
See https://pdfluent.com/license for terms.
-->

# Mac App Store screenshots

Six PNGs at **2880×1800**, the largest size Apple accepts for a macOS app
(the others are 1280×800, 1440×900 and 2560×1600). They are captured from a
1440×900 window on a 2× display, so every pixel is a real pixel: nothing here has
been resampled or upscaled.

They come from the **Mac App Store build itself** — the sandboxed universal app
`scripts/build-mas.sh` produced from this commit, with the updater compiled out
and `MAS_BUILD` set in the frontend. Not the dev server, not the direct-download
build.

One wrinkle, and it is worth knowing before someone tries to reproduce this:
**the package that goes to Apple cannot run on this Mac.**
`src-tauri/PDFluent_MAS.provisionprofile` is a Mac App Store *distribution*
profile, so it carries no provisioned devices, and macOS refuses the launch with
`Launchd job spawn failed` (POSIX 163) wherever the app is installed from. Only
the App Store and TestFlight can start that binary. So the screenshots are taken
from a copy of the same `.app` with the embedded profile removed and the bundle
re-sealed with the Developer ID identity and the same sandbox entitlements. That
is a signature change; nothing is recompiled and no pixel differs.

## Capturing them again

```sh
bash store/mas/screenshots/harness/prepare-local-copy.sh   # make it launchable
bash store/mas/screenshots/harness/capture-mas.sh          # capture the six
```

The terminal running it needs Screen Recording and Accessibility permission. It
moves the app's sandbox container aside for the duration and puts it back
afterwards, so no one's recent-file names end up in a listing image. The
script refuses to write a file when the window is not exactly 1440×900 points,
when the PNG does not come out at 2880×1800, or when two captures are
byte-identical — that last one is what a missing Screen Recording grant looks
like, and it fails silently otherwise.

Scenes are selected with the keyboard (`1`–`8` switch viewer mode) rather than by
clicking pixel coordinates, which is what made the Windows harness need
recalibrating every time the rail changed width.

## The set

| # | File | Caption (≤170 chars) |
|---|------|----------------------|
| 1 | `01-welcome.png` | Open a PDF and start working. Everything happens on your Mac. |
| 2 | `02-reading.png` | Fast, faithful reading with page thumbnails. |
| 3 | `03-edit.png` | Edit text directly in the PDF, with the font and colour kept. |
| 4 | `04-convert.png` | Convert to Word, Excel, PowerPoint, an image or PDF/A. |
| 5 | `05-tools.png` | Every tool in one place: compress, merge, split, redact, watermark, OCR. |
| 6 | `06-sign.png` | Sign locally with a PAdES digital signature. Nothing leaves your Mac. |

Order in App Store Connect: lead with `03-edit`, then `04-convert`, `05-tools`,
`06-sign`, `02-reading`, `01-welcome`. The first two are the ones most people see.

## Status

These are the plain product captures, taken so the submission is not blocked on
anything. A branded set from the designer is expected to replace them; when it
does, keep the same six file names and the same 2880×1800, because
`tests/mas-store-assets.test.ts` checks both.

They must match the package that is uploaded, and they do: both come from **build
3**. The first set came from build 2 and showed the dead "Document language"
field in the Convert panel — capturing it is what found the field, and the same
change that removed it made those images wrong. Rebuilding and re-capturing is
two commands (see `../UPLOAD-RUNBOOK.md`); do it whenever the UI moves. A
screenshot of a control the shipped app no longer has is how the Microsoft Store
set ended up advertising an "Invite to sign" button that had been removed.

## Quality checklist

- English UI throughout.
- A neutral demo document ("Project Proposal", fictional) — no personal data, no
  local paths, no recent-files list, no debug UI.
- Same window size, zoom and document in all six.
- No marketing overlay, no device frame, no text burned into the image.
