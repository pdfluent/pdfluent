# E2E Visual Test Specification — Capability Alignment

> **Scope:** Verify that the PDFluent viewer UI honestly reflects browser-test vs Tauri runtime capabilities.  
> **Runtime:** Browser (browser-test) and Tauri (desktop).  
> **Last updated:** 2026-05-14

---

## 1. Test Environment Setup

### 1.1 Browser (browser-test) Tests

```ts
// playwright.config.ts snippet
{
  name: 'chromium-browser-test',
  use: { ...devices['Desktop Chrome'] },
  // Serve the Vite dev build or preview build
  webServer: { command: 'npm run preview', port: 4173 },
}
```

Load a test PDF (e.g. `tests/fixtures/sample-text.pdf`) via the file-open flow or by seeding `localStorage` with a recent file.

### 1.2 Tauri Tests

Tauri E2E tests are out of scope for this document — they require the native binary. The spec below marks Tauri-only assertions with 🖥️.

---

## 2. ModeToolbar — Per-Runtime Tool Visibility

### Test: `mode-toolbar-read-mode-browser-test`

**Setup:** Open any PDF in browser (browser-test).

**Assertions:**
- [ ] Zoom in, zoom out, fullscreen, and search text buttons are **enabled**.
- [ ] All other read-mode tools (select, pan, read aloud) are visible but **disabled/grayed**.

### Test: `mode-toolbar-organize-mode-browser-test`

**Setup:** Switch to "Organize" mode in browser.

**Assertions:**
- [ ] `toolbar.merge` is visible (engine supports it).
- [ ] `toolbar.deletePage`, `toolbar.rotateLeft`, `toolbar.rotateRight` are **disabled/grayed**.
- [ ] `toolbar.insertPage`, `toolbar.split` are **disabled/grayed**.

### Test: `mode-toolbar-organize-mode-tauri` 🖥️

**Setup:** Switch to "Organize" mode in Tauri.

**Assertions:**
- [ ] `toolbar.deletePage`, `toolbar.rotateLeft`, `toolbar.rotateRight` are **enabled**.
- [ ] `toolbar.insertPage`, `toolbar.split` remain **disabled/grayed** (not yet implemented).

### Test: `mode-toolbar-review-mode-annotations-browser-test`

**Setup:** Switch to "Review" mode in browser.

**Assertions:**
- [ ] Only the **highlight** annotation tool button is visible in the annotation toolbar.
- [ ] Underline, strikeout, rectangle, and redaction annotation tool buttons are **NOT visible**.
- [ ] The "Add comment" (`+`) button is visible.

### Test: `mode-toolbar-review-mode-annotations-tauri` 🖥️

**Setup:** Switch to "Review" mode in Tauri.

**Assertions:**
- [ ] All five annotation tool buttons are visible: highlight, underline, strikeout, rectangle, redaction.
- [ ] All five are **enabled**.

### Test: `mode-toolbar-protect-mode-browser-test`

**Setup:** Switch to "Protect" mode in browser.

**Assertions:**
- [ ] Password and permissions tools are **disabled/grayed**.
- [ ] The redaction toggle button is **NOT visible**.

### Test: `mode-toolbar-protect-mode-tauri` 🖥️

**Setup:** Switch to "Protect" mode in Tauri.

**Assertions:**
- [ ] Password tool is **enabled**.
- [ ] The redaction toggle button **is visible** and enabled.

### Test: `mode-toolbar-convert-mode-browser-test`

**Setup:** Switch to "Convert" mode in browser.

**Assertions:**
- [ ] `toolbar.ocrScan` is **disabled/grayed**.
- [ ] PDF/A validate and convert tools are visible (status depends on wiring).

### Test: `mode-toolbar-convert-mode-tauri` 🖥️

**Setup:** Switch to "Convert" mode in Tauri.

**Assertions:**
- [ ] `toolbar.ocrScan` is **enabled**.

---

## 3. AllToolsPanel — Per-Runtime Tool Availability

### Test: `all-tools-panel-browser-test`

**Setup:** Open the "All Tools" panel (⌘+Shift+A or left-panel icon) in browser.

**Assertions:**
- [ ] Tools under "Read" tab: zoom, fullscreen, search are **clickable**.
- [ ] Tools under "Edit" tab: all tools show **grayed out** with "(not yet available)" label.
- [ ] Tools under "Organize" tab: delete, rotate left, rotate right are **grayed out**.
- [ ] Tools under "Protect" tab: redact is **grayed out**.
- [ ] Tools under "Convert" tab: OCR scan is **grayed out**.

