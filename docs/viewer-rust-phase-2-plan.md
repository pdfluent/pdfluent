# Viewer Rust Phase 2 — Annotation Write Support

**Goal:** Turn review mode from read-only navigation into a real annotation workflow.
**Scope:** Text/comment annotations only (sticky notes). No replies, no resolve-state, no complex types.
**Date:** 2026-03-16

---

## 1. Current Frontend Review Capabilities Waiting for Write Support

The following frontend components are fully implemented and waiting for a live backend:

| Capability | Status | Blocker |
|---|---|---|
| Comment navigation (prev/next) | ✅ Live (after Phase 1) | — |
| Comment list display with filter | ✅ Live | — |
| Comment author + contents display | ✅ Live | — |
| Active comment highlighting (AnnotationOverlay) | ✅ Live (after Phase 1) | — |
| Panel scroll-to-active comment | ✅ Live | — |
| **Add new comment** | ❌ No UI, bridge notImpl | Needs: UI + bridge wiring |
| **Edit comment text** | ❌ No UI, bridge notImpl | Needs: Rust update API + UI |
| **Delete comment** | ❌ No UI, bridge notImpl | Needs: Rust delete command + UI |

The read path is fully live. The write path — create, update, delete — is entirely dormant.

---

## 2. Exact Commands to Add

### Already exists but NOT wired to the TypeScript engine layer

```rust
fn add_comment_annotation(state, page_index: u32, x: f32, y: f32, text: String) -> Result<(), String>
```

This command works at the Tauri level. `TauriAnnotationEngine.createAnnotation()` is a `notImpl` stub
and never calls it. This is Phase 2 Step 1 (zero new Rust, pure bridge wiring).

The command returns `()`. To get the created annotation back, we re-fetch via `get_annotations` after
creation. One extra round-trip is acceptable for the initial implementation.

### New Rust commands needed

**Command 2 — delete_annotation**

```rust
#[tauri::command]
fn delete_annotation(
    state: State<AppState>,
    annotation_id: String,   // format: "annot-p{page}-{idx}"
) -> Result<(), String>
```

Parses `page_index` and positional `idx` from the annotation ID, removes the i-th entry from the
page's `/Annots` array in `lopdf_doc`, marks the document modified.

**Command 3 — update_annotation_contents**

```rust
#[tauri::command]
fn update_annotation_contents(
    state: State<AppState>,
    annotation_id: String,   // format: "annot-p{page}-{idx}"
    contents: String,
) -> Result<(), String>
```

Parses `page_index` and `idx`, looks up the annotation object in `lopdf_doc` by reading the page's
`/Annots` array, modifies the `/Contents` field in the annotation dictionary, marks document modified.

---

## 3. Proposed Rust Payload Shapes

### Annotation ID contract (important)

Current IDs returned by `get_annotations`: `"annot-p{page_index}-{i}"` where:
- `page_index` is the 0-based page index
- `i` is the 0-based position in the page's `/Annots` array at the time of last fetch

This positional ID is sufficient because:
- After any mutation (create/update/delete), the frontend re-fetches annotations via `loadAnnotations`
- The re-fetched IDs are always correct at the time of the next operation
- The only requirement is that the ID is stable between one `loadAnnotations` call and the next mutation

**Known limitation:** IDs are not globally stable across multiple mutation sessions (if annotations
are added/removed, positional indices shift). Acceptable for Phase 2; migrate to lopdf ObjectId-based
IDs in Phase 3 if needed.

### delete_annotation implementation sketch

```rust
// In OpenDocument (pdf_engine.rs)
pub fn delete_annotation(&mut self, annotation_id: &str) -> Result<(), String> {
    // Parse "annot-p{page}-{idx}" format
    let (page_index, annot_idx) = parse_annotation_id(annotation_id)?;

    // Get the page's object ID from lopdf (1-based page number)
    let page_id = self.lopdf_doc
        .get_pages()
        .get(&(page_index + 1))
        .copied()
        .ok_or_else(|| format!("Page {page_index} not found"))?;

    // Get the /Annots array from the page dict, remove i-th entry
    let page_dict = self.lopdf_doc.get_object_mut(page_id)?
        .as_dict_mut()?;

    if let Ok(annots) = page_dict.get_mut(b"Annots") {
        if let Ok(arr) = annots.as_array_mut() {
            if annot_idx < arr.len() {
                arr.remove(annot_idx);
            }
        }
    }

    self.sync_after_mutation()
}
```

