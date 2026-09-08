# UI register

**Generated** by `scripts/quality/ui-register.mjs`. Do not edit by hand — the
`quality:ui-register` job regenerates it and fails the build when this file has
drifted from the code. That gate is the value: `WORKFLOW_READINESS_MATRIX.md`
was written by hand in May 2026, was wrong within weeks, and still read as
authoritative in September.

This is the one place to look before claiming that the editor can do something,
before enabling a tile, and before writing a release note. It is current by
construction; memory is not.

## Summary

- **170** affordances found in the shell.
- **108** `wired`
- **20** `UNTESTED`
- **0** `NO CI JOB`
- **16** `NO ACTION`
- **26** `UNREACHABLE`

| state | meaning |
|---|---|
| `wired` | the app renders it, activating it reaches a command or a named UI effect, a test names it, and a CI job runs that test |
| `UNTESTED` | it works as far as the code shows, and nothing proves it |
| `NO CI JOB` | a test names it and no job executes that test — this reads as tested and is not |
| `NO ACTION` | the user can see it and activating it reaches nothing |
| `UNREACHABLE` | the component that renders it is never rendered by the running app |

`NO ACTION` and `UNREACHABLE` are the two that must not exist. Every one of them
is recorded in `docs/ui_register_exceptions.json` with a reason, and `--gate`
fails on a new one that is not.

## How an affordance is resolved

The walker starts at the data that defines each control — `TOOLS_BY_MODE`, the
`RailButton` tags, the `panel === '…'` blocks, `useCommands`, the shortcut sheet —
and follows its handler through calls, imports, JSX callback props and child
components to the `invoke('…')` it reaches. A tile carries a `fulfilledBy` claim
naming the affordance that performs its tool; the claim is checked, not believed.

## All-tools tiles

