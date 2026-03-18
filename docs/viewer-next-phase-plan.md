# PDFluent v2 Viewer — Next Phase Implementation Plan

_Last updated: 2026-03-17 (revised: capability batches added, rendering architecture section added, hardening block completed)_

---

## 1. Current state summary

### Reading workflow
- Single-page canvas rendering via `PageCanvas` / `useEngine` / `useDocument`
- Page navigation: TopBar prev/next buttons, page number input, arrow keys, PageUp/Down, Home/End
- Go-to-page dialog (⌘G) with floating indicator showing current page/total
- Zoom: in/out toolbar buttons, ⌘+/⌘-/⌘0, scroll-to-zoom (⌘+wheel), zoom presets popover (click on zoom display), persistent across sessions (localStorage)
- Fullscreen: F11 / ⌘⇧F
- Mode switching: ModeSwitcher tabs + number keys 1–7 (read/review/edit/organize/forms/protect/convert)
- Left rail: thumbnail panel (scrolls to active page), bookmarks/outline panel (tree navigation), search panel (placeholder), comments panel (read-only list), fields panel (read-only list), attachments panel (placeholder) — ⌘B to toggle
- Left rail panel preference persisted to localStorage (`pdfluent.nav.panel`)
- Drag-and-drop: browser mode drops ArrayBuffer; Tauri mode has dedicated handler
- **No text layer exists yet** — pages render as raster-only canvas; text cannot be selected or copied

### Save / open / save-as / export flow
- Open: Tauri native file dialog or browser `<input type="file">`, with unsaved-changes guard
- ⌘S: save in place if path known; falls through to Save As dialog if not
- Save As (⌘⇧S): Tauri save dialog, updates `currentFilePath`, clears dirty flag, records in recent files
- Export dialog (⌘E): formats — PDF, compressed PDF, PNG, JPEG, DOCX — with page-range selector for image formats; invokes Tauri commands
- Close document: TopBar × button with unsaved-changes guard
- Unsaved-changes modal: Save / Discard / Cancel — replaces old `window.confirm()`
- `beforeunload` guard for OS-level window close

### Keyboard / navigation coverage
| Shortcut | Action |
|---|---|
| ⌘K | Command palette |
| ⌘? | Shortcut sheet |
| ⌘G | Go-to-page dialog |
| ⌘S / ⌘⇧S | Save / Save As |
| ⌘E | Export dialog |
| ⌘B | Toggle left rail |
| ⌘+/⌘-/⌘0 | Zoom in/out/reset |
| ⌘+wheel | Scroll-to-zoom |
| F11 / ⌘⇧F | Fullscreen |
| ←/→/↑/↓, PgUp/Dn, Home/End | Page navigation |
| 1–7 | Switch mode |
| Tab / Shift+Tab | Next/prev form field (forms mode only) |

### Organize mode
- `OrganizeGrid`: responsive grid of page thumbnails
- Per-page: delete, rotate (single page) via `ModeToolbar` buttons
- Multi-select: click thumbnail to toggle, select-all header button, clear selection
- Batch action bar appears on selection: "Roteer selectie", "Verwijder selectie" (guarded: cannot delete all pages)
- All operations invoke Tauri `delete_pages` / `rotate_pages` commands

### Forms / review mode capabilities
**Forms mode:**
- `LeftNavRail` fields panel: read-only list of all AcroForm fields (name, type, page)
- `ModeToolbar` field-nav block: ◀ / counter / ▶ with page-jump on navigation
- `RightContextPanel` `FormsModeContent`: clickable field list, active highlight (`bg-primary/5 ring-1 ring-primary/40`), scrollIntoView on index change
- `activeFieldIdx` state (−1 = none), reset on new document
- Tab / Shift+Tab keyboard navigation between fields
- Bidirectional sync: toolbar nav ↔ panel click both update the same `activeFieldIdx`

**Review mode:**
- `LeftNavRail` comments panel: read-only grouped list
- `ModeToolbar` comment-nav block: ◀ / counter / ▶ with page-jump on navigation
- `RightContextPanel` `ReviewModeContent`: clickable comment list grouped by page, flat-index matching, active highlight, scrollIntoView
- `activeCommentIdx` state (−1 = none), reset on new document
- Bidirectional sync: toolbar nav ↔ panel click both update the same `activeCommentIdx`
- Comments loaded as `type === 'text'` annotations, sorted by pageIndex ascending
- **Clicking a comment navigates to its page but does not highlight the annotation in the canvas** — no overlay layer exists yet

### Right panel capabilities
- `RightContextPanel` (mode-aware, 192px wide):
  - Read mode: `MetadataInfo` (title, author, page count, dimensions, form type, PDF version, creation date) + placeholder sections
  - Review mode: `ReviewModeContent` — interactive, synced comment list
  - Forms mode: `FormsModeContent` — interactive, synced field list
  - Protect mode: `EncryptDecryptControls` (encrypt with user/owner password, decrypt) + `PermissionsDisplay`
  - Other modes: placeholder `CollapsibleSection` items
- Collapsible sections with localStorage-agnostic state (open by default)

