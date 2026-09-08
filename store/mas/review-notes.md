<!--
Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
See https://pdfluent.com/license for terms.
-->

# Review notes and the TestFlight smoke

## Notes for App Review (paste into "Notes" on the submission)

> PDFluent is an offline PDF editor. No account, no sign-in, no in-app purchase
> and no licence key: every feature is available immediately, to everyone,
> including for commercial use.
>
> No demo account is needed. To exercise the app, open any PDF (File → Open, or
> drag one onto the window). Editing, converting, page operations, redaction,
> watermarking, OCR and signing all run locally on the reviewer's machine; the
> app makes no network request to perform any of them.
>
> The app is sandboxed. It reads and writes only files the reviewer picks through
> the standard open and save panels, and it remembers recent files with
> security-scoped bookmarks so they reopen after a relaunch.
>
> Optional crash and feedback reporting is off by default and lives in Settings.
> Turning it on and pressing send is the only thing that transmits anything, and
> it never includes a document.

## TestFlight smoke — do this on the uploaded build before Submit

Ten minutes, on a Mac that is **not** the build machine if one is available. The
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

Any failure in steps 5, 6, 8 is a sandbox entitlement problem, not a feature bug.
Send the exact wording of the error rather than a description of it.

## What a reviewer might ask about

- **"Where is the licence screen?"** There is none. See `eula.md`.
- **"Does it need the network?"** No. See `privacy.md` for the two paths that can
  use it, both optional and both off the document path.
- **"Why does it ask for file access?"** It does not, beyond the standard open and
  save panels. There is no full-disk access request and no folder prompt.