### update_annotation_contents implementation sketch

```rust
pub fn update_annotation_contents(
    &mut self,
    annotation_id: &str,
    contents: &str,
) -> Result<(), String> {
    let (page_index, annot_idx) = parse_annotation_id(annotation_id)?;

    // Get annotation ObjectId from the page's /Annots array
    let page_id = self.lopdf_doc
        .get_pages()
        .get(&(page_index + 1))
        .copied()
        .ok_or_else(|| format!("Page {page_index} not found"))?;

    let annot_obj_id = {
        let page_dict = self.lopdf_doc.get_object(page_id)?.as_dict()?;
        let annots = page_dict.get(b"Annots")?.as_array()?;
        annots[annot_idx].as_reference()?
    };

    // Modify /Contents field in the annotation dictionary
    let annot_dict = self.lopdf_doc
        .get_object_mut(annot_obj_id)?
        .as_dict_mut()?;

    annot_dict.set(b"Contents", lopdf::Object::string_literal(contents));

    self.sync_after_mutation()
}

fn parse_annotation_id(id: &str) -> Result<(u32, usize), String> {
    // Parse "annot-p{page}-{idx}" format
    let stripped = id.strip_prefix("annot-p")
        .ok_or_else(|| format!("Invalid annotation id: {id}"))?;
    let (page_str, idx_str) = stripped.rsplit_once('-')
        .ok_or_else(|| format!("Invalid annotation id: {id}"))?;
    let page: u32 = page_str.parse()
        .map_err(|_| format!("Invalid page in annotation id: {id}"))?;
    let idx: usize = idx_str.parse()
        .map_err(|_| format!("Invalid index in annotation id: {id}"))?;
    Ok((page, idx))
}
```

---

## 4. Rust Crates / Modules Involved

| Crate / Module | Role |
|---|---|
| `pdf-annot/builder.rs` | Already used for `add_comment_annotation`. No changes needed. |
| `lopdf` (in `OpenDocument.lopdf_doc`) | Direct dict mutation for `update_annotation_contents` and `delete_annotation`. Access page `/Annots` array, modify annotation dicts. |
| `src-tauri/src/pdf_engine.rs` | Add `delete_annotation()` and `update_annotation_contents()` methods to `OpenDocument`. Add `parse_annotation_id()` helper. |
| `src-tauri/src/lib.rs` | Add `delete_annotation` and `update_annotation_contents` Tauri commands. Register in `invoke_handler!`. |

No changes to XFA crates needed. All work is in the Tauri app (`src-tauri/`).

---

## 5. Tauri Bridge Changes

### Step 1 — Wire existing add_comment_annotation (zero new Rust)

**`TauriAnnotationEngine.ts`**

Replace the `createAnnotation` notImpl stub:

```typescript
async createAnnotation(
  _document: PdfDocument,
  pageIndex: number,
  type: AnnotationType,
  bounds: { x: number; y: number; width: number; height: number },
  properties: Partial<Annotation>
): AsyncEngineResult<Annotation> {
  if (type !== 'text') {
    return { success: false, error: { code: 'not-implemented', message: 'Only text annotations supported' } };
  }
  try {
    await invoke('add_comment_annotation', {
      pageIndex,
      x: bounds.x,
      y: bounds.y,
      text: properties.contents ?? '',
    });
    // The command returns (). Re-fetch is required to get the new annotation's id.
    // Callers must call loadAnnotations after this returns success.
    return {
      success: true,
      value: {
        id: 'pending-refetch',
        pageIndex,
        type: 'text',
        rect: bounds,
        contents: properties.contents,
        author: properties.author ?? '',
        color: '#FFD700',
        visible: true,
        locked: false,
        createdAt: new Date(),
        modifiedAt: new Date(),
      },
    };
  } catch (e) {
    return { success: false, error: { code: 'internal-error', message: String(e) } };
  }
}
```

**Note on the pending-refetch pattern:** `add_comment_annotation` returns `()`. The returned
`Annotation` object uses a placeholder ID. ViewerApp must call `loadAnnotations` after a successful
`createAnnotation` to get the real ID. This is the defined contract for Phase 2.