### Command palette / recent files / persistent UI state
- Command palette (⌘K): fuzzy-search over all registered commands, recent command history (top 5, persisted to localStorage), `close-document` / `save-as` / `export` entries
- Recent files: `useRecentFiles` hook, localStorage key `pdfluent.recentFiles`, used in command palette "open recent" entries
- Persistent state keys: `pdfluent.viewer.zoom`, `pdfluent.viewer.rail`, `pdfluent.nav.panel`, `pdfluent.viewer.commands.recent`, `pdfluent.viewer.pages` (per-path page position, capped at 50 entries)
- Document dirty indicator: orange dot in tab when unsaved, green when clean

### Known constraints
- All Tauri-dependent features (save, export, encrypt, delete/rotate pages) are guarded by `isTauri` — they render disabled in browser/dev mode
- Search panel: placeholder only — needs backend text-extraction API
- No rendering overlay layer exists — annotation highlights, text selection rectangles, and search highlights all need this layer first
- No text layer exists — pages are raster-only; text cannot be selected, highlighted, or copied
- Undo/Redo: disabled buttons present — needs engine-level edit history
- Share / Delen: disabled button — not yet designed
- Page thumbnail windowing in sidebar: not yet implemented for very large documents
- Drag-to-reorder pages: not implemented — needs new Rust command (`reorder_pages`)
- In Organize mode, only delete+rotate are wired; extract/split require new Rust commands

### Completed implementation blocks (as of 2026-03-17)

**REAL_TEXT_EDIT_VERIFICATION_AND_EXPANSION_BLOCK (10 batches):**
- Full text mutation pipeline in `src/viewer/text/`
- `validateReplacement` with equal-or-shorter + bbox-aware `expansionChars`
- `computeBboxExpansionChars` using `ESTIMATED_CHAR_WIDTH_RATIO = 0.55`
- `FontEncodingClass` (7 values) + Dutch messaging via `getFontEncodingMessage`
- Edit telemetry ring buffer (`MAX_EVENTS = 500`), test hook `window.__pdfluent_test__.editTelemetry`

**OBJECT_AND_LAYOUT_EDITING_EXCELLENCE_BLOCK (10 batches):**
- `objectDetection.ts`: classify + detect all 5 raw types, `IDENTITY_MATRIX`
- `objectMoveEngine.ts`: `computeMove` (4 outcomes), `beginMoveSession`, `updateMoveSession`
- `objectResizeEngine.ts`: `computeResize`, `MIN_OBJECT_SIZE = 10`, 8 handles
- `imageReplacePipeline.ts`: validate, prepare, 4 scale strategies, MIME guard
- `layoutAlignmentGuides.ts`: `buildAllGuides`, `computeActiveGuides`, `SNAP_THRESHOLD = 6`
- `layoutLayerModel.ts`: z-order, OCG visibility/lock, paint-order queries
- `layoutCollisionValidator.ts`: 6 collision codes, locked-layer short-circuit
- `ObjectSelectionOverlay.tsx`: 8 resize handles, `pdfRectToDom`, Dutch type labels

**ACROBAT_CLASS_RELIABILITY_AND_UX_HARDENING_BLOCK (10 batches):**
- `tests/workflows/workflowCorpus.ts`: 6 real workflows, 4 release-gating
- `src/viewer/integrity/documentIntegrityValidator.ts`: pre-flight structural validation
- `src/viewer/state/editStateValidator.ts`: 7 EditorModes, typed transition table
- `src/viewer/state/errorCenter.ts`: hardened with query helpers, deduplication, capacity guard
- `src/viewer/components/BusyStateOverlay.tsx`: progress, cancel, severity styling
- `tests/performance/large-document-stress.test.ts`: 500-page / 500-object stress suite
- `src/viewer/modes/modeConsistencyValidator.ts`: toolbar/overlay/mode mutual consistency
- `src/viewer/native/nativeFileOperations.ts`: path guards for open/save/export
- `src/viewer/performance/performanceTelemetry.ts`: p50/p95/p99, budget monitor, timers
- `tests/release/releaseAcceptanceMatrix.ts`: 25 criteria across 13 areas, version-controlled release gate

**Test totals (2026-03-17):** 317 files | 6345/6350 passing | 5 pre-existing failures (unchanged)

### Pre-existing unrelated test failures (5)
These are not regressions from any viewer work:
1. `tests/ocr-paddle-bridge.test.ts` — tests OCR bridge source that does not exist yet
2. `tests/toolbar-advanced-tools-menu.test.ts` — tests a toolbar source that differs from current component
3. `tests/toolbar-recent-files.test.ts` — tests a separate toolbar component not in the current viewer
4. `tests/viewer-continuous-windowing.test.ts` — tests windowed rendering not yet implemented
5. `tests/xfa-warning-parity.test.ts` — tests Rust source strings, Rust side changed independently

---

## 2. Capability map

### Reading / navigation
| Area | Status |
|---|---|
| Single-page canvas render | ✅ Done |
| Page navigation (keyboard + UI) | ✅ Done |
| Zoom (keyboard + scroll + presets) | ✅ Done |
| Thumbnail sidebar with active-page sync | ✅ Done |
| Bookmarks / outline navigation | ✅ Done |
| Go-to-page dialog | ✅ Done |
| Fullscreen | ✅ Done |
| Floating page indicator | ✅ Done |
| Full-text search | ❌ Missing — blocked by backend text-extraction API |
| Continuous/scroll rendering | ❌ Missing — frontend work, large scope |
| Fit-width / fit-page zoom modes | ❌ Missing — frontend only, no Rust needed |
| Page rotation display (visual) | ❌ Missing — needs engine support for rotated render |

