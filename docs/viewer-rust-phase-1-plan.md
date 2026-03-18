# PDFluent v2 Viewer — Rust Phase 1 Capability Plan

_Last updated: 2026-03-15_

---

## Executive summary

Three capabilities block the next major product jump. Two require new Rust commands; one requires only a TypeScript bridge fix against an already-implemented Rust command. All three are in Phase 1 because they can be completed without new crates and without redesigning existing architecture.

| Capability | Rust work | TS bridge work | Frontend waiting |
|---|---|---|---|
| Page reorder | ✅ **Already done** | ❌ Bridge missing | OrganizeGrid drag UI |
| Annotation loading with rect | ❌ New command needed | ❌ Bridge missing | AnnotationOverlay, review mode |
| Positioned text extraction | ❌ New command needed | ❌ Bridge missing | TextLayer, search |

**Recommended order: page reorder first (free unlock), annotation loading second, text spans third.**

---

## 1. Current frontend features waiting on backend

### 1.1 TextLayer (Batch 2)

`src/viewer/components/TextLayer.tsx` is fully implemented. It renders absolutely positioned transparent `<span>` elements for browser-native text selection, with the correct PDF→DOM coordinate transform (`domX = span.rect.x * zoom`, `domY = (pageHeightPt - span.rect.y - span.rect.height) * zoom`).

**Current state:** `textSpans` is initialized to `[]` in ViewerApp and never populated. The `QueryEngine.extractTextWithFormatting()` method returns `notImpl(...)` in the mock. `TauriQueryEngine.extractTextWithFormatting()` is a stub.

**What it needs:** A Tauri command `get_page_text_spans(page_index)` returning `Vec<TauriTextSpan>`, and a `TauriQueryEngine` implementation that calls it and maps to `TextSpan[]`. ViewerApp then calls it on page render.

### 1.2 AnnotationOverlay (Batch 3)

`src/viewer/components/AnnotationOverlay.tsx` is fully implemented. It renders an SVG `<rect>` for each highlight in the `highlights` prop, with the same coordinate transform. The `activeHighlights` memo in ViewerApp is wired and guards correctly on `activeCommentIdx`, `pageIndex`, and `c.rect`.

**Current state:** Annotations are NOT loaded from the PDF. `engine.annotation.getAllAnnotations(pdfDoc)` in ViewerApp operates entirely on the in-memory TypeScript model — no backend call is made. When a real PDF is opened, `comments` is always `[]` because nothing populates the in-memory model from the Rust side.

**Critical discovery:** There is NO `get_annotations` Tauri command. The five annotation write commands (`add_highlight_annotation`, etc.) exist, but there is no read path. `TauriAnnotationEngine.getAllAnnotations()` appears to be a stub or returns the in-memory model only.

**What it needs:** A new `get_annotations(page_index: Option<u32>)` Tauri command returning `Vec<AnnotationInfo>` with `rect` populated, and a `TauriAnnotationEngine` implementation that calls it on document open.

### 1.3 OrganizeGrid drag-to-reorder follow-up

`src/viewer/components/OrganizeGrid.tsx` has Shift+click range selection and keyboard shortcuts (Batch 4). The only remaining piece to complete organize mode is drag-to-reorder, which requires `reorder_pages`.

**Critical discovery:** `reorder_pages(new_order: Vec<u32>) -> DocumentInfo` **already exists** in `src-tauri/src/lib.rs` and calls `pdf_manip::pages::rearrange_pages()`. This is the cheapest unlock in Phase 1 — it requires only a TypeScript bridge fix, no Rust work.

**What it needs:** Wire `TauriTransformEngine.reorderPages()` to call `invoke('reorder_pages', { new_order })`. Then implement drag-to-reorder UI in `OrganizeGrid.tsx` against that call.

---

## 2. Exact Phase 1 capabilities

### Capability A — Page reorder bridge wiring

### Capability B — Annotation loading with rect (`get_annotations`)

### Capability C — Per-page positioned text spans (`get_page_text_spans`)

---

## 3. Per-capability detail

### Capability A — Page reorder bridge wiring

**Why it matters:** `reorder_pages` is already implemented in Rust. The only thing preventing drag-to-reorder from working is that `TauriTransformEngine` doesn't call it. This is a 30-minute fix that gives users the ability to reorder pages by dragging — the most-requested organize-mode feature.