### Step 2 — Wire deleteAnnotation (after Rust command exists)

```typescript
async deleteAnnotation(
  _document: PdfDocument,
  annotationId: string
): AsyncEngineResult<void> {
  try {
    await invoke('delete_annotation', { annotationId });
    return { success: true, value: undefined };
  } catch (e) {
    return { success: false, error: { code: 'internal-error', message: String(e) } };
  }
}
```

### Step 3 — Wire updateAnnotation (after Rust command exists)

```typescript
async updateAnnotation(
  _document: PdfDocument,
  annotationId: string,
  updates: Partial<Annotation>
): AsyncEngineResult<Annotation> {
  try {
    if (updates.contents !== undefined) {
      await invoke('update_annotation_contents', {
        annotationId,
        contents: updates.contents,
      });
    }
    // Return a placeholder; callers must re-fetch for the ground-truth state.
    return { success: true, value: { id: annotationId } as Annotation };
  } catch (e) {
    return { success: false, error: { code: 'internal-error', message: String(e) } };
  }
}
```

---

## 6. Minimal Frontend Changes for the First Vertical Slice

The first vertical slice is **create comment → re-fetch → display**. This requires:

### ModeToolbar.tsx — Add "Add Comment" button

In review mode, add a button that triggers comment creation:

```tsx
{mode === 'review' && pageCount > 0 && (
  <button
    data-testid="add-comment-btn"
    onClick={onAddComment}
    className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md bg-background border border-border..."
  >
    <PlusIcon className="w-3.5 h-3.5" />
    Opmerking
  </button>
)}
```

New prop: `onAddComment: () => void` (passed down from ViewerApp).

### ViewerApp.tsx — handleAddComment

```typescript
const handleAddComment = useCallback(() => {
  if (!pdfDoc || !engine) return;
  // Position the new comment at the center of the current page
  const page = pdfDoc.pages[pageIndex];
  if (!page) return;
  const x = page.size.width / 2;
  const y = page.size.height / 2;
  void engine.annotation.createAnnotation(pdfDoc, pageIndex, 'text',
    { x, y, width: 24, height: 24 },
    { contents: '', author: 'User' }
  ).then(async result => {
    if (result.success) {
      // Re-fetch annotations to get real ID and update comments state
      const annotResult = await engine.annotation.loadAnnotations(pdfDoc);
      if (annotResult.success) {
        setComments(annotResult.value.filter(a => a.type === 'text')
          .sort((a, b) => a.pageIndex - b.pageIndex));
      }
    }
  });
}, [pdfDoc, engine, pageIndex]);
```

**This is the entire frontend change for the first slice.** No new dialog, no rich text input —
a new empty comment is created at page center and appears immediately in the panel after re-fetch.
A follow-on step adds inline text editing via the comment list item.

### RightContextPanel.tsx — Delete button on comment items (second frontend step)

Add a small delete affordance to each comment item in ReviewModeContent:

```tsx
<div className="flex items-start justify-between gap-1">
  <div className="flex-1 min-w-0">
    {/* existing author + contents */}
  </div>
  <button
    data-testid="delete-comment-btn"
    onClick={(e) => { e.stopPropagation(); onDeleteComment(comment.id); }}
    className="p-0.5 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 rounded transition-colors shrink-0"
  >
    <TrashIcon className="w-3 h-3" />
  </button>
</div>
```

New prop on `ReviewModeContent`: `onDeleteComment: (annotationId: string) => void`.

---

## 7. Recommended Implementation Order

### Step 1 — Bridge the existing create command (zero Rust, ~30 min)

**Files touched:** `TauriAnnotationEngine.ts`, `ViewerApp.tsx`, `ModeToolbar.tsx`, tests

1. Wire `TauriAnnotationEngine.createAnnotation()` to `invoke('add_comment_annotation', ...)`
2. Add `handleAddComment` callback in ViewerApp (creates + re-fetches)
3. Add "Opmerking" button to ModeToolbar in review mode
4. Write source-scan tests

**Value:** The full create→display loop works. Users can add comments to real PDFs. The isDirty flag
activates. Users can save the PDF and the comment persists.