### Text interaction
| Area | Status |
|---|---|
| Text layer rendering (positioned HTML over canvas) | ❌ Missing — frontend; depends on engine text extraction API |
| Mouse drag text selection | ❌ Missing — frontend, requires text layer |
| Selection highlight rectangles | ❌ Missing — frontend overlay layer |
| Copy selected text to clipboard (⌘C) | ❌ Missing — frontend, requires text layer |
| Search highlight rendering | ❌ Missing — frontend overlay; text extraction API required |
| Find-in-document (⌘F) | ❌ Missing — requires search backend + highlight overlay |

### Document workflow
| Area | Status |
|---|---|
| Open (Tauri dialog + browser input + drag-drop) | ✅ Done |
| Save in place (⌘S) | ✅ Done |
| Save As (⌘⇧S) | ✅ Done |
| Close with unsaved-changes guard | ✅ Done |
| Recent files (persistent) | ✅ Done |
| Page position memory per file | ✅ Done |
| Dirty indicator (orange dot) | ✅ Done |
| OS-level close guard (beforeunload) | ✅ Done |
| Welcome / empty state screen | ❌ Missing — frontend only |
| Print (⌘P) | ❌ Missing — `window.print()` or Tauri print; no Rust needed for basic version |
| Document properties editor | ❌ Missing — needs engine write API |
| Multiple open documents / tabs | ❌ Missing — large architectural scope, defer |

### Organize workflow
| Area | Status |
|---|---|
| Page thumbnail grid | ✅ Done |
| Multi-select (click + select-all) | ✅ Done |
| Batch delete selected pages | ✅ Done |
| Batch rotate selected pages | ✅ Done |
| Per-page delete via toolbar | ✅ Done |
| Per-page rotate via toolbar | ✅ Done |
| Keyboard shortcuts for delete/rotate (Del/R) | ❌ Missing — frontend only |
| Drag-to-reorder pages | ❌ Missing — needs new Rust `reorder_pages` command |
| Extract selected pages to new file | ❌ Missing — needs new Rust command |
| Insert pages from another PDF | ❌ Missing — needs new Rust command |
| Range selection (Shift+click) | ❌ Missing — frontend only |
| Page numbering display on tiles | ✅ Done (number shown below thumbnail) |

### Review workflow
| Area | Status |
|---|---|
| Load text annotations as comments | ✅ Done |
| Comment list in left rail | ✅ Done (read-only) |
| Toolbar ◀▶ comment navigation with page-jump | ✅ Done |
| Right panel interactive comment list with highlight + scroll | ✅ Done |
| Bidirectional sync (toolbar ↔ panel) | ✅ Done |
| Annotation highlight overlay in canvas (click → highlight rect) | ❌ Missing — frontend overlay layer; needs Annotation.rect coordinates |
| Add new comment / annotation | ❌ Missing — needs annotation write API |
| Resolve / mark comment as done | ❌ Missing — needs annotation write API |
| Reply to comment | ❌ Missing — needs annotation write API + data model |
| Filter comments (by author, page, status) | ❌ Missing — frontend only once data is loaded |
| Comment search | ❌ Missing — frontend only once data is loaded |

### Forms workflow
| Area | Status |
|---|---|
| Load AcroForm fields | ✅ Done |
| Field list in left rail | ✅ Done (read-only) |
| Toolbar ◀▶ field navigation with page-jump | ✅ Done |
| Right panel interactive field list with highlight + scroll | ✅ Done |
| Bidirectional sync (toolbar ↔ panel) | ✅ Done |
| Tab / Shift+Tab keyboard field navigation | ✅ Done |
| Fill form field values (interactive form filling) | ❌ Missing — needs form write API |
| Validate required fields | ❌ Missing — needs form API |
| Clear / reset form | ❌ Missing — needs form API |
| Import / export form data (FDF/XML) | ❌ Missing — needs new Rust commands |
| Highlight required fields visually | ❌ Missing — frontend only once data model exposes `required` flag |

### Export / save workflow
| Area | Status |
|---|---|
| Save in place + Save As | ✅ Done |
| Export dialog (PDF, compressed PDF, PNG, JPEG, DOCX) | ✅ Done |
| Page range selector for image exports | ✅ Done |
| Export keyboard shortcut (⌘E) | ✅ Done |
| Export progress in task bar | ✅ Done |
| Print | ❌ Missing — `window.print()` / Tauri print; no Rust needed |
| PDF/A export | ❌ Missing — needs Rust compliance pipeline |
| Watermark export option | ❌ Missing — needs Rust `pdf-manip` |
| Merge PDFs (import + combine) | ❌ Missing — needs new Rust command |
| Split to multiple files | ❌ Missing — needs new Rust command |

