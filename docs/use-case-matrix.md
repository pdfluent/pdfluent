# PDFluent Use-Case / Capability Matrix

> **Version:** 2026-05-14  
> **Scope:** PDFluent viewer app (React 19 + Vite) against `xfa-wasm` SDK (vello_cpu renderer).  
> **Rule:** SDK is read-only — no new SDK features. UI must be honest about what the existing WASM can do.

---

## 1. Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Fully wired and tested in this runtime |
| ⚠️ | Partial / degraded (e.g. UI shows but backend is stub) |
| ❌ | Explicitly unsupported in this runtime |
| 🖥️ | Tauri (native/desktop) only |
| 🌐 | Browser/WASM only |
| — | Not applicable |

---

## 2. Engine Capability Summary

### 2.1 WASM Engine (`WasmPdfEngine`)

| Capability | Status | WASM API / Notes |
|------------|--------|------------------|
| Load / Open PDF | ✅ | `PdfDoc.open(bytes)` |
| Render page → PNG | ✅ | `PdfDoc.renderPage(idx, scale)` |
| Render thumbnail → PNG | ✅ | `PdfDoc.renderThumbnail(idx, maxDim)` |
| Extract text (page or full) | ✅ | `PdfDoc.text(idx)` |
| Extract text positions | ✅ | `PdfDoc.getTextPositions(idx)` |
| Search text | ✅ | Client-side search over extracted text + positions |
| Read annotations | ⚠️ | Rust source has `PdfDoc.getAnnotations` behind `annotate`, but the browser `wasm` build excludes `annotate`; runtime export is missing |
| Add highlight annotation | ⚠️ | Rust source has `PdfDoc.addHighlight` behind `annotate`, but the browser `wasm` build excludes `annotate`; runtime export is missing |
| Add sticky-note annotation | ⚠️ | Rust source has `PdfDoc.addStickyNote` behind `annotate`, but the browser `wasm` build excludes `annotate`; runtime export is missing |
| Add free-text annotation | ⚠️ | Rust source has `PdfDoc.addFreeText` behind `annotate`, but the browser `wasm` build excludes `annotate`; runtime export is missing |
| Merge documents | ✅ | `PdfDoc.merge(otherBytes)` |
| Flatten XFA | ✅ | `PdfDoc.flattenXfa()` |
| Validate PDF/A | ✅ | `PdfDoc.validatePdfA(level)` |
| Convert to PDF/A | ✅ | `PdfDoc.convertToPdfa(level)` |
| Verify signatures | ✅ | `PdfDoc.verifySignatures()` |
| List signatures | ✅ | `PdfDoc.signatures()` |
| Check has signatures | ✅ | `PdfDoc.hasSignatures()` |
| Get metadata | ✅ | `PdfDoc.metadata()` |
| Get DSS info | ✅ | `PdfDoc.dssInfo()` |
| **Save to filesystem path** | ❌ | Returns bytes only; browser must trigger download |
| **Delete pages** | ❌ | Not exposed by xfa-wasm |
| **Rotate pages** | ❌ | Not exposed by xfa-wasm |
| **Split document** | ❌ | Not exposed by xfa-wasm |
| **Insert/reorder/duplicate pages** | ❌ | Not exposed by xfa-wasm |
| **Compress PDF** | ❌ | Not exposed by xfa-wasm |
| **Encrypt / password protect** | ❌ | Not exposed by xfa-wasm |
| **Watermark** | ❌ | Not exposed by xfa-wasm |
| **OCR** | ❌ | Not exposed by xfa-wasm |
| **Redaction** | ❌ | Not exposed by xfa-wasm |
| **Underline annotation** | ❌ | Not exposed by xfa-wasm |
| **Strikeout annotation** | ❌ | Not exposed by xfa-wasm |
| **Rectangle / shape annotation** | ❌ | Not exposed by xfa-wasm |
| **Form field discovery** | ❌ | `WasmFormEngine` rejects all operations |
| **Form fill/edit** | ❌ | `WasmFormEngine` rejects all operations |
| **PDF/UA validation** | ❌ | Not exposed by xfa-wasm |
| **PDF/X validation** | ❌ | Not exposed by xfa-wasm |
| **Font / image / color validation** | ❌ | Not exposed by xfa-wasm |
| **Export to DOCX/XLSX/PPTX** | ❌ | Not exposed by xfa-wasm |
| **Export to PNG/JPEG** | ❌ | Not exposed by xfa-wasm |
| **Create empty document** | ❌ | Not exposed by xfa-wasm |
| **Edit PDF text** | ❌ | Not exposed by xfa-wasm |
| **Edit PDF images** | ❌ | Not exposed by xfa-wasm |
| **Bookmarks / outline** | ❌ | Not exposed by xfa-wasm |