**Verification:** Open any PDF → switch to review mode → click "Opmerking" → comment appears in panel
→ navigate to it → overlay renders → save PDF → reopen → comment still there.

---

### Step 2 — Add delete_annotation Rust command (~1 hour)

**Files touched:** `pdf_engine.rs`, `lib.rs`, `TauriAnnotationEngine.ts`, tests

1. Add `parse_annotation_id()` helper in `pdf_engine.rs`
2. Add `delete_annotation()` method on `OpenDocument`
3. Add `delete_annotation` Tauri command in `lib.rs` + register
4. Wire `TauriAnnotationEngine.deleteAnnotation()` to `invoke('delete_annotation', ...)`
5. Add delete button to ReviewModeContent comment items
6. In ViewerApp: `handleDeleteComment` calls `deleteAnnotation` then `loadAnnotations`
7. Write tests

**Value:** Full CRUD minus update. Users can create, read, navigate, delete comments.

---

### Step 3 — Add update_annotation_contents Rust command (~1 hour)

**Files touched:** `pdf_engine.rs`, `lib.rs`, `TauriAnnotationEngine.ts`, `RightContextPanel.tsx`, tests

1. Add `update_annotation_contents()` method on `OpenDocument`
2. Add `update_annotation_contents` Tauri command in `lib.rs` + register
3. Wire `TauriAnnotationEngine.updateAnnotation()` for `contents` changes
4. Add inline edit affordance: clicking a comment in the panel expands an editable textarea
5. On blur/confirm → `updateAnnotation` → `loadAnnotations`
6. Write tests

**Value:** Full CRUD. Users can add, read, navigate, edit, and delete comments. Review mode is
functionally complete for the text annotation type.

---

### Step 4 — Non-blocking: click-to-place comments (future, after Step 1–3)

Allow users to click on the page canvas to place a comment at that exact position rather than
page-center. Requires:
- `PageCanvas` to emit an `onPageClick(x, y)` event
- ViewerApp to intercept clicks in review mode and call `createAnnotation(x, y, ...)`
- The `x, y` coordinates must be converted from DOM pixels to PDF user space:
  `pdfX = domX / zoom`, `pdfY = pageHeightPt - (domY / zoom)`

---

## 8. Verification Strategy

### For each step: local smoke test before commit

After each implementation step, verify the round-trip:

```
1. Open a PDF in the Tauri app
2. Switch to review mode
3. Perform the operation (create / delete / edit)
4. Verify the panel updates (annotation appears / disappears / text changes)
5. Verify the AnnotationOverlay renders when navigating to the comment's page
6. Save the PDF (⌘S)
7. Close and reopen the file
8. Verify the change persists
```

### Source-scan tests (CI)

Each step produces source-scan tests covering:
- Bridge method implementation (invoke call present, parameters correct)
- ViewerApp wiring (handler present, loadAnnotations called after mutation)
- UI component affordance (button/input present with correct testid)
- Round-trip contract: after create/delete/update, `loadAnnotations` is always called

### Regression guard

After each step, run `npx vitest run` and verify the 5 pre-existing failures remain the only failures.
No new failures are acceptable.

### lopdf mutation risk

The direct lopdf dict manipulation in `delete_annotation` and `update_annotation_contents` is the
riskiest part. Guard with:
- Test with a PDF that has multiple annotations (multi-page, multi-annot)
- Test that delete removes exactly one annotation and leaves others intact
- Test that update only changes `/Contents` and not other fields
- Test that save-reload-get_annotations shows the expected state
- Use `cargo test` in `src-tauri/` to add unit tests for `parse_annotation_id`

---

## Open Decisions

| Decision | Recommendation |
|---|---|
| ID stability after mutation | Accept positional instability for Phase 2; always re-fetch after mutation. Migrate to ObjectId-based IDs in Phase 3 if needed. |
| Author field source | Hardcode to `"User"` for Phase 2; wire to actual user identity (from license or settings) in Phase 3. |
| Comment placement | Page-center for Step 1; click-to-place as Step 4 (separate PR). |
| Reply threads | Explicitly out of scope for Phase 2. |
| Resolve state (`/State` dict) | Explicitly out of scope for Phase 2. |
| Highlight annotation write | Out of scope for Phase 2 (no text selection → annotation flow yet). |