### Session / startup workflow
| Area | Status |
|---|---|
| Last zoom restored | ✅ Done |
| Left rail visibility restored | ✅ Done |
| Left rail panel preference restored | ✅ Done |
| Per-file page position restored | ✅ Done |
| Recent command history in palette | ✅ Done |
| Welcome / empty state screen | ❌ Missing — frontend only |
| Recent files shown at startup | ❌ Missing (recent files exist but no welcome screen to display them) |
| App settings / preferences panel | ❌ Missing — frontend architecture + localStorage |
| Native OS file association (open PDF in app from Finder) | ❌ Depends on Tauri capability config |

### Editor / advanced PDF tooling
| Area | Status |
|---|---|
| Protect mode: encrypt / decrypt | ✅ Done (Tauri) |
| Protect mode: permissions display | ✅ Done |
| Edit mode | ❌ Placeholder only — needs engine write API |
| Convert mode | ❌ Placeholder only — needs backend conversion pipelines |
| Redaction | ❌ Needs `pdf-redact` crate |
| Digital signatures | ❌ Needs `pdf-sign` crate |
| Watermarks | ❌ Needs `pdf-manip` crate |
| OCR | ❌ Needs `pdf-ocr` crate |

### Text mutation (edit mode foundation)
| Area | Status |
|---|---|
| `validateReplacement` with equal-or-shorter constraint | ✅ Done |
| `computeBboxExpansionChars` (bbox-aware expansion) | ✅ Done |
| `FontEncodingClass` (7 classes) + messaging | ✅ Done |
| Edit telemetry ring buffer | ✅ Done |
| Backend rejection messaging (Dutch) | ✅ Done |

### Object & layout editing
| Area | Status |
|---|---|
| Layout object detection (5 types) | ✅ Done |
| Move engine (4 outcomes, page clamp) | ✅ Done |
| Resize engine (8 handles, MIN_OBJECT_SIZE) | ✅ Done |
| Image replace pipeline (4 scale strategies) | ✅ Done |
| Alignment guides (SNAP_THRESHOLD = 6) | ✅ Done |
| Layer model (z-order, OCG) | ✅ Done |
| Collision validator (6 codes) | ✅ Done |
| ObjectSelectionOverlay component | ✅ Done |

### Reliability & hardening
| Area | Status |
|---|---|
| Document integrity validator | ✅ Done |
| Edit state machine validator | ✅ Done |
| Error center (hardened + query helpers) | ✅ Done |
| BusyStateOverlay component | ✅ Done |
| Mode consistency validator | ✅ Done |
| Native file operation path guards | ✅ Done |
| Performance telemetry (p50/p95/p99) | ✅ Done |
| Workflow corpus (6 workflows) | ✅ Done |
| Release acceptance matrix (25 criteria) | ✅ Done |
| Large-document stress suite | ✅ Done |

---

## 3. Recommended next-phase batches

### Batch 1 — Welcome screen + startup workflow

**Why it matters now:** Every user hits this on every launch. Currently the app shows an inert empty shell with "No document open" in the tab bar. A proper welcome screen with recent files makes the app feel complete and removes the most visible rough edge before any new capabilities land.

**User value:** Users can re-open recent files in 1 click from the welcome screen. New users understand immediately what to do. The app has a real startup moment instead of a blank frame.

**Scope:**
- New `WelcomeScreen.tsx` component: centered layout, app wordmark, "PDF openen…" primary button, scrollable recent files list (path + filename, click-to-open via `handleLoadDocument`)
- Empty recent files state: "Nog geen bestanden geopend."
- `ViewerApp.tsx`: render `<WelcomeScreen>` instead of the viewer shell when `!pdfDoc && !docLoading`
- No drag-and-drop on welcome screen (Tauri event complexity — defer to a later iteration)

**Files:** `src/viewer/components/WelcomeScreen.tsx` (new), `src/viewer/ViewerApp.tsx`, `tests/viewer-welcome-screen.test.ts` (new)

**Rust required:** No
**Engine interface required:** No
**Risk:** Low
**Size:** Medium (~100 lines new component + wiring)
**Order:** First

---

### Batch 2 — Text selection and copy workflow

**Why it matters now:** A PDF viewer where you cannot select and copy text feels broken to any user who encounters it. This is the most fundamental missing capability in the current viewer — it makes the app feel like a raster image viewer, not a PDF viewer. Every read-mode user is affected on every document.

**User value:** Select text in a PDF, press ⌘C, paste into any other application. The minimum viable capability any user expects from a PDF viewer.

**Scope:**
- **Text layer rendering:** render per-page text spans as absolutely positioned, transparent HTML elements over `PageCanvas`. Each span: `position: absolute`, `user-select: text`, coordinates derived from the engine text extraction API. The layer sits in the stacking order above the canvas but below any overlays.
- **Selection:** native browser text selection within the text layer spans (via CSS `user-select: text`). No custom mouse-drag implementation required for basic selection.
- **Copy:** `⌘C` / `Ctrl+C` writes the browser's current selection (`window.getSelection()?.toString()`) to `navigator.clipboard.writeText()`. Scoped to when a text selection exists.
- **Page change clears selection:** `useEffect` on `pageIndex` calls `window.getSelection()?.removeAllRanges()`.
- **Architecture:** `TextLayer` component wraps `PageCanvas`, receives `textSpans: TextSpan[]`, renders spans. `ViewerApp` fetches text spans from engine when a page is displayed and passes them down.