**Current frontend waiting:** `OrganizeGrid.tsx` — Batch 4 added keyboard shortcuts and range selection; drag-to-reorder is the remaining gap. Once the bridge is wired, the drag UI can be built as a frontend-only change.

**Rust crates involved:** `pdf-manip` — `rearrange_pages()` function already implemented and integrated.

**Tauri command shape (already exists):**
```rust
#[tauri::command]
pub async fn reorder_pages(
    new_order: Vec<u32>,
    state: State<'_, AppState>,
) -> Result<DocumentInfo, String>
```
- `new_order`: 0-based page indices in desired display order. Length must equal current page count. Example: `[2, 0, 1]` moves page 3 to first position.
- Returns `DocumentInfo` with updated `page_count` and `pages` array.

**TypeScript bridge changes needed:**

File: `src/platform/engine/tauri/TauriTransformEngine.ts`

Find the `reorderPages` method (currently a stub or mock call). Replace with:
```typescript
async reorderPages(document: PdfDocument, newOrder: number[]): AsyncEngineResult<PdfDocument> {
  try {
    const info = await invoke<TauriDocumentInfo>('reorder_pages', { new_order: newOrder });
    return { success: true, value: documentInfoToPdfDocument(info, document.fileName) };
  } catch (e) {
    return { success: false, error: { code: 'internal-error', message: String(e) } };
  }
}
```

File: `src/viewer/components/OrganizeGrid.tsx` — drag-to-reorder UI (after bridge is wired):
- Use HTML5 drag-and-drop: `draggable={true}`, `onDragStart`, `onDragOver`, `onDrop` on each tile
- Track `dragSourceIdx` ref, on drop: build new order array and call `onReorder(newOrder)`
- `onReorder` is a new prop: `onReorder: (newOrder: number[]) => void`
- ViewerApp adds: `const handleReorder = useCallback(async (newOrder) => { const result = await engine.transform.reorderPages(pdfDoc, newOrder); if (result.success) updatePageCount(result.value.pageCount); }, [...])`

**Risks/edge cases:**
- `new_order` must be a permutation of `[0, n-1]` — validate length and uniqueness before invoke
- After reorder, thumbnails are stale — trigger thumbnail regeneration (already handled by `updatePageCount` if it resets thumbnail state)
- Single-page documents should disable drag (length check)

**Recommended implementation order:** First. No Rust work required.

---

### Capability B — Annotation loading with rect (`get_annotations`)

**Why it matters:** Review mode currently shows no comments when a real PDF is opened. `comments` is always `[]` because annotations are never read from the PDF. Once this command exists, review mode becomes a real review tool: comment navigation, panel sync, and annotation highlight overlay all become live simultaneously.

**Current frontend waiting:**
- `ViewerApp.tsx` — `engine.annotation.getAllAnnotations(pdfDoc)` call on document load (line ~286); currently populates from in-memory model (always empty for real files)
- `AnnotationOverlay.tsx` — will light up automatically once `comments[activeCommentIdx].rect` is populated from real data
- `RightContextPanel ReviewModeContent` — will show real comments

**Rust crates involved:** `pdf-annot` — annotation reading from the PDF page `/Annots` array. The write path already exists (`add_highlight_annotation` etc.); the read path needs to be added. The crate exposes `get_annotations(doc, page_index) -> Vec<Annotation>` or similar.

**Tauri command shape (new):**

```rust
#[derive(Serialize)]
pub struct AnnotationInfo {
    pub id: String,
    pub page_index: u32,
    pub annotation_type: String,   // "text", "highlight", "underline", "square", etc.
    pub rect: [f32; 4],            // [x, y, width, height] in PDF points (origin: bottom-left)
    pub contents: Option<String>,
    pub author: Option<String>,
    pub created_at: Option<String>, // ISO 8601
    pub modified_at: Option<String>,
    pub color: Option<String>,      // CSS hex e.g. "#ffff00"
    pub opacity: Option<f32>,
}

#[tauri::command]
pub async fn get_annotations(
    page_index: Option<u32>,   // None = all pages, Some(n) = single page
    state: State<'_, AppState>,
) -> Result<Vec<AnnotationInfo>, String>
```

**Rect field note:** PDF annotation `/Rect` is stored as `[llx, lly, urx, ury]` (lower-left and upper-right corners in PDF coordinate space, origin at bottom-left). The Rust command should normalize to `[x, y, width, height]` for simplicity: `x = llx`, `y = lly`, `width = urx - llx`, `height = ury - lly`. The existing `AnnotationOverlay` coordinate transform expects this format.

