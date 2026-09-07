<!--
Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
See https://pdfluent.com/license for terms.
-->

# English Store screenshots — blocker report (RESOLVED)

> **Historical record.** The English-screenshot blocker described here was
> resolved; PDFluent is live on the Store with the designer's set. Kept for the
> reasoning, not as a current instruction.


> **RESOLVED 2026-06-22.** The shipped v3 editor was fully internationalized
> (EditorV3Shell, ViewerApp, OrganizeGrid, Settings, reviewSummary → react-i18next,
> complete en+nl), a `noHardcodedDutch` guard test was added, a new Authenticode-signed
> Windows candidate was built (not published), and the **six English screenshots are in
> [`final/`](final)** with [`../SCREENSHOTS.md`](../SCREENSHOTS.md) (ordering + notes).
> The analysis below is kept for the record.

**Original verdict (now fixed): NOT READY.** English (en-US) Store screenshots could not be captured from
the installed beta.18 Windows candidate, because the shipped editor UI contained
**54+ hardcoded Dutch strings** that no runtime setting could change. This was a real
localization defect, not a capture problem — it also blocked any **English Store
listing** until fixed.

## What the screenshots need vs. what the build can do

The goal: force the full app UI to English, then capture six 1920×1080 scenes
(welcome, reading, inline edit, convert, all-tools, sign). Four of the six scenes
render **hardcoded Dutch** regardless of the chosen language:

| Scene | State | Why |
|---|---|---|
| 1 welcome | i18n (fixable) | welcome text is `t()`-driven |
| 2 reading | **Dutch** | page panel header `Pagina's`, breadcrumb `Mijn bestanden` are literals |
| 3 inline edit | mostly i18n | toolbar `t()`; some literals |
| 4 convert | **Dutch** | `Converteren naar DOCX`, `Afbeelding`, `Archief`, `PDF comprimeren`, `OCR draaien`, `Nederlands` |
| 5 all-tools | **Dutch** | `Kies een tool om te beginnen…`, `Pagina's`, tool tooltips |
| 6 sign | **Dutch** | `Lokaal ondertekend - niets verlaat dit apparaat`, `Handtekening toevoegen`, `Uitnodigen om te ondertekenen` |

Visual proof (neutral demo doc, no PII) is in [`evidence/`](evidence): the toolbar
tabs are English (`All tools / Edit / Convert / Sign`) while the panels below them
are Dutch — the tell-tale sign of a half-internationalized shell.

## Root cause

`src/viewer/v3/EditorV3Shell.tsx` (the shipped editor shell — `main.tsx` imports
`viewer-v3.css`) uses `react-i18next` `t()` for **some** strings (toolbar mode
labels, etc.) but hardcodes **54+ UI strings in Dutch** as JSX/attribute literals.
JSX string literals are baked into the bundle at build time; **no runtime mechanism
can change them**:

- **i18n language switch** — works, but only for `t()` strings. Proven: switching to
  `en` flips the toolbar tabs to English; the hardcoded literals stay Dutch.
- **`navigator.language`** — WebView2 derives it from the OS UI language (nl-NL on
  the build box) and **ignores** `--lang=en-US` / `--accept-lang`. So
  `detectLanguageFromEnvironment()` returns `nl`.
- **`localStorage['pdfluent-lang']='en'`** — set successfully via CDP, but this
  build's WebView2 **does not persist localStorage** across reload or restart (the
  write never reaches disk before the page re-reads it), so it has no effect either.

Representative hardcoded lines in `EditorV3Shell.tsx` (not exhaustive — 54+ total):

```
 873  data-tip / aria-label = "Pagina's"          (page panel)
1632  >Mijn bestanden<                              (breadcrumb)
1664  title="Opslaan"                               (save)
1681/1738  Delen / "Lokaal delen - niets wordt geupload"
2125  >Kies een tool om te beginnen. Alles draait lokaal op dit apparaat.<
2128  >Pagina's<                                    (all-tools section)
2315  >Converteren naar DOCX<                        (convert panel)
2339  Lokaal ondertekend - niets verlaat dit apparaat (sign panel)
```

## Remediation (required before English screenshots OR an English listing)

1. **Localize `src/viewer/v3/EditorV3Shell.tsx`**: replace the ~54 hardcoded Dutch
   literals with `t('…')` calls and add the keys to `src/i18n/locales/en.json` +
   `nl.json` (and ideally the other 25 locales). Grep starting point:
   `grep -noE "Pagina|Delen|Opslaan|Converteren naar|Lokaal onderteken|Kies een tool|Afbeelding|Archief|comprimeren|OCR draaien|Bijlage|Inhoud toevoegen" src/viewer/v3/EditorV3Shell.tsx`
2. **Rebuild** the Windows MSI (`npm run release:windows` on the build box) and
   **reinstall** it. The current candidate's English-ness cannot be patched post-build.
3. **Re-run the capture harness** below — it already forces English for the
   `t()`-driven parts and opens the doc; once the literals are localized the whole UI
   is English and all six scenes capture cleanly.

> Note: a rebuilt binary is **not** the validated beta.18 candidate, so it must be
> re-validated (`store/scripts/validate-store-candidate.sh`) before submission.

## Reusable capture harness (ready to use once localized)

In [`harness/`](harness) — driven from a Mac over SSH to the Windows build box,
captured in the interactive console session (session 1) via scheduled tasks:

- `make-demo-pdf.py` — generates the **neutral demo PDF** ([`demo/Project-Proposal.pdf`](demo/Project-Proposal.pdf)),
  a clean fictional business document with no personal/confidential content.
- `launch_doc.ps1` / `launch_port.ps1` — launch the app (with the demo PDF / with the
  WebView2 `--remote-debugging-port=9222` for CDP).
- `setlang.ps1` — **the English-forcing technique** (run with `powershell -Mta`, from
  the SSH session where the WebSocket apartment doesn't deadlock): connects to CDP,
  dispatches `Ctrl+?` to open the shortcut sheet, sets the
  `select[data-testid="language-switcher"]` to `en` and fires a React `change` event
  → calls the app's `setLanguage('en')` → `i18n.changeLanguage('en')` **live, with no
  reload** (the open document stays open). This flips all `t()` strings to English.
- `shot_doc.ps1` / `shot_welcome.ps1` / `capture_panels.ps1` — size the window to
  exactly 1920×1080 (`MoveWindow`), hide the task's console, and capture; panels are
  reached by **UI Automation by accessible name** (`Edit` / `Convert` / `All tools` /
  `Sign`).

### Gotchas learned (so the next run doesn't rediscover them)

- The shortcut sheet opens on **`Ctrl+?`** (not bare `?`) — `useKeyboardShortcuts.ts`.
- The WebSocket CDP client **deadlocks in STA** (scheduled-task PowerShell); run the
  CDP step as `powershell -Mta` from the SSH session (session 0), and do window
  sizing/capture from a scheduled task (session 1). The app process persists between
  the two.
- `localStorage` does not persist on this build; force language live via the `<select>`
  each session rather than relying on a stored preference.
- Clear `%LOCALAPPDATA%\com.pdfluent.app` for a clean welcome with no recent-files list.