**Engine dependency:** Requires `engine.text.extractPage(pdfDoc, pageIndex)` returning positioned text spans with `{ text: string; rect: { x: number; y: number; width: number; height: number } }`. Verify this exists in `src/core/document.ts` and the engine API before starting. If it does not exist, this batch requires engine interface work (adding a `text` namespace to the engine) — that should be treated as a prerequisite and tracked separately.

**Files:** `src/viewer/components/TextLayer.tsx` (new), `src/viewer/components/PageCanvas.tsx` (wrap with TextLayer), `src/viewer/ViewerApp.tsx` (fetch text spans, pass down), `tests/viewer-text-selection.test.ts` (new)

**Rust required:** No (if engine already exposes per-page text extraction) / Yes — engine interface only, no new Rust commands (if text API needs to be added to the engine wrapper)
**Engine interface required:** Check `engine.text` namespace first
**Risk:** Medium — coordinate transform from PDF space (points, bottom-left origin) to canvas pixels (top-left origin, scaled by zoom) must be correct
**Size:** Large (~150 lines across 2–3 files + tests)
**Order:** Second

---

### Batch 3 — Annotation highlight overlay

**Why it matters now:** Review mode has full navigation, panel sync, and bidirectional selection — but clicking a comment navigates to the page without any visual indication of where the annotation lives on that page. This makes review mode feel incomplete: users must scan the page manually to find the comment they clicked. The overlay layer also becomes the foundation for search highlights and future form field overlays.

**User value:** Click a comment in the panel or press ▶ in the toolbar → the relevant annotation lights up on the page with a highlight rectangle. Users immediately see what they are reviewing. This is how every PDF review tool (Acrobat, Preview, Foxit) works.

**Scope:**
- **Overlay layer:** a new `AnnotationOverlay` component renders absolutely positioned highlight rectangles over `PageCanvas`. Uses the same coordinate transform as the text layer (PDF points → canvas pixels, accounting for zoom and page height for Y-axis flip).
- **Active annotation highlight:** when `activeCommentIdx >= 0`, draw a semi-transparent yellow/amber rectangle at `comments[activeCommentIdx].rect` (if the `Annotation` type exposes `rect`). Highlight fades or clears when `activeCommentIdx` resets to −1.
- **All annotation markers:** optionally render subtle, lower-opacity markers for all comments on the current page (small colored dot or border), not just the active one. This is secondary scope — implement after active highlight works.
- **Coordinate transform:** `canvasX = rect.x * zoom`, `canvasY = (pageHeightPt - rect.y - rect.height) * zoom`. Page height in points is available from `pdfDoc.pages[pageIndex].size.height`.
- **Stacking order:** overlay sits above canvas, below text layer (annotation rects should not block text selection).
- **Integration:** `ViewerApp` passes `activeCommentIdx` and `comments` (filtered to `pageIndex === currentPage`) to the overlay.

**Engine dependency:** Requires `Annotation.rect` to be available on the annotation object. Verify in `src/core/document.ts`. If `rect` is missing, check if `Annotation` has a `boundingBox` or similar field. No new Rust commands needed — this is a rendering concern only.

**Files:** `src/viewer/components/AnnotationOverlay.tsx` (new), `src/viewer/components/PageCanvas.tsx` (integrate overlay), `src/viewer/ViewerApp.tsx` (pass props), `tests/viewer-annotation-overlay.test.ts` (new)

**Rust required:** No
**Engine interface required:** Only if `Annotation.rect` is missing from the type — check `src/core/document.ts`
**Risk:** Low–Medium — coordinate transform correctness is the main risk; overlay stacking order is straightforward
**Size:** Medium (~100 lines)
**Order:** Third

---

### Batch 4 — Organize mode keyboard shortcuts + range selection

**Why it matters now:** Organize mode has a working grid, multi-select, and batch actions — but all interaction is click-only. Power users expect keyboard shortcuts (Delete to delete, R to rotate) and Shift+click range selection. Without them, selecting 20 pages requires 20 individual clicks.

**User value:** Select 20 pages, Shift+click for range, press Delete — done in 3 actions instead of 22.

**Scope:**
- `OrganizeGrid.tsx`: Shift+click on a tile extends selection from last-selected index to clicked index (track `lastSelectedIdx` ref, fill the range into `selectedPages`)
- `OrganizeGrid.tsx` or `ViewerApp.tsx`: `useEffect` keydown handler scoped to `mode === 'organize'`:
  - `Delete` / `Backspace` → call `handleBatchDelete()` if selection non-empty
  - `r` / `R` → call `handleBatchRotate()` if selection non-empty
  - `Escape` → clear selection
  - `⌘A` / `Ctrl+A` → select all
- Guard: only when `mode === 'organize'`, target not in INPUT/TEXTAREA

**Files:** `src/viewer/components/OrganizeGrid.tsx`, `src/viewer/ViewerApp.tsx`, `tests/viewer-organize-keyboard.test.ts` (new)

**Rust required:** No
**Engine interface required:** No
**Risk:** Low
**Size:** Medium (~60 lines)
**Order:** Fourth