| affordance | state | reaches | seen at | proven by |
|---|---|---|---|---|
| `toolbar.accessibility` | `NO ACTION` | — | `src/viewer/components/AllToolsPanel.tsx:185` | — |
| `toolbar.addText` | `NO ACTION` | — | `src/viewer/components/AllToolsPanel.tsx:132` | — |
| `toolbar.autoDetect` | `NO ACTION` | — | `src/viewer/components/AllToolsPanel.tsx:166` | — |
| `toolbar.bookmarks` | `wired` | `button:v3-outline-item (wired)` | `src/viewer/components/AllToolsPanel.tsx:111` | `tests/i18n-key-parity.test.ts` (source-grep) · `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `toolbar.checkbox` | `NO ACTION` | — | `src/viewer/components/AllToolsPanel.tsx:170` | — |
| `toolbar.comment` | `UNTESTED` | `rail-tool:comment (UNTESTED)` | `src/viewer/components/AllToolsPanel.tsx:122` | — |
| `toolbar.compare` | `NO ACTION` | — | `src/viewer/components/AllToolsPanel.tsx:184` | — |
| `toolbar.compress` | `wired` | `compress_pdf` | `src/viewer/components/AllToolsPanel.tsx:194` | `tests/viewer-capability-entry-points.test.ts` (source-grep) · `tests/viewer-export-dialog.test.ts` (source-grep) · `tests/viewer-export-save-routing.test.ts` (source-grep) · +1 |
| `toolbar.deletePage` | `wired` | `delete_pages` | `src/viewer/components/AllToolsPanel.tsx:155` | `src/viewer/tools/__tests__/runtime-tool-wiring.test.ts` (unit) · `tests/viewer-fullscreen-toggle.test.ts` (source-grep) · `tests/viewer-mode-toolbar.test.ts` (source-grep) · +2 |
| `toolbar.editText` | `UNTESTED` | `panel:edit (UNTESTED)` | `src/viewer/components/AllToolsPanel.tsx:131` | — |
| `toolbar.exportPdf` | `UNTESTED` | `button:export-btn (UNTESTED)` | `src/viewer/components/AllToolsPanel.tsx:191` | — |
| `toolbar.freeDraw` | `wired` | `rail-tool:draw (wired)` | `src/viewer/components/AllToolsPanel.tsx:125` | `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `toolbar.fullscreen` | `wired` | `palette:fullscreen (wired)` | `src/viewer/components/AllToolsPanel.tsx:106` | `src/viewer/tools/__tests__/runtime-tool-wiring.test.ts` (unit) · `tests/viewer-fullscreen-shortcut.test.ts` (source-grep) · `tests/viewer-fullscreen-toggle.test.ts` (source-grep) |
| `toolbar.headerFooter` | `NO ACTION` | — | `src/viewer/components/AllToolsPanel.tsx:139` | — |
| `toolbar.hide` | `NO ACTION` | — | `src/viewer/components/AllToolsPanel.tsx:181` | — |
| `toolbar.highlight` | `UNTESTED` | `rail-tool:highlight (UNTESTED)` | `src/viewer/components/AllToolsPanel.tsx:116` | — |
| `toolbar.image` | `NO ACTION` | — | `src/viewer/components/AllToolsPanel.tsx:135` | — |
| `toolbar.initials` | `NO ACTION` | — | `src/viewer/components/AllToolsPanel.tsx:149` | — |
| `toolbar.insertPage` | `wired` | `insert_pdf_at` | `src/viewer/components/AllToolsPanel.tsx:154` | `tests/viewer-organize-assembly.test.ts` (source-grep) |
| `toolbar.invoice` | `wired` | `extract_invoice_data`, `validate_invoice` | `src/viewer/components/AllToolsPanel.tsx:199` | `tests/i18n-key-parity.test.ts` (source-grep) · `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `toolbar.link` | `NO ACTION` | — | `src/viewer/components/AllToolsPanel.tsx:136` | — |
| `toolbar.merge` | `wired` | `merge_pdfs` | `src/viewer/components/AllToolsPanel.tsx:161` | `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `toolbar.metadata` | `wired` | `set_metadata` | `src/viewer/components/AllToolsPanel.tsx:143` | `tests/i18n-key-parity.test.ts` (source-grep) · `tests/viewer-capability-entry-points.test.ts` (source-grep) · `tests/viewer-metadata-editor.test.ts` (source-grep) |
| `toolbar.note` | `NO ACTION` | — | `src/viewer/components/AllToolsPanel.tsx:121` | — |
| `toolbar.ocrScan` | `wired` | `frontend_log`, `get_ocr_status`, `render_page`, `run_paddle_ocr` | `src/viewer/components/AllToolsPanel.tsx:195` | `src/lib/__tests__/commandBridge.test.ts` (source-grep) · `src/platform/engine/tauri/__tests__/tauri-render-engine.test.ts` (unit) · `src/viewer/tools/__tests__/runtime-tool-wiring.test.ts` (unit) · +2 |
| `toolbar.pan` | `UNTESTED` | `rail-tool:hand (UNTESTED)` | `src/viewer/components/AllToolsPanel.tsx:101` | — |
| `toolbar.password` | `wired` | `decrypt_pdf`, `encrypt_pdf` | `src/viewer/components/AllToolsPanel.tsx:176` | `tests/viewer-capability-entry-points.test.ts` (source-grep) · `tests/viewer-right-context-panel.test.ts` (source-grep) |
| `toolbar.pdfa` | `wired` | `convert_to_pdfa`, `validate_pdfa` | `src/viewer/components/AllToolsPanel.tsx:198` | `src/viewer/state/__tests__/fallbackNotices.test.ts` (source-grep) · `tests/i18n-key-parity.test.ts` (source-grep) · `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `toolbar.permissions` | `NO ACTION` | — | `src/viewer/components/AllToolsPanel.tsx:177` | — |
| `toolbar.radioButton` | `NO ACTION` | — | `src/viewer/components/AllToolsPanel.tsx:171` | — |
| `toolbar.readAloud` | `wired` | `native_tts_speak`, `native_tts_stop` | `src/viewer/components/AllToolsPanel.tsx:110` | `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `toolbar.redact` | `wired` | `panel:redact (UNTESTED)` | `src/viewer/components/AllToolsPanel.tsx:180` | `src/viewer/tools/__tests__/runtime-tool-wiring.test.ts` (unit) · `tests/viewer-ocr-ui.test.ts` (source-grep) · `tests/viewer-redaction-text-selection.test.ts` (source-grep) |
| `toolbar.rotateLeft` | `wired` | `rotate_pages` | `src/viewer/components/AllToolsPanel.tsx:156` | `src/viewer/tools/__tests__/runtime-tool-wiring.test.ts` (unit) · `tests/viewer-mode-toolbar.test.ts` (source-grep) · `tests/viewer-organize-batch.test.ts` (source-grep) · +2 |
| `toolbar.rotateRight` | `wired` | `rotate_pages` | `src/viewer/components/AllToolsPanel.tsx:157` | `src/viewer/tools/__tests__/runtime-tool-wiring.test.ts` (unit) · `tests/viewer-fullscreen-toggle.test.ts` (source-grep) · `tests/viewer-mode-toolbar.test.ts` (source-grep) · +3 |
| `toolbar.searchText` | `wired` | `button:search-btn (UNTESTED)` | `src/viewer/components/AllToolsPanel.tsx:109` | `src/viewer/tools/__tests__/runtime-tool-wiring.test.ts` (unit) · `tests/viewer-fullscreen-toggle.test.ts` (source-grep) · `tests/viewer-mode-toolbar.test.ts` (source-grep) |
| `toolbar.select` | `UNTESTED` | `rail-tool:select (UNTESTED)` | `src/viewer/components/AllToolsPanel.tsx:100` | — |
| `toolbar.signature` | `wired` | `sign_pdf`, `verify_signatures` | `src/viewer/components/AllToolsPanel.tsx:148` | `tests/viewer-capability-entry-points.test.ts` (source-grep) · `tests/viewer-signatures-ui.test.ts` (source-grep) · `tests/viewer-v3-sign-panel.test.ts` (source-grep) |
| `toolbar.split` | `wired` | `split_into_pages`, `split_pdf` | `src/viewer/components/AllToolsPanel.tsx:160` | `tests/viewer-capability-entry-points.test.ts` (source-grep) · `tests/viewer-organize-assembly.test.ts` (source-grep) |
| `toolbar.stamp` | `NO ACTION` | — | `src/viewer/components/AllToolsPanel.tsx:126` | — |
| `toolbar.strikethrough` | `UNTESTED` | `button:annotation-tool-strikeout (wired)` | `src/viewer/components/AllToolsPanel.tsx:118` | — |
| `toolbar.textField` | `NO ACTION` | — | `src/viewer/components/AllToolsPanel.tsx:169` | — |
| `toolbar.toPdf` | `NO ACTION` | — | `src/viewer/components/AllToolsPanel.tsx:190` | — |
| `toolbar.underline` | `UNTESTED` | `button:annotation-tool-underline (wired)` | `src/viewer/components/AllToolsPanel.tsx:117` | — |
| `toolbar.watermark` | `wired` | `add_watermark` | `src/viewer/components/AllToolsPanel.tsx:140` | `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `toolbar.zoomIn` | `wired` | `button:zoom-in-btn (wired)` | `src/viewer/components/AllToolsPanel.tsx:104` | `src/viewer/tools/__tests__/runtime-tool-wiring.test.ts` (unit) · `tests/viewer-fullscreen-toggle.test.ts` (source-grep) · `tests/viewer-mode-toolbar.test.ts` (source-grep) · +1 |
| `toolbar.zoomOut` | `wired` | `button:zoom-out-btn (wired)` | `src/viewer/components/AllToolsPanel.tsx:105` | `src/viewer/tools/__tests__/runtime-tool-wiring.test.ts` (unit) · `tests/viewer-fullscreen-toggle.test.ts` (source-grep) · `tests/viewer-mode-toolbar.test.ts` (source-grep) · +1 |

## Right-hand panels

| affordance | state | reaches | seen at | proven by |
|---|---|---|---|---|
| `compress` | `wired` | `compress_pdf` | `src/viewer/v3/EditorV3Shell.tsx:2402` | `tests/viewer-capability-entry-points.test.ts` (source-grep) · `tests/viewer-export-dialog.test.ts` (source-grep) · `tests/viewer-export-save-routing.test.ts` (source-grep) · +1 |
| `convert` | `wired` | `frontend_log`, `get_ocr_status`, `render_page`, `run_paddle_ocr` | `src/viewer/v3/EditorV3Shell.tsx:2282` | `src/lib/__tests__/commandBridge.test.ts` (source-grep) · `src/platform/engine/tauri/__tests__/tauri-render-engine.test.ts` (unit) · `tests/viewer-ocr-progress.test.ts` (source-grep) · +1 |
| `edit` | `UNTESTED` | `onShowToast → showToast`, `onShowToast → onShowToast` | `src/viewer/v3/EditorV3Shell.tsx:2202` | — |
| `esign` | `wired` | `sign_pdf`, `verify_signatures` | `src/viewer/v3/EditorV3Shell.tsx:2324` | `tests/viewer-capability-entry-points.test.ts` (source-grep) · `tests/viewer-signatures-ui.test.ts` (source-grep) · `tests/viewer-v3-sign-panel.test.ts` (source-grep) |
| `invoice` | `wired` | `extract_invoice_data`, `validate_invoice` | `src/viewer/v3/EditorV3Shell.tsx:2542` | `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `merge` | `wired` | `merge_pdfs` | `src/viewer/v3/EditorV3Shell.tsx:2481` | `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `metadata` | `wired` | `set_metadata` | `src/viewer/v3/EditorV3Shell.tsx:2532` | `tests/viewer-capability-entry-points.test.ts` (source-grep) · `tests/viewer-metadata-editor.test.ts` (source-grep) |
| `pdfa` | `wired` | `convert_to_pdfa`, `validate_pdfa` | `src/viewer/v3/EditorV3Shell.tsx:2522` | `src/viewer/state/__tests__/fallbackNotices.test.ts` (source-grep) · `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `protect` | `wired` | `decrypt_pdf`, `encrypt_pdf` | `src/viewer/v3/EditorV3Shell.tsx:2377` | `tests/viewer-capability-entry-points.test.ts` (source-grep) · `tests/viewer-ocr-ui.test.ts` (source-grep) · `tests/viewer-right-context-panel.test.ts` (source-grep) · +1 |
| `redact` | `UNTESTED` | `setRedactSearchQuery`, `handleTextRedactSearch` | `src/viewer/v3/EditorV3Shell.tsx:2552` | — |
| `split` | `wired` | `split_into_pages`, `split_pdf` | `src/viewer/v3/EditorV3Shell.tsx:2430` | `tests/viewer-capability-entry-points.test.ts` (source-grep) · `tests/viewer-organize-assembly.test.ts` (source-grep) |
| `tools` | `wired` | `add_attachment_dialog`, `get_ocr_status`, `list_attachments`, `remember_file_access`, `remove_attachment`, `render_page`, `run_paddle_ocr`, `save_attachment_dialog`, `save_pdf`, `save_pdf_as_dialog` | `src/viewer/v3/EditorV3Shell.tsx:2106` | `src/lib/__tests__/commandBridge.test.ts` (source-grep) · `src/platform/engine/tauri/__tests__/tauri-render-engine.test.ts` (unit) · `tests/viewer-capability-entry-points.test.ts` (source-grep) · +10 |
| `watermark` | `wired` | `add_watermark` | `src/viewer/v3/EditorV3Shell.tsx:2394` | `tests/viewer-capability-entry-points.test.ts` (source-grep) |