### 2.2 Tauri Engine

Tauri delegates to a native Rust backend. It supports everything the WASM engine supports **plus**:

| Capability | Status | Notes |
|------------|--------|-------|
| Save to filesystem | ✅ | `save_document` command |
| Delete pages | ✅ | `delete_pages` command |
| Rotate pages | ✅ | `rotate_page_left` / `rotate_page_right` |
| OCR (PaddleOCR) | ✅ | `run_paddle_ocr` command |
| Underline annotation | ✅ | `add_underline_annotation` |
| Strikeout annotation | ✅ | `add_strikeout_annotation` |
| Rectangle annotation | ✅ | `add_shape_annotation` |
| Redaction annotation | ✅ | `add_redaction_annotation` |
| Export PNG/JPEG | ✅ | Native render + encode |
| Export compressed PDF | ✅ | Native compression |
| Form field discovery | ✅ | Native form parsing |
| Form fill | ✅ | Native form editing |
| Password protect | ✅ | Native encryption |
| Decrypt | ✅ | Native decryption |
| Digital signature | ✅ | Native signing |

---

## 3. UI Tool → Capability Mapping

### 3.1 Read Mode

| Tool (i18n key) | WASM | Tauri | Issue |
|-----------------|------|-------|-------|
| `toolbar.select` | ✅ (pan) | ✅ | — |
| `toolbar.pan` | ✅ | ✅ | — |
| `toolbar.zoomIn` | ✅ | ✅ | — |
| `toolbar.zoomOut` | ✅ | ✅ | — |
| `toolbar.fullscreen` | ✅ | ✅ | — |
| `toolbar.searchText` | ✅ | ✅ | — |
| `toolbar.readAloud` | ❌ | ❌ | No TTS engine wired |

### 3.2 Review Mode

| Tool (i18n key) | WASM | Tauri | Issue |
|-----------------|------|-------|-------|
| `toolbar.highlight` | ✅ | ✅ | — |
| `toolbar.underline` | ❌ | ✅ | Was shown enabled in WASM; **fixed** |
| `toolbar.strikethrough` | ❌ | ✅ | Was shown enabled in WASM; **fixed** |
| `toolbar.note` | ❌ | ❌ | No backend wired |
| `toolbar.comment` | ⚠️ | ⚠️ | UI exists; backend comment model is local-only |
| `toolbar.freeDraw` | ❌ | ❌ | No backend wired |
| `toolbar.stamp` | ❌ | ❌ | No backend wired |

### 3.3 Edit Mode

| Tool (i18n key) | WASM | Tauri | Issue |
|-----------------|------|-------|-------|
| `toolbar.editText` | ❌ | ❌ | No backend wired |
| `toolbar.addText` | ❌ | ❌ | No backend wired |
| `toolbar.image` | ❌ | ❌ | No backend wired |
| `toolbar.link` | ❌ | ❌ | No backend wired |
| `toolbar.headerFooter` | ❌ | ❌ | No backend wired |
| `toolbar.watermark` | ❌ | ❌ | No backend wired |

### 3.4 Organize Mode

| Tool (i18n key) | WASM | Tauri | Issue |
|-----------------|------|-------|-------|
| `toolbar.insertPage` | ❌ | ❌ | No backend wired |
| `toolbar.deletePage` | ❌ | ✅ | Was shown enabled in WASM (no-op); **fixed** |
| `toolbar.rotateLeft` | ❌ | ✅ | Was shown enabled in WASM (no-op); **fixed** |
| `toolbar.rotateRight` | ❌ | ✅ | Was shown enabled in WASM (no-op); **fixed** |
| `toolbar.split` | ❌ | ❌ | No backend wired |
| `toolbar.merge` | ✅ | ✅ | WASM via `PdfDoc.merge`; Tauri via native |

### 3.5 Forms Mode

| Tool (i18n key) | WASM | Tauri | Issue |
|-----------------|------|-------|-------|
| `toolbar.autoDetect` | ❌ | ❌ | No backend wired |
| `toolbar.textField` | ❌ | ❌ | No backend wired |
| `toolbar.checkbox` | ❌ | ❌ | No backend wired |
| `toolbar.radioButton` | ❌ | ❌ | No backend wired |
| `toolbar.signature` | ❌ | ✅ | Tauri native signing |
| `toolbar.initials` | ❌ | ❌ | No backend wired |
| `toolbar.date` | ❌ | ❌ | No backend wired |