---

### Batch 5 — Review mode: comment filtering

**Why it matters now:** Comments are loaded and navigable, but there's no way to filter them. On a document with 50+ comments across multiple authors and pages, the panel list is unusable without filtering. All comment data is already in memory — this is pure frontend work on top of the completed navigation cluster.

**User value:** Reviewers can filter by author or search comment text. The review workflow becomes practical for real multi-author document review.

**Scope:**
- `RightContextPanel` `ReviewModeContent`: add a filter bar above the list:
  - Text input: filters by `comment.contents` (case-insensitive substring match) and `comment.author`
  - Author dropdown: unique authors extracted from `comments` array, "Alle auteurs" default
  - Filter state is local to the component (`useState`) — do NOT lift to ViewerApp
  - The toolbar nav always operates on the full unfiltered list; the panel filter is a panel-local view
- Comment count in panel header shows filtered count when filter is active: "3 van 12 opmerkingen"
- When filter changes and `activeCommentIdx` no longer matches a visible item, reset via `onCommentSelect(-1)`

**Files:** `src/viewer/components/RightContextPanel.tsx`, `tests/viewer-review-filter.test.ts` (new)

**Rust required:** No
**Engine interface required:** No
**Risk:** Low–Medium (flat index mapping changes when filtering — reset activeCommentIdx on filter change)
**Size:** Medium (~80 lines)
**Order:** Fifth

---

### Batch 6 — Forms mode: field status indicators

**Why it matters now:** The forms workflow is navigation-complete but the panel still shows a static list with minimal information. Users filling out forms need to know which fields are required, which have values, and what type each field is.

**User value:** Users can scan the field list and see completion status. Required fields are clearly marked. The panel becomes an actionable form-filling assistant, not just a directory.

**Scope:**
- `RightContextPanel` `FormsModeContent`: add visual indicators per field:
  - Required indicator: if `field.required === true`, show a `*` or red badge
  - Field type icon: small icon or badge per `field.type` (checkbox, text, signature, etc.)
  - Field value hint: if `field.value` is non-empty, show a green "ingevuld" dot; if empty and required, show "verplicht" in amber
- Status summary bar at top: "X van Y verplichte velden ingevuld" (computed from `formFields`)
- **Pre-condition:** verify that `FormField` in `src/core/document.ts` exposes `required: boolean` and `value: string | boolean | null`. If these fields are missing, the batch reduces to type indicators only (still worthwhile).

**Files:** `src/viewer/components/RightContextPanel.tsx`, `tests/viewer-forms-field-status.test.ts` (new)

**Rust required:** No (if `required` and `value` are already in `FormField` type)
**Engine interface required:** Only if `FormField` type needs extension — check `src/core/document.ts` first
**Risk:** Low
**Size:** Small–Medium (~60 lines)
**Order:** Sixth

---

### Batch 7 — Print support (⌘P)

**Why it matters now:** Print is a baseline user expectation for any PDF viewer. The export dialog covers file-based outputs, but printing to paper is a separate workflow. Option A (CSS media print) requires no Rust.

**User value:** Users can print without exporting to a file first.

**Scope:**
- Option A (recommended): add `data-print-region` wrapper around `PageCanvas`. Add `@media print` CSS to hide all chrome (TopBar, rail, toolbar, panels), show only the canvas. Add ⌘P keydown handler. Add command palette entry "Afdrukken".
- Option B (deferred): render all pages off-screen and print all — expensive for large documents, defer.

**Files:** `src/viewer/ViewerApp.tsx` (⌘P handler), global CSS (`@media print` rules), `tests/viewer-print.test.ts` (new)

**Rust required:** No
**Engine interface required:** No
**Risk:** Low (Option A)
**Size:** Small (~30 lines + CSS)
**Order:** Seventh (can slot in at any pause)

---

## 4. Batch-by-batch issue grouping

### Already-implemented slices that form a partial batch

**Forms navigation cluster (complete):**
- ✅ Forms field list in left rail (read-only)
- ✅ Toolbar ◀▶ field nav with page-jump
- ✅ Right panel interactive field list with highlight + scroll
- ✅ Bidirectional sync toolbar ↔ panel
- ✅ Tab / Shift+Tab keyboard navigation
- ➡ **Batch 6** extends this with field status indicators

**Review navigation cluster (complete):**
- ✅ Comment list in left rail (read-only)
- ✅ Toolbar ◀▶ comment nav with page-jump
- ✅ Right panel interactive comment list with highlight + scroll
- ✅ Bidirectional sync toolbar ↔ panel
- ➡ **Batch 3** adds canvas annotation highlight (capability)
- ➡ **Batch 5** adds panel comment filtering (UX)

**Organize mode cluster (partial):**
- ✅ Thumbnail grid
- ✅ Multi-select (click)
- ✅ Batch delete + batch rotate
- ❌ Range selection (Shift+click) — Batch 4
- ❌ Keyboard shortcuts (Delete/R/Escape/⌘A) — Batch 4

**Save/export cluster (complete):**
- ✅ Save, Save As, Export dialog
- ✅ Unsaved-changes guard
- ✅ Recent files
- ➡ **Batch 7** adds print as the last missing workflow output