### Test: `all-tools-panel-tauri` 🖥️

**Setup:** Open the "All Tools" panel in Tauri.

**Assertions:**
- [ ] Organize tab: delete, rotate left, rotate right are **clickable**.
- [ ] Protect tab: redact is **clickable**.
- [ ] Convert tab: OCR scan is **clickable**.

---

## 4. Export Dialog — Format Gating

### Test: `export-dialog-formats-browser-test`

**Setup:** Open the export dialog (File → Export) in browser.

**Assertions:**
- [ ] Only **PDF** format is available in the dropdown.
- [ ] PNG, JPEG, Compressed PDF, DOCX, XLSX, PPTX are **NOT visible**.

### Test: `export-dialog-formats-tauri` 🖥️

**Setup:** Open the export dialog in Tauri.

**Assertions:**
- [ ] All seven formats are visible: PDF, Compressed PDF, PNG, JPEG, DOCX, XLSX, PPTX.

---

## 5. Annotation Canvas Interaction

### Test: `canvas-annotation-highlight-browser-test`

**Setup:** Open a PDF with text in browser, switch to Review mode, select highlight tool.

**Actions:**
1. Select text on the page.
2. Click the floating highlight button (if available).

**Assertions:**
- [ ] Highlight annotation is created successfully.
- [ ] No error toast appears.

### Test: `canvas-annotation-underline-browser-test-disabled`

**Setup:** Open a PDF in browser, switch to Review mode.

**Assertions:**
- [ ] The underline annotation tool button is **not present** in the toolbar.
- [ ] Attempting to trigger underline via keyboard shortcut does nothing.

### Test: `canvas-annotation-rectangle-tauri` 🖥️

**Setup:** Open a PDF in Tauri, switch to Review mode, select rectangle tool.

**Actions:**
1. Drag to draw a rectangle on the canvas.

**Assertions:**
- [ ] Rectangle annotation is created successfully.
- [ ] Annotation appears in the comments panel.

---

## 6. Forms Mode

### Test: `forms-mode-browser-test`

**Setup:** Open a PDF with form fields in browser, switch to "Forms" mode.

**Assertions:**
- [ ] Form field navigation does **not** appear (no fields detected).
- [ ] All form tools (text field, checkbox, radio, signature, etc.) are **disabled/grayed**.

### Test: `forms-mode-tauri` 🖥️

**Setup:** Open a PDF with form fields in Tauri, switch to "Forms" mode.

**Assertions:**
- [ ] Form field navigation appears with detected fields.
- [ ] Signature tool is **enabled**.

---

## 7. TopBar — Save Gating

### Test: `topbar-save-browser-test`

**Setup:** Open a PDF in browser, make an edit (e.g. add highlight).

**Assertions:**
- [ ] Save button is **disabled**.
- [ ] "Save" keyboard shortcut (⌘+S) triggers browser native save dialog or is ignored.

### Test: `topbar-save-tauri` 🖥️

**Setup:** Open a PDF in Tauri, make an edit.

**Assertions:**
- [ ] Save button is **enabled**.
- [ ] Clicking save writes to the original file path.

---

## 8. Regression Tests

### Test: `regression-universal-tools-always-enabled`

**Setup:** Open any PDF in either runtime.

**Assertions:**
- [ ] Zoom in, zoom out, fullscreen, and search are always **enabled** in Read mode.
- [ ] These tools never appear disabled due to runtime checks.

### Test: `regression-no-fake-success-toasts`

**Setup:** In browser, click a disabled tool (e.g. delete page in organize mode).

**Assertions:**
- [ ] Nothing happens — no task is pushed to the task queue.
- [ ] No success or error toast appears.
- [ ] The button is visibly disabled (cursor-default, opacity-40).

---

## 9. Accessibility

### Test: `a11y-disabled-tools-aria`

**Setup:** Inspect any disabled tool button with browser dev tools.

**Assertions:**
- [ ] Disabled buttons have `disabled` attribute.
- [ ] Disabled buttons have `aria-label` describing the tool.
- [ ] Title/tooltip indicates "not yet available" for disabled tools.

---

## 10. Test Data

### Fixture: `tests/fixtures/sample-text.pdf`
- 3 pages
- Contains selectable text
- No form fields
- No annotations
- No signatures

### Fixture: `tests/fixtures/sample-form.pdf`
- 1 page
- Contains AcroForm text field and checkbox

### Fixture: `tests/fixtures/sample-signed.pdf`
- 1 page
- Contains a digital signature

---

*End of specification.*