**TypeScript bridge changes needed:**

File: `src/platform/engine/tauri/TauriAnnotationEngine.ts`

Add or replace `getAllAnnotations`:
```typescript
async getAllAnnotations(document: PdfDocument): AsyncEngineResult<Annotation[]> {
  try {
    const raw = await invoke<TauriAnnotationInfo[]>('get_annotations', { page_index: null });
    return { success: true, value: raw.map(tauriAnnotationToAnnotation) };
  } catch (e) {
    return { success: false, error: { code: 'internal-error', message: String(e) } };
  }
}

function tauriAnnotationToAnnotation(a: TauriAnnotationInfo): Annotation {
  return {
    id: a.id,
    pageIndex: a.page_index,
    type: a.annotation_type as AnnotationType,
    rect: { x: a.rect[0], y: a.rect[1], width: a.rect[2], height: a.rect[3] },
    contents: a.contents ?? undefined,
    author: a.author ?? '',
    createdAt: a.created_at ? new Date(a.created_at) : new Date(),
    modifiedAt: a.modified_at ? new Date(a.modified_at) : new Date(),
    color: a.color ?? '#ffff00',
    opacity: a.opacity ?? 1,
    visible: true,
    locked: false,
  };
}
```

The `ViewerApp` call at line ~286 already reads `engine.annotation.getAllAnnotations(pdfDoc)` — no ViewerApp changes needed once the bridge is wired.

**Risks/edge cases:**
- PDFs without `/Annots` on any page must return `[]` without error
- Some annotations have malformed `/Rect` (e.g. coordinates equal or inverted) — clamp `width = max(0, urx - llx)`, `height = max(0, ury - lly)`
- Annotation subtypes vary widely — start with `text`, `highlight`, `underline`, `square`, `circle`, `ink`; unknown types should still be returned with `annotation_type: "unknown"` rather than skipped
- Large documents (1000+ annotations) — no batching needed for Phase 1; single call is acceptable
- Annotation `id` is not a PDF concept — generate as `"page{page_index}_annot{n}"` or use the annotation object offset as a stable id

**Recommended implementation order:** Second. Requires a new Rust command (~50 lines) and a TypeScript bridge change.

---

### Capability C — Per-page positioned text spans (`get_page_text_spans`)

**Why it matters:** Text selection and copy are completely implemented in the frontend but dormant. `extract_page_text` already exists and returns plain text — the gap is positioned spans (word bounding boxes + font size). This is also the foundation for find-in-document: the search UI is a placeholder, but once text positions are available the search index can be built client-side for small documents, or the existing `search_text` command extended.

**Current frontend waiting:**
- `TextLayer.tsx` — renders `TextSpan[]`; currently receives `[]` always
- `textSpans` state in `ViewerApp.tsx` — initialized to `[]`, needs to be populated on page render
- ⌘C copy handler — already works on `window.getSelection()` once the text layer has selectable spans

**Rust crates involved:** `pdf-extract` — the crate is already in `Cargo.toml`. It exposes text extraction with glyph metrics. The existing `extract_page_text(page_index)` command in `lib.rs` uses this crate for plain text; a new command adds bounding box output.

**Tauri command shape (new):**

```rust
#[derive(Serialize)]
pub struct TextSpanInfo {
    pub text: String,
    pub x: f32,       // left edge in PDF points (origin: bottom-left)
    pub y: f32,       // bottom edge in PDF points
    pub width: f32,
    pub height: f32,
    pub font_size: f32,
}

#[tauri::command]
pub async fn get_page_text_spans(
    page_index: u32,
    state: State<'_, AppState>,
) -> Result<Vec<TextSpanInfo>, String>
```

**Granularity:** Word-level is sufficient for Phase 1. Character-level is unnecessary complexity. `pdf-extract` groups glyphs into words; use that grouping.

**TypeScript bridge changes needed:**

File: `src/platform/engine/tauri/TauriQueryEngine.ts`

Replace `extractTextWithFormatting` stub:
```typescript
async extractTextWithFormatting(
  document: PdfDocument,
  pageIndex: number,
): AsyncEngineResult<TextSpan[]> {
  try {
    const raw = await invoke<TauriTextSpanInfo[]>('get_page_text_spans', {
      page_index: pageIndex,
    });
    return {
      success: true,
      value: raw.map(s => ({
        text: s.text,
        rect: { x: s.x, y: s.y, width: s.width, height: s.height },
        fontSize: s.font_size,
      })),
    };
  } catch (e) {
    return { success: false, error: { code: 'internal-error', message: String(e) } };
  }
}
```