**Session/startup cluster (partial):**
- ✅ Zoom, rail, panel, page position, command history persistence
- ❌ Welcome screen — Batch 1

**Rendering capability cluster (new — none done yet):**
- ❌ Text layer (Batch 2)
- ❌ Annotation highlight overlay (Batch 3)
- ❌ Search highlight overlay (future, depends on text layer + Batch 2 infrastructure)
- ❌ Form field overlay (future, depends on annotation overlay infrastructure)

### Items that should NOT be split into tiny tickets anymore
- Text layer + text selection + ⌘C copy → one batch (Batch 2)
- Annotation overlay + active highlight + page-filtered markers → one batch (Batch 3)
- Organize keyboard shortcuts + range selection → one batch (Batch 4)
- Review filter (author dropdown + text search + count update) → one batch (Batch 5)
- Forms field status (required flag + value indicator + status bar) → one batch (Batch 6)
- Print (⌘P handler + CSS) → one slice (Batch 7)

### Items that require a larger architectural discussion before splitting
- Continuous/scroll rendering — large scope, own planning session
- Annotation write (add/resolve comments) — needs annotation API design
- Form filling (write field values) — needs form write API
- Multiple document tabs — architectural scope, defer

---

## 5. Proposed execution order

**1. Batch 1 — Welcome screen + startup workflow**
Do this first: it affects every user on every launch, it's pure frontend, and it's self-contained. Completing it closes the "startup workflow" chapter before we shift to capability work.

**2. Batch 2 — Text selection and copy**
This is the highest-value capability gap in the current viewer. A read-mode PDF viewer that cannot copy text is not a functional product for most use cases. The text layer infrastructure built here is also the foundation for search highlights. Start with verifying the engine text extraction API — if it exists, implement immediately; if not, track the engine interface work as a prerequisite.

**3. Batch 3 — Annotation highlight overlay**
Completes the review workflow. The overlay architecture introduced here also enables form field overlays and search highlights in later phases. Review mode goes from "navigable list" to "real review tool" with this batch.

**4. Batch 4 — Organize keyboard shortcuts + range selection**
Organize mode has all the hard work done. This closes it to professional-grade usability with minimal implementation effort (~60 lines).

**5. Batch 5 — Review comment filtering**
Review mode has full navigation and a highlight overlay after Batch 3. Filtering is the last piece that makes it practical for documents with many comments.

**6. Batch 6 — Forms mode field status indicators**
Forms navigation is complete. Field status extends the panel without touching navigation logic. Low risk, verify `FormField` type first.

**7. Batch 7 — Print (⌘P)**
Print is a baseline expectation but not urgent — the export dialog partially fills the gap. Implement Option A (CSS media print) at any natural pause between the above batches.

**Rationale for this order:**
Batch 1 closes startup. Batches 2–3 are capability jumps that make the app meaningfully more complete — they add functionality that did not exist at all. Batches 4–5 close organize and review. Batches 6–7 are refinements that can happen in parallel or at any natural pause.

---

## 6. What can be implemented immediately without more discussion

All of the following fit the current architecture, need no Rust changes, and (subject to one engine API check) need no engine interface changes:

| Item | Files | Notes |
|---|---|---|
| Welcome screen with recent files | `WelcomeScreen.tsx` (new), `ViewerApp.tsx` | Render when `!pdfDoc && !docLoading` |
| Text layer rendering | `TextLayer.tsx` (new), `PageCanvas.tsx` | Verify `engine.text.extractPage()` exists first |
| Text selection + ⌘C copy | `ViewerApp.tsx`, `TextLayer.tsx` | `window.getSelection()` + `navigator.clipboard` |
| Annotation highlight overlay | `AnnotationOverlay.tsx` (new), `PageCanvas.tsx` | Verify `Annotation.rect` exists in `core/document.ts` |
| Organize: range selection (Shift+click) | `OrganizeGrid.tsx` | Track `lastSelectedIdx`, fill range on Shift+click |
| Organize: keyboard shortcuts (Del/R/Esc/⌘A) | `OrganizeGrid.tsx` or `ViewerApp.tsx` | Scoped `useEffect`, gated on `mode === 'organize'` |
| Review: comment filter bar (text + author) | `RightContextPanel.tsx` | Local state, no prop changes to ViewerApp |
| Forms: field type icons in panel | `RightContextPanel.tsx` | Extend existing `FormsModeContent` |
| Forms: required/value indicators | `RightContextPanel.tsx` | Verify `FormField.required` and `FormField.value` exist first |
| Print (⌘P, Option A) | `ViewerApp.tsx`, CSS | `window.print()` + `@media print` CSS |

---

## 7. What should explicitly be deferred