## Mode tabs

| affordance | state | reaches | seen at | proven by |
|---|---|---|---|---|
| `convert` | `wired` | `onPanelToggle → togglePanel`, `togglePanel` | `src/viewer/v3/EditorV3Shell.tsx:1542` | `tests/viewer-ocr-ui.test.ts` (source-grep) |
| `edit` | `UNTESTED` | `onPanelToggle → togglePanel`, `togglePanel` | `src/viewer/v3/EditorV3Shell.tsx:1542` | — |
| `esign` | `wired` | `onPanelToggle → togglePanel`, `togglePanel` | `src/viewer/v3/EditorV3Shell.tsx:1542` | `tests/viewer-capability-entry-points.test.ts` (source-grep) · `tests/viewer-v3-sign-panel.test.ts` (source-grep) |
| `tools` | `wired` | `onPanelToggle → togglePanel`, `togglePanel` | `src/viewer/v3/EditorV3Shell.tsx:1542` | `tests/viewer-v3-workflow-regressions.test.ts` (source-grep) |

## Left rail tools

| affordance | state | reaches | seen at | proven by |
|---|---|---|---|---|
| `comment` | `UNTESTED` | `onAnnotationToolChange → setActiveAnnotationTool`, `onAnnotationToolChange → onAnnotationToolChange` | `src/viewer/v3/EditorV3Shell.tsx:2653` | — |
| `draw` | `wired` | `setPassiveRailTool`, `onModeChange → inline` | `src/viewer/v3/EditorV3Shell.tsx:2655` | `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `hand` | `UNTESTED` | `onAnnotationToolChange → setActiveAnnotationTool`, `onAnnotationToolChange → onAnnotationToolChange` | `src/viewer/v3/EditorV3Shell.tsx:2651` | — |
| `highlight` | `UNTESTED` | `setPassiveRailTool`, `onModeChange → inline` | `src/viewer/v3/EditorV3Shell.tsx:2654` | — |
| `more` | `UNTESTED` | `setMoreToolsOpen` | `src/viewer/v3/EditorV3Shell.tsx:2659` | — |
| `select` | `UNTESTED` | `onAnnotationToolChange → setActiveAnnotationTool`, `onAnnotationToolChange → onAnnotationToolChange` | `src/viewer/v3/EditorV3Shell.tsx:2650` | — |
| `sign` | `UNTESTED` | `setPassiveRailTool`, `onAnnotationToolChange → setActiveAnnotationTool` | `src/viewer/v3/EditorV3Shell.tsx:2657` | — |
| `text` | `UNTESTED` | `setPassiveRailTool`, `onAnnotationToolChange → setActiveAnnotationTool` | `src/viewer/v3/EditorV3Shell.tsx:2656` | — |

## Command palette

| affordance | state | reaches | seen at | proven by |
|---|---|---|---|---|
| `check-for-updates` | `wired` | `onCheckForUpdates` | `src/viewer/hooks/useCommands.ts:118` | `tests/startup-update-check-gate.test.ts` (source-grep) · `tests/viewer-auto-update.test.ts` (source-grep) |
| `close-document` | `wired` | `closeDocument`, `setCurrentFilePath` | `src/viewer/hooks/useCommands.ts:90` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) · `tests/viewer-unsaved-changes-dialog.test.ts` (source-grep) |
| `export` | `wired` | `setExportOpen` | `src/viewer/hooks/useCommands.ts:76` | `tests/crash-fixture-classification.test.ts` (unit) · `tests/viewer-command-palette-expansion.test.ts` (source-grep) · `tests/viewer-error-center-hardening.test.ts` (unit) · +5 |
| `first-page` | `wired` | `setPageIndex` | `src/viewer/hooks/useCommands.ts:60` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) |
| `fullscreen` | `wired` | `Fullscreen API` | `src/viewer/hooks/useCommands.ts:80` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) |
| `last-page` | `wired` | `setPageIndex` | `src/viewer/hooks/useCommands.ts:62` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) |
| `mode-convert` | `wired` | `setMode` | `src/viewer/hooks/useCommands.ts:115` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) |
| `mode-edit` | `wired` | `setMode` | `src/viewer/hooks/useCommands.ts:105` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) |
| `mode-forms` | `wired` | `setMode` | `src/viewer/hooks/useCommands.ts:111` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) |
| `mode-organize` | `wired` | `setMode` | `src/viewer/hooks/useCommands.ts:109` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) |
| `mode-protect` | `wired` | `setMode` | `src/viewer/hooks/useCommands.ts:113` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) |
| `mode-read` | `wired` | `setMode` | `src/viewer/hooks/useCommands.ts:101` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) |
| `mode-review` | `wired` | `setMode` | `src/viewer/hooks/useCommands.ts:103` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) |
| `mode-sign` | `wired` | `setMode` | `src/viewer/hooks/useCommands.ts:107` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) |
| `next-page` | `wired` | `setPageIndex` | `src/viewer/hooks/useCommands.ts:58` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) |
| `open-settings` | `wired` | `setSettingsOpen` | `src/viewer/hooks/useCommands.ts:120` | `tests/startup-update-check-gate.test.ts` (source-grep) |
| `prev-page` | `wired` | `setPageIndex` | `src/viewer/hooks/useCommands.ts:56` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) |
| `print` | `wired` | `window.print` | `src/viewer/hooks/useCommands.ts:88` | `tests/viewer-print.test.ts` (source-grep) |
| `save-as` | `wired` | `remember_file_access`, `save_pdf_as_dialog` | `src/viewer/hooks/useCommands.ts:74` | `tests/viewer-release-readiness.test.ts` (source-grep) · `tests/viewer-save-as.test.ts` (source-grep) · `tests/viewer-text-save-reopen.test.ts` (source-grep) |
| `shortcut-sheet` | `wired` | `setShortcutSheetOpen` | `src/viewer/hooks/useCommands.ts:86` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) |
| `toggle-rail` | `wired` | `setLeftRailOpen` | `src/viewer/hooks/useCommands.ts:78` | `tests/viewer-left-rail-toggle.test.ts` (source-grep) |
| `zoom-100` | `wired` | `setZoom` | `src/viewer/hooks/useCommands.ts:69` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) |
| `zoom-200` | `wired` | `setZoom` | `src/viewer/hooks/useCommands.ts:71` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) |
| `zoom-in` | `wired` | `setZoom` | `src/viewer/hooks/useCommands.ts:65` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) |
| `zoom-out` | `wired` | `setZoom` | `src/viewer/hooks/useCommands.ts:67` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) |

## Buttons with a test id

| affordance | state | reaches | seen at | proven by |
|---|---|---|---|---|
| `add-attachment-btn` | `UNREACHABLE` | `onAddAttachment → onAddAttachment` | `src/viewer/components/LeftNavRail.tsx:386` | — |
| `annotation-tool-attachment` | `wired` | `add_attachment_dialog` | `src/viewer/v3/EditorV3Shell.tsx:2665` | `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `annotation-tool-strikeout` | `wired` | `onMoreTool → handleMoreTool`, `handleMoreTool` | `src/viewer/v3/EditorV3Shell.tsx:2663` | `tests/viewer-annotation-toolbar.test.ts` (source-grep) · `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `annotation-tool-underline` | `wired` | `onMoreTool → handleMoreTool`, `handleMoreTool` | `src/viewer/v3/EditorV3Shell.tsx:2664` | `tests/viewer-annotation-toolbar.test.ts` (source-grep) · `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `batch-delete-btn` | `wired` | `delete_pages` | `src/viewer/components/OrganizeGrid.tsx:494` | `tests/viewer-mode-toolbar.test.ts` (source-grep) · `tests/viewer-organize-batch.test.ts` (source-grep) · `tests/viewer-organize-grid.test.ts` (source-grep) |
| `batch-rotate-left-btn` | `wired` | `rotate_pages` | `src/viewer/components/OrganizeGrid.tsx:474` | `tests/viewer-organize-batch.test.ts` (source-grep) · `tests/viewer-organize-grid.test.ts` (source-grep) |
| `batch-rotate-right-btn` | `wired` | `rotate_pages` | `src/viewer/components/OrganizeGrid.tsx:484` | `tests/viewer-organize-batch.test.ts` (source-grep) · `tests/viewer-organize-grid.test.ts` (source-grep) |
| `clear-selection-btn` | `wired` | `clearSelection`, `setSelectedPages` | `src/viewer/components/OrganizeGrid.tsx:503` | `tests/viewer-organize-batch.test.ts` (source-grep) |
| `export-btn` | `UNTESTED` | `onOpenExport → inline`, `onOpenExport → onOpenExport` | `src/viewer/v3/EditorV3Shell.tsx:1720` | — |
| `extract-attachment-btn` | `UNREACHABLE` | `onExtractAttachment → onExtractAttachment` | `src/viewer/components/LeftNavRail.tsx:417` | — |
| `field-row` | `UNREACHABLE` | `onPageSelect → onPageSelect` | `src/viewer/components/LeftNavRail.tsx:556` | `tests/viewer-fields-panel-navigation.test.ts` (source-grep) |
| `floating-page-indicator` | `wired` | `onOpenGoToPage → inline`, `setGoToPageOpen` | `src/viewer/v3/EditorV3Shell.tsx:928` | `tests/e2e/sign-panel.spec.ts` (e2e) · `tests/e2e/visual-e2e-beta-blockers.spec.ts` (e2e) · `tests/viewer-floating-page-indicator.test.ts` (source-grep) · +5 |
| `layer-visibility-btn` | `UNREACHABLE` | `onToggleLayer → onToggleLayer` | `src/viewer/components/LeftNavRail.tsx:492` | — |
| `nav-next-page-btn` | `UNREACHABLE` | `onNextPage` | `src/viewer/components/LeftNavRail.tsx:976` | `tests/viewer-sidebar-nav.test.ts` (source-grep) |
| `nav-prev-page-btn` | `UNREACHABLE` | `onPrevPage` | `src/viewer/components/LeftNavRail.tsx:953` | `tests/viewer-sidebar-nav.test.ts` (source-grep) |
| `organize-apply-order-btn` | `wired` | `reorder_pages` | `src/viewer/components/OrganizeGrid.tsx:591` | `tests/viewer-organize-drag-reorder.test.ts` (source-grep) · `tests/viewer-organize-pending-order.test.ts` (source-grep) · `tests/viewer-thumbnail-reorder.test.ts` (source-grep) |
| `organize-cancel-order-btn` | `wired` | `handleCancelOrder`, `setPendingOrder` | `src/viewer/components/OrganizeGrid.tsx:584` | `tests/viewer-organize-pending-order.test.ts` (source-grep) |
| `organize-combine-btn` | `wired` | `append_pdf` | `src/viewer/components/OrganizeGrid.tsx:539` | `tests/viewer-organize-assembly.test.ts` (source-grep) |
| `organize-export-selection-btn` | `wired` | `extract_pages_to_file` | `src/viewer/components/OrganizeGrid.tsx:444` | `tests/viewer-organize-assembly.test.ts` (source-grep) |
| `organize-insert-before-btn` | `wired` | `insert_pdf_at` | `src/viewer/components/OrganizeGrid.tsx:434` | `tests/viewer-organize-assembly.test.ts` (source-grep) |
| `organize-merge-pdf-btn` | `wired` | `append_pdf` | `src/viewer/components/OrganizeGrid.tsx:529` | `tests/viewer-organize-assembly.test.ts` (source-grep) |
| `organize-move-left-btn` | `wired` | `moveSelectedPage`, `handleLocalReorder` | `src/viewer/components/OrganizeGrid.tsx:454` | `tests/viewer-v3-workflow-regressions.test.ts` (source-grep) |
| `organize-move-right-btn` | `wired` | `moveSelectedPage`, `handleLocalReorder` | `src/viewer/components/OrganizeGrid.tsx:464` | `tests/viewer-v3-workflow-regressions.test.ts` (source-grep) |
| `organize-split-btn` | `wired` | `split_into_pages` | `src/viewer/components/OrganizeGrid.tsx:550` | `tests/viewer-organize-assembly.test.ts` (source-grep) |
| `organize-split-range-btn` | `wired` | `split_pdf` | `src/viewer/components/OrganizeGrid.tsx:562` | `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `outline-item` | `UNREACHABLE` | `setExpanded`, `onPageSelect → onPageSelect` | `src/viewer/components/LeftNavRail.tsx:235` | `tests/viewer-bookmarks-active-highlight.test.ts` (source-grep) · `tests/viewer-bookmarks-panel.test.ts` (source-grep) |
| `read-aloud-btn` | `wired` | `native_tts_speak`, `native_tts_stop` | `src/viewer/v3/EditorV3Shell.tsx:1636` | `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `redo-btn` | `wired` | `onRedo → inline`, `onRedo → onRedo` | `src/viewer/v3/EditorV3Shell.tsx:1623` | `tests/viewer-undo-engine.test.ts` (source-grep) |
| `remove-attachment-btn` | `UNREACHABLE` | `native file dialog`, `isTauriRuntime` | `src/viewer/components/LeftNavRail.tsx:425` | — |
| `save-as-btn` | `wired` | `onSaveAs → handleRuntimeSaveAs`, `onSaveAs → onSaveAs` | `src/viewer/v3/EditorV3Shell.tsx:1721` | `tests/viewer-save-as.test.ts` (source-grep) |
| `save-btn` | `wired` | `save_pdf` | `src/viewer/v3/EditorV3Shell.tsx:1640` | `src/lib/__tests__/commandBridge.test.ts` (source-grep) · `tests/viewer-export-dialog.test.ts` (source-grep) · `tests/viewer-export-save-routing.test.ts` (source-grep) · +6 |
| `search-btn` | `UNTESTED` | `onOpenSearch → inline`, `onOpenSearch → onOpenSearch` | `src/viewer/v3/EditorV3Shell.tsx:1628` | — |
| `select-all-btn` | `wired` | `selectAll`, `setSelectedPages` | `src/viewer/components/OrganizeGrid.tsx:519` | `tests/viewer-organize-batch.test.ts` (source-grep) · `tests/viewer-organize-keyboard.test.ts` (source-grep) |
| `sign-cert-pick` | `wired` | `chooseCertificate`, `native file dialog` | `src/viewer/v3/EditorV3Shell.tsx:3282` | `tests/e2e/sign-panel.spec.ts` (e2e) · `tests/viewer-v3-sign-panel.test.ts` (source-grep) |
| `sign-with-certificate` | `wired` | `sign_pdf` | `src/viewer/v3/EditorV3Shell.tsx:3315` | `tests/e2e/sign-panel.spec.ts` (e2e) · `tests/viewer-signatures-ui.test.ts` (source-grep) · `tests/viewer-v3-sign-panel.test.ts` (source-grep) |
| `text-left-bold-btn` | `UNREACHABLE` | `onFormatCommand → onFormatCommand` | `src/viewer/components/LeftNavRail.tsx:711` | — |
| `text-left-italic-btn` | `UNREACHABLE` | `onFormatCommand → onFormatCommand` | `src/viewer/components/LeftNavRail.tsx:721` | — |
| `text-left-underline-btn` | `UNREACHABLE` | `onFormatCommand → onFormatCommand` | `src/viewer/components/LeftNavRail.tsx:731` | — |
| `undo-btn` | `wired` | `onUndo → inline`, `onUndo → onUndo` | `src/viewer/v3/EditorV3Shell.tsx:1620` | `tests/viewer-undo-engine.test.ts` (source-grep) |
| `v3-outline-item` | `wired` | `onPageSelect → onNavigatePage`, `onNavigatePage → navigateToPage` | `src/viewer/v3/EditorV3Shell.tsx:2778` | `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `zoom-fit-width-btn` | `wired` | `onZoomChange → setZoom`, `setZoom` | `src/viewer/v3/EditorV3Shell.tsx:970` | `tests/viewer-zoom-controls.test.ts` (source-grep) |
| `zoom-in-btn` | `wired` | `onZoomChange → setZoom`, `setZoom` | `src/viewer/v3/EditorV3Shell.tsx:961` | `tests/viewer-mode-toolbar.test.ts` (source-grep) |
| `zoom-out-btn` | `wired` | `onZoomChange → setZoom`, `setZoom` | `src/viewer/v3/EditorV3Shell.tsx:942` | `tests/viewer-mode-toolbar.test.ts` (source-grep) |
| `zoom-reset-btn` | `wired` | `setZoomPresetsOpen` | `src/viewer/v3/EditorV3Shell.tsx:951` | `tests/viewer-floating-page-indicator.test.ts` (source-grep) · `tests/viewer-left-rail-toggle.test.ts` (source-grep) · `tests/viewer-organize-grid.test.ts` (source-grep) · +5 |

## Advertised keyboard shortcuts

| affordance | state | reaches | seen at | proven by |
|---|---|---|---|---|
| `closeDialog (Escape)` | `wired` | `keydown Escape` | `src/viewer/components/ShortcutSheet.tsx:79` | `tests/viewer-command-palette-recent.test.ts` (source-grep) · `tests/viewer-export-dialog-escape.test.ts` (source-grep) · `tests/viewer-form-overlay.test.ts` (source-grep) · +8 |
| `commandPalette (⌘K / Ctrl+K)` | `wired` | `keydown k` | `src/viewer/components/ShortcutSheet.tsx:66` | `tests/viewer-goto-page.test.ts` (source-grep) · `tests/viewer-keyboard-nav.test.ts` (source-grep) · `tests/viewer-mode-keys.test.ts` (source-grep) · +3 |
| `export (⌘E / Ctrl+E)` | `wired` | `keydown e` | `src/viewer/components/ShortcutSheet.tsx:65` | `tests/viewer-export-shortcut.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) |
| `firstLastPage (Home / End)` | `wired` | `keydown Home, End` | `src/viewer/components/ShortcutSheet.tsx:48` | `tests/viewer-arrow-page-nav.test.ts` (source-grep) · `tests/viewer-keyboard-nav.test.ts` (source-grep) · `tests/viewer-page-navigation.test.ts` (source-grep) |
| `fitZoom (⌘/Ctrl + Scroll)` | `wired` | `keydown wheel` | `src/viewer/components/ShortcutSheet.tsx:58` | `tests/viewer-scroll-to-zoom.test.ts` (source-grep) |
| `goToPage (⌘G / Ctrl+G)` | `wired` | `keydown g` | `src/viewer/components/ShortcutSheet.tsx:49` | `tests/viewer-floating-page-indicator.test.ts` (source-grep) · `tests/viewer-goto-page.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) |
| `prevNextPage (← / →)` | `wired` | `keydown ArrowLeft, ArrowRight` | `src/viewer/components/ShortcutSheet.tsx:46` | `tests/viewer-arrow-page-nav.test.ts` (source-grep) · `tests/viewer-keyboard-nav.test.ts` (source-grep) · `tests/viewer-mode-keys.test.ts` (source-grep) · +3 |
| `prevNextPage (PageUp / PageDown)` | `wired` | `keydown PageUp, PageDown` | `src/viewer/components/ShortcutSheet.tsx:47` | `tests/viewer-arrow-page-nav.test.ts` (source-grep) · `tests/viewer-keyboard-nav.test.ts` (source-grep) · `tests/viewer-page-navigation.test.ts` (source-grep) |
| `save (⌘S / Ctrl+S)` | `wired` | `keydown s` | `src/viewer/components/ShortcutSheet.tsx:64` | `tests/viewer-export-shortcut.test.ts` (source-grep) · `tests/viewer-goto-page.test.ts` (source-grep) · `tests/viewer-page-input-enter.test.ts` (source-grep) · +3 |
| `switchMode (1 – 8)` | `wired` | `keydown 1, 8` | `src/viewer/components/ShortcutSheet.tsx:73` | `tests/viewer-mode-keys.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) · `tests/viewer-zoom-shortcuts.test.ts` (source-grep) |
| `thisOverview (⌘? / Ctrl+?)` | `wired` | `keydown ?` | `src/viewer/components/ShortcutSheet.tsx:80` | `tests/viewer-release-readiness.test.ts` (source-grep) · `tests/viewer-shortcut-sheet.test.ts` (source-grep) |
| `toggleFullscreen (F11 / ⌘⇧F)` | `wired` | `keydown F11, f` | `src/viewer/components/ShortcutSheet.tsx:72` | `tests/e2e/smoke-shell.spec.ts` (e2e) · `tests/viewer-fullscreen-shortcut.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) · +1 |
| `zoom100 (⌘0 / Ctrl+0)` | `wired` | `keydown 0` | `src/viewer/components/ShortcutSheet.tsx:57` | `tests/viewer-zoom-reset-click.test.ts` (source-grep) · `tests/viewer-zoom-shortcuts.test.ts` (source-grep) |
| `zoomIn (⌘= / Ctrl+=)` | `wired` | `keydown =` | `src/viewer/components/ShortcutSheet.tsx:55` | `tests/viewer-goto-page.test.ts` (source-grep) · `tests/viewer-scroll-to-zoom.test.ts` (source-grep) · `tests/viewer-zoom-presets.test.ts` (source-grep) · +2 |
| `zoomOut (⌘− / Ctrl+−)` | `wired` | `keydown -` | `src/viewer/components/ShortcutSheet.tsx:56` | `tests/viewer-zoom-shortcuts.test.ts` (source-grep) |

## LeftNavRail panels

| affordance | state | reaches | seen at | proven by |
|---|---|---|---|---|
| `attachments` | `UNREACHABLE` | — | `src/viewer/components/LeftNavRail.tsx:91` | — |
| `bookmarks` | `UNREACHABLE` | — | `src/viewer/components/LeftNavRail.tsx:89` | `tests/viewer-bookmarks-active-highlight.test.ts` (source-grep) · `tests/viewer-bookmarks-panel.test.ts` (source-grep) |
| `comments` | `UNREACHABLE` | — | `src/viewer/components/LeftNavRail.tsx:90` | `tests/viewer-comment-badge-grouping.test.ts` (source-grep) |
| `fields` | `UNREACHABLE` | — | `src/viewer/components/LeftNavRail.tsx:93` | `tests/viewer-fields-panel-navigation.test.ts` (source-grep) |
| `format` | `UNREACHABLE` | — | `src/viewer/components/LeftNavRail.tsx:94` | — |
| `layers` | `UNREACHABLE` | — | `src/viewer/components/LeftNavRail.tsx:92` | — |
| `thumbnails` | `UNREACHABLE` | — | `src/viewer/components/LeftNavRail.tsx:88` | `tests/viewer-navigation-stability.test.ts` (source-grep) |

## ModeSwitcher tabs

| affordance | state | reaches | seen at | proven by |
|---|---|---|---|---|
| `convert` | `UNREACHABLE` | `onModeChange` | `src/viewer/components/ModeSwitcher.tsx:74` | — |
| `edit` | `UNREACHABLE` | `onModeChange` | `src/viewer/components/ModeSwitcher.tsx:73` | — |
| `forms` | `UNREACHABLE` | `onModeChange` | `src/viewer/components/ModeSwitcher.tsx:96` | — |
| `organize` | `UNREACHABLE` | `onModeChange` | `src/viewer/components/ModeSwitcher.tsx:95` | — |
| `protect` | `UNREACHABLE` | `onModeChange` | `src/viewer/components/ModeSwitcher.tsx:97` | — |
| `read` | `UNREACHABLE` | `onModeChange` | `src/viewer/components/ModeSwitcher.tsx:72` | — |
| `review` | `UNREACHABLE` | `onModeChange` | `src/viewer/components/ModeSwitcher.tsx:85` | — |
| `sign` | `UNREACHABLE` | `onModeChange` | `src/viewer/components/ModeSwitcher.tsx:75` | — |

## Components nothing renders

Loaded or not, no live file puts these on screen. They are counted here
because a dead panel keeps reading as the product — and because two of the
descriptions this register replaces were written from them.

| file | exports | lines |
|---|---|---|
| `src/viewer/components/RightContextPanel.tsx` | RightContextPanel | 2170 |
| `src/viewer/components/LeftNavRail.tsx` | LeftNavRail | 1024 |
| `src/viewer/components/ModeToolbar.tsx` | ModeToolbar | 499 |
| `src/viewer/components/TopBar.tsx` | TopBar | 441 |
| `src/viewer/components/ModeSwitcher.tsx` | ModeSwitcher, ModeContextualAction, ModeContextualCta, ModeContextualSep | 349 |
| `src/viewer/components/SignaturePanel.tsx` | SignaturePanel | 283 |
| `src/viewer/components/ObjectSelectionOverlay.tsx` | ObjectSelectionOverlay | 249 |
| `src/viewer/components/WelcomeScreen.tsx` | WelcomeScreen | 229 |
| `src/viewer/components/BusyStateOverlay.tsx` | BusyStateOverlay | 147 |
| `src/viewer/components/EmptyStates.tsx` | EmptyStateNoDocument, EmptyStateNoAnnotations, EmptyStateNoIssues, EmptyStateNoResults | 146 |
| `src/viewer/ViewerSidePanels.tsx` | ViewerSidePanels | 140 |
| `src/viewer/components/IssuePanel.tsx` | IssuePanel | 128 |
| `src/viewer/components/RecoveryDialog.tsx` | RecoveryDialog | 115 |
| `src/viewer/components/SearchPanel.tsx` | SearchPanel | 115 |
| `src/viewer/components/TimelinePanel.tsx` | TimelinePanel | 93 |
| `src/viewer/WelcomeSection.tsx` | WelcomeSection | 92 |

