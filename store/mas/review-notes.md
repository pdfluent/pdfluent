<!--
Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
See https://pdfluent.com/license for terms.
-->

# Review notes and the TestFlight smoke

## Notes for App Review (paste into "Notes" on the submission)

```
PDFluent is a PDF editor. There is no account, no sign-in, no in-app purchase
and no licence screen: every feature is available at once, to everyone,
including for commercial use. No demo account is needed.

To exercise the app, open any PDF (File > Open, or drag one onto the window).
Editing, converting, page operations, redaction, watermarking, signing and OCR
all run on the reviewer's Mac. The app makes no network request to perform them.

OCR (new in 1.1.0): Tesseract 5.5.1 ships inside the app bundle together with its
language data (English, Dutch, German, French, Spanish, Italian), at
Contents/Resources/resources/ocr/ (bin/tesseract, tessdata/). The helper is a
universal (arm64 and x86_64) executable, signed with our Apple Distribution
identity and the entitlements com.apple.security.app-sandbox plus
com.apple.security.inherit, so it runs inside the app's sandbox and holds no
entitlements of its own. The app passes it a page image on stdin and reads the
recognised text from stdout. It reads its language data from the signed bundle
and writes no file. Nothing is downloaded and no code is added after install
(guideline 2.5.2): the OCR files are the ones in the bundle you are reviewing.

Form scripts: some PDF forms carry calculations. The app asks before running
them, and they run only for documents the user opened, in a sandboxed
interpreter that is part of the app. No script is fetched from anywhere.

Sandbox: the app is sandboxed. It reads and writes only files the reviewer picks
in the standard open and save panels, and it remembers recent files with
security-scoped bookmarks so they reopen after a relaunch. It asks for no
full-disk access and no folder access.

Network: this App Store build has no update check (the updater is compiled out;
the App Store delivers updates). The one network entitlement
(com.apple.security.network.client) is used for an optional crash or feedback
report. Crash reporting is off by default, and nothing is sent until the user
presses Send in the review dialog. A feedback report can include the open
document only if the user ticks a box and confirms a second dialog that names
the file.

Export compliance: the app uses standard cryptography for PDF password
protection and digital signatures with the user's own certificate; the answers
are given on upload.
```

## TestFlight smoke — do this on the uploaded build before Submit

Fifteen minutes, on a Mac that is **not** the build machine if one is available. The
point is the sandbox: everything below is a file-access path, and a sandbox
misconfiguration shows up here rather than in a build log.

Install from TestFlight, then:

| # | Step | Expected |
|---|---|---|
| 1 | Launch. | The welcome screen appears. No permission prompt, no error dialog. |
| 2 | File → Open, pick a PDF in `~/Documents`. | It renders. Page thumbnails appear on the left. |
| 3 | Drag a PDF from the Desktop onto the window. | It opens. (This is the drop path, which is a different sandbox grant from the open panel.) |
| 4 | Press `3` for Edit, click a line of body text, type a word, press Escape. | The text changes on the page. |
| 5 | ⌘S. | It saves in place, with no error. Reopen the file in Preview and see the change. |
| 6 | ⌘E → Word (.docx), save to `~/Desktop`. | A `.docx` lands there and opens in Pages or Word. |
| 7 | Press `8` for Convert, convert to PDF/A. | A PDF/A file is produced. Open it and check no page carries a watermark or a "Free Tier" stamp. |
| 8 | Quit the app entirely (⌘Q) and relaunch. | The document from step 2 is in the recent list **and reopens from it** — this is the security-scoped bookmark path, the one that breaks first under the sandbox. |
| 9 | Settings → check that update controls are absent. | The App Store build has the updater compiled out; nothing should offer to check for updates. |
| 10 | Turn on reporting in Settings, send a one-line feedback note. | It sends. Then turn it back off. |
| 11 | Open a scanned PDF (no text layer). Press `8` / open the OCR tool, run OCR. | Progress appears, finishes, no error. Search (Cmd+F) for a word on the page: it is found. Select and copy a line: text comes out. |
| 12 | In Console.app filter on `sandbox` and `tesseract` while step 11 runs. | No `deny` lines for the helper. A `deny` here means the helper's signature or entitlements are wrong (`scripts/mas-entitlements.mjs --helpers`). |
| 13 | Open two PDFs; check each has its own tab; quit with an unsaved change. | Tabs show the change; the app asks before quitting. |

Any failure in steps 5, 6, 8 is a sandbox entitlement problem, not a feature bug.
Send the exact wording of the error rather than a description of it.

## What a reviewer might ask about

- **"Where is the licence screen?"** There is none. See `eula.md`.
- **"Does it need the network?"** No. See `privacy.md` for the one path that can
  use it (an optional crash or feedback report), which is off by default and
  sent only when the user presses Send.
- **"Why does it ask for file access?"** It does not, beyond the standard open and
  save panels. There is no full-disk access request and no folder prompt.