| Item | Reason |
|---|---|
| Full-text search (find in document) | Needs backend text-extraction API (`pdf-extract` crate) — frontend overlay exists after Batch 2, but search index requires backend |
| Annotation write (add/edit/resolve comments) | Needs annotation write API — `pdf-annot` crate, new Tauri commands |
| Form filling (write field values) | Needs form write API — `pdf-forms` crate, new Tauri commands |
| Drag-to-reorder pages | Needs new Rust `reorder_pages` command — do not implement drag UI until Rust side exists |
| Extract / split pages to file | Needs new Rust `split_pdf` / `extract_pages` command |
| Insert pages from another PDF | Needs new Rust `merge_pdf` command |
| Multiple open documents / tabs | Architectural scope — requires full state management redesign |
| Undo / Redo | Needs engine-level edit history — not exposed by current API |
| OCR | `pdf-ocr` crate — separate milestone |
| Digital signatures | `pdf-sign` crate — separate milestone |
| Redaction | `pdf-redact` crate — separate milestone |
| Watermarks | `pdf-manip` crate — separate milestone |
| Continuous scroll rendering | Large frontend scope, own planning session |
| Attachments panel | Panel tab exists but needs `pdf-extract` crate for attachment enumeration |
| Layers panel | Panel tab exists but needs engine API |
| Share / collaboration | Not designed yet |
| Edit mode | No write API for general content editing |
| Convert mode | Backend conversion pipelines not ready |
| Page rotation display | Needs engine support for rendering at non-zero rotation |
| PDF/A / PDF/X export | Needs `pdf-compliance` crate pipeline |
| Enterprise / licensing UI | Separate milestone (`xfa-license` crate) |
| Drag-and-drop on welcome screen | Tauri file-drop event system has integration complexity — defer to after welcome screen ships |

---

## 8. Rendering architecture assumptions

This section describes the layered rendering model that the viewer uses and should use. Understanding this is required before implementing text selection (Batch 2), annotation overlays (Batch 3), or search highlights.

### Current state (single layer)

```
┌──────────────────────────────────────────────┐
│  PageCanvas (rasterized PDF page)            │  ← only layer today
│  <canvas> element, sized to page × zoom      │
└──────────────────────────────────────────────┘
```

Today the viewer renders one `<canvas>` element per visible page. All content — text, images, graphics — is rasterized. There is no way to select text, click annotations, or overlay highlights.

### Target state (four layers)

The viewer should evolve to a stacked layer model. All layers share the same absolute position and dimensions (`width × height` at the current zoom):

```
┌──────────────────────────────────────────────┐  z-index: 30
│  Interaction layer                           │  ← mouse events for custom tools
│  Transparent <div>, pointer-events: all      │    (future: annotation drawing, crop)
├──────────────────────────────────────────────┤  z-index: 20
│  Text layer                                  │  ← Batch 2
│  Transparent <div>, user-select: text        │    positioned <span> per word/glyph
│  pointer-events: auto, background: none      │    enables native browser selection
├──────────────────────────────────────────────┤  z-index: 10
│  Overlay layer                               │  ← Batch 3 (annotations, highlights)
│  <svg> or <div>, pointer-events: none        │    search highlights, field overlays
│  background: transparent                     │    does not block text selection
├──────────────────────────────────────────────┤  z-index: 0
│  Canvas layer                                │  ← exists today
│  <canvas>, rasterized page content           │
└──────────────────────────────────────────────┘
```

### Coordinate transform

PDF coordinate space has its origin at the **bottom-left** of the page, with Y increasing upward. Canvas/DOM coordinate space has its origin at the **top-left**, with Y increasing downward. The transform from PDF points to DOM pixels is:

```
domX = pdfX × zoom
domY = (pageHeightPt - pdfY - elementHeightPt) × zoom
```

Where `pageHeightPt` is `pdfDoc.pages[pageIndex].size.height` (in PDF points). `zoom` is the current zoom factor. Device pixel ratio (`window.devicePixelRatio`) applies to the `<canvas>` backing store but NOT to the overlay/text layers — those are sized in CSS pixels and the browser handles scaling.

### Implementation approach

- **Canvas layer:** already exists as `PageCanvas`. No changes needed.
- **Overlay layer (`AnnotationOverlay`):** an `<svg>` with `position: absolute; inset: 0; pointer-events: none; overflow: visible`. Receives `highlights: HighlightRect[]`, renders `<rect>` elements. Used for: annotation highlights (Batch 3), search highlights (future), form field overlays (future).
- **Text layer (`TextLayer`):** a `<div>` with `position: absolute; inset: 0; user-select: text; pointer-events: auto`. Receives `spans: TextSpan[]`, renders `<span style={{ position: 'absolute', left, top, width, height, fontSize, ... }}>` per word. Glyphs are transparent — text is invisible but selectable. Used for: copy (Batch 2), future text search.
- **Interaction layer:** deferred until annotation drawing or cropping tools are needed.
- **Container:** `PageCanvas` (or a new `PageView` wrapper) becomes a `position: relative` container that stacks all layers using `position: absolute; inset: 0` on each child.

### What each upcoming batch adds to the stack

| Batch | Layer added | Component |
|---|---|---|
| Batch 2 — Text selection | Text layer | `TextLayer.tsx` |
| Batch 3 — Annotation overlay | Overlay layer | `AnnotationOverlay.tsx` |
| Future: search highlights | Overlay layer (same as Batch 3) | extend `AnnotationOverlay.tsx` |
| Future: form field overlays | Overlay layer (same as Batch 3) | extend `AnnotationOverlay.tsx` |
| Future: annotation drawing | Interaction layer | new component |