### 3.6 Protect Mode

| Tool (i18n key) | WASM | Tauri | Issue |
|-----------------|------|-------|-------|
| `toolbar.password` | ❌ | ✅ | Tauri native encryption |
| `toolbar.permissions` | ❌ | ❌ | No backend wired |
| `toolbar.redact` | ❌ | ✅ | Was shown enabled in WASM (no-op); **fixed** |

### 3.7 Convert Mode

| Tool (i18n key) | WASM | Tauri | Issue |
|-----------------|------|-------|-------|
| `toolbar.ocrScan` | ❌ | ✅ | Was shown enabled in WASM (no-op); **fixed** |
| `toolbar.validatePdfA` | ✅ | ✅ | WASM via `validatePdfA` |
| `toolbar.convertPdfA` | ✅ | ✅ | WASM via `convertToPdfa` |

---

## 4. Export Formats

| Format | WASM (Browser) | Tauri | Notes |
|--------|----------------|-------|-------|
| PDF | ✅ | ✅ | Bytes returned; browser triggers download |
| Compressed PDF | ❌ | ✅ | Native only |
| PNG | ❌ | ✅ | Native render + encode |
| JPEG | ❌ | ✅ | Native render + encode |
| DOCX | ❌ | ✅ | Native only |
| XLSX | ❌ | ✅ | Native only |
| PPTX | ❌ | ✅ | Native only |

---

## 5. Annotation Type Support

### 5.1 WASM

No annotation types can be **read or created** through the current browser WASM build's annotation API.

The Rust source contains `PdfDoc.getAnnotations`, `PdfDoc.addHighlight`, `PdfDoc.addStickyNote`, and `PdfDoc.addFreeText` behind the `annotate` feature, but the browser build uses the `wasm` feature and excludes `annotate`. Those runtime exports are absent in generated `xfa_wasm.js`/`xfa_wasm.d.ts`, so annotation operations return `operation-not-supported` and the UI must not present WASM annotation creation controls.

### 5.2 Tauri

The following annotation types can be **created** in Tauri:

- `highlight` → `add_highlight_annotation`
- `underline` → `add_underline_annotation`
- `strikeout` → `add_strikeout_annotation`
- `rectangle` → `add_shape_annotation`
- `redaction` → `add_redaction_annotation`

---

## 6. Known UI Mismatches (Fixed)

| # | Mismatch | Fix |
|---|----------|-----|
| 1 | `toolbar.deletePage` enabled in WASM but no-op | Removed from `WIRED_TOOLS` in WASM |
| 2 | `toolbar.rotateLeft` enabled in WASM but no-op | Removed from `WIRED_TOOLS` in WASM |
| 3 | `toolbar.rotateRight` enabled in WASM but no-op | Removed from `WIRED_TOOLS` in WASM |
| 4 | `toolbar.ocrScan` enabled in WASM but no-op | Removed from `WIRED_TOOLS` in WASM |
| 5 | `toolbar.redact` enabled in WASM but no-op | Removed from `WIRED_TOOLS` in WASM; protect-mode redaction button hidden |
| 6 | Annotation `highlight` shown in WASM while runtime export is missing | Filtered from annotation toolbar in WASM |
| 7 | Annotation `underline` shown in WASM | Filtered from annotation toolbar in WASM |
| 8 | Annotation `strikeout` shown in WASM | Filtered from annotation toolbar in WASM |
| 9 | Annotation `rectangle` shown in WASM | Filtered from annotation toolbar in WASM |
| 10 | Annotation `redaction` shown in review WASM | Filtered from annotation toolbar in WASM |
| 11 | Add-comment shown in WASM while sticky-note runtime export is missing | Filtered from review toolbar in WASM |

---

## 7. Automated Test Coverage

See `src/viewer/tools/__tests__/runtime-tool-wiring.test.tsx` for automated tests that verify:

1. `getWiredTools(true)` includes Tauri-only tools.
2. `getWiredTools(false)` excludes Tauri-only tools.
3. Annotation toolbar in WASM only shows `highlight`.
4. Annotation toolbar in Tauri shows all 5 tools.
5. Protect-mode redaction button is hidden in WASM.

---

*This document is auto-generated from source inspection. Update it whenever engine capabilities or UI tools change.*