File: `src/viewer/ViewerApp.tsx`

Replace the `setTextSpans([])` stub in the `pdfDoc.id` effect with a per-page fetch. Add a second effect on `pageIndex`:
```typescript
useEffect(() => {
  if (!pdfDoc || !engine) { setTextSpans([]); return; }
  void engine.query.extractTextWithFormatting(pdfDoc, pageIndex).then(result => {
    if (result.success) setTextSpans(result.value);
    else setTextSpans([]);
  });
}, [pageIndex, pdfDoc?.id]); // eslint-disable-line react-hooks/exhaustive-deps
```

**Risks/edge cases:**
- Scanned PDFs (image-only): return `[]` without error — `pdf-extract` will produce no text
- RTL text (Arabic, Hebrew): bounding boxes are correct; browser selection handles direction natively
- Ligatures / merged glyphs: word-level grouping avoids most glyph-boundary issues
- Very large pages (e.g. engineering drawings at A0): may have thousands of spans — cap at 5000 spans per page for Phase 1; log a warning if truncated
- Font coordinate space: some PDFs use non-standard glyph origins — verify the coordinate transform is consistent with how `pdf-extract` reports positions. The existing `extract_page_text` code in `lib.rs` is the reference for how the crate is currently called.
- Performance: `get_page_text_spans` should be async (it already is via Tauri's async command pattern). Cache the result for the current page — do not re-fetch on zoom change.

**Recommended implementation order:** Third. The most Rust implementation work, but architecturally straightforward given `pdf-extract` is already integrated.

---

## 4. Proposed command and interface shapes (complete reference)

### Rust commands to add/wire

```rust
// Capability A — ALREADY EXISTS, no new Rust needed
reorder_pages(new_order: Vec<u32>) -> Result<DocumentInfo, String>

// Capability B — NEW
get_annotations(page_index: Option<u32>) -> Result<Vec<AnnotationInfo>, String>

// Capability C — NEW
get_page_text_spans(page_index: u32) -> Result<Vec<TextSpanInfo>, String>
```

### New Rust structs

```rust
// For get_annotations
#[derive(Serialize, Clone)]
pub struct AnnotationInfo {
    pub id: String,
    pub page_index: u32,
    pub annotation_type: String,
    pub rect: [f32; 4],            // [x, y, width, height] — already normalized
    pub contents: Option<String>,
    pub author: Option<String>,
    pub created_at: Option<String>,
    pub modified_at: Option<String>,
    pub color: Option<String>,
    pub opacity: Option<f32>,
}

// For get_page_text_spans
#[derive(Serialize, Clone)]
pub struct TextSpanInfo {
    pub text: String,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub font_size: f32,
}
```

### TypeScript types to add

```typescript
// In TauriAnnotationEngine.ts (internal)
interface TauriAnnotationInfo {
  id: string;
  page_index: number;
  annotation_type: string;
  rect: [number, number, number, number]; // [x, y, w, h]
  contents: string | null;
  author: string | null;
  created_at: string | null;
  modified_at: string | null;
  color: string | null;
  opacity: number | null;
}

// In TauriQueryEngine.ts (internal)
interface TauriTextSpanInfo {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  font_size: number;
}
```

### Engine method signatures affected

```typescript
// QueryEngine interface — already declared, implement in TauriQueryEngine:
extractTextWithFormatting(doc: PdfDocument, pageIndex: number): AsyncEngineResult<TextSpan[]>

// AnnotationEngine interface — already declared, implement in TauriAnnotationEngine:
getAllAnnotations(doc: PdfDocument): AsyncEngineResult<Annotation[]>

// TransformEngine interface — already declared, implement in TauriTransformEngine:
reorderPages(doc: PdfDocument, newOrder: number[]): AsyncEngineResult<PdfDocument>
```

### ViewerApp wiring changes

```typescript
// Capability A — new callback for OrganizeGrid
const handleReorder = useCallback(async (newOrder: number[]) => {
  if (!pdfDoc || !engine) return;
  const result = await engine.transform.reorderPages(pdfDoc, newOrder);
  if (result.success) updatePageCount(result.value.pageCount);
}, [pdfDoc, engine, updatePageCount]);

// Capability C — per-page text fetch
useEffect(() => {
  if (!pdfDoc || !engine) { setTextSpans([]); return; }
  void engine.query.extractTextWithFormatting(pdfDoc, pageIndex).then(result => {
    setTextSpans(result.success ? result.value : []);
  });
}, [pageIndex, pdfDoc?.id]); // eslint-disable-line react-hooks/exhaustive-deps
```

---

## 5. Verification strategy

### Capability A — Page reorder

**Unit test (TypeScript):** Source-scan `TauriTransformEngine.ts` for `invoke('reorder_pages'` and correct parameter mapping.

**Integration smoke test:**
1. Open any multi-page PDF in app
2. Switch to Organize mode
3. Drag page 1 to position 3
4. Verify page order visually and that `DocumentInfo.pages` reflects new order
5. Save and reopen — verify order is persisted

**Regression check:** Existing `delete_pages` and `rotate_pages` must still work after any `lib.rs` changes.

### Capability B — Annotation loading

**Unit test (Rust):** In `pdf-annot` test suite, open a known PDF with annotations, call `get_annotations`, assert result is non-empty and `rect` values are non-zero.

**Unit test (TypeScript):** Source-scan `TauriAnnotationEngine.ts` for `invoke('get_annotations'` and `tauriAnnotationToAnnotation` mapper.

**Integration smoke test:**
1. Open a PDF known to contain text annotations (sticky notes)
2. Switch to Review mode
3. Verify comment list in left rail is non-empty
4. Press ▶ in toolbar — verify page jumps and AnnotationOverlay shows a yellow rect on the annotation
5. Click annotation item in right panel — verify same highlight appears

**Edge case test:** Open a PDF with no annotations — verify Review mode shows "Geen opmerkingen gevonden." and no errors.

### Capability C — Text spans

**Unit test (Rust):** Open a known PDF with real text, call `get_page_text_spans(0)`, assert result is non-empty and `x`, `y`, `width`, `height`, `font_size` are all > 0.

**Unit test (TypeScript):** Source-scan `TauriQueryEngine.ts` for `invoke('get_page_text_spans'` and correct span mapping. Source-scan `ViewerApp.tsx` for `engine.query.extractTextWithFormatting` in a `useEffect` on `pageIndex`.

**Integration smoke test:**
1. Open a text-heavy PDF in read mode
2. Verify text layer appears (text spans should be selectable — try clicking on text area and dragging)
3. Select a word and press ⌘C
4. Paste into a text editor — verify correct text was copied
5. Navigate to next page — verify previous selection is cleared

**Edge case test:** Open a scanned (image-only) PDF — verify no error is thrown and text layer is empty (no visible effect).

---

## 6. Recommended implementation order

### Step 1 — Page reorder bridge wiring (1 day, zero Rust)

Wire `TauriTransformEngine.reorderPages()` to call the already-existing `reorder_pages` Rust command. Then implement drag-to-reorder UI in `OrganizeGrid.tsx`. This is the cheapest unlock: no Rust changes, one TypeScript file, one UI component update.

**Rationale:** Free capability. The Rust is done. Every day this sits unwired is wasted.

### Step 2 — Annotation loading (`get_annotations`) (2–3 days)

Add the `get_annotations` Rust command in `lib.rs`, implement using `pdf-annot`'s read API, wire `TauriAnnotationEngine.getAllAnnotations()`. This simultaneously activates:
- Comment list populated from real PDFs
- AnnotationOverlay highlights on active comment
- Toolbar ◀▶ comment navigation with real data
- Right panel comment list with real data
- Review comment filtering with real data

This is the highest ROI backend change: one command activates five already-shipped frontend features.

**Rationale:** Five features light up at once. The frontend is fully ready.

### Step 3 — Positioned text spans (`get_page_text_spans`) (2–3 days)

Add the `get_page_text_spans` Rust command, implement using `pdf-extract`'s word-level extraction, wire `TauriQueryEngine.extractTextWithFormatting()`, add the `useEffect` in ViewerApp to fetch per-page. This activates:
- Text selection in read mode
- ⌘C copy to clipboard
- Foundation for find-in-document (search UI is already a placeholder)

**Rationale:** The last remaining dormant capability. Slightly more Rust complexity than annotation loading; do after Step 2 to keep review mode functional during development.
