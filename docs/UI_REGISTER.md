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

- **167** affordances found in the shell.
- **141** `wired`
- **15** `UNTESTED`
- **0** `NO CI JOB`
- **11** `NO ACTION`
- **0** `UNREACHABLE`

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
| `toolbar.accessibility` | `NO ACTION` | — | `src/viewer/components/AllToolsPanel.tsx:183` | — |
| `toolbar.addText` | `wired` | `button:insert-text-box-btn (wired)` | `src/viewer/components/AllToolsPanel.tsx:130` | `src/viewer/v3/__tests__/placementTiles.test.ts` (unit) |
| `toolbar.autoDetect` | `NO ACTION` | — | `src/viewer/components/AllToolsPanel.tsx:164` | — |
| `toolbar.bookmarks` | `wired` | `button:v3-outline-item (wired)` | `src/viewer/components/AllToolsPanel.tsx:109` | `tests/i18n-key-parity.test.ts` (source-grep) · `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `toolbar.checkbox` | `NO ACTION` | — | `src/viewer/components/AllToolsPanel.tsx:168` | — |
| `toolbar.comment` | `UNTESTED` | `rail-tool:comment (UNTESTED)` | `src/viewer/components/AllToolsPanel.tsx:120` | — |
| `toolbar.compare` | `NO ACTION` | — | `src/viewer/components/AllToolsPanel.tsx:182` | — |
| `toolbar.compress` | `wired` | `compress_pdf` | `src/viewer/components/AllToolsPanel.tsx:192` | `tests/ui-walk-build.test.ts` (source-grep) · `tests/viewer-capability-entry-points.test.ts` (source-grep) · `tests/viewer-export-dialog.test.ts` (source-grep) · +2 |
| `toolbar.deletePage` | `wired` | `delete_pages` | `src/viewer/components/AllToolsPanel.tsx:153` | `src/viewer/tools/__tests__/runtime-tool-wiring.test.ts` (unit) · `tests/ui-walk-build.test.ts` (source-grep) · `tests/viewer-fullscreen-toggle.test.ts` (source-grep) · +3 |
| `toolbar.editText` | `wired` | `delete_page_image`, `frontend_log`, `list_page_images`, `pick_image_dialog`, `replace_annotation_image`, `replace_page_image`, `update_annotation_color` | `src/viewer/components/AllToolsPanel.tsx:129` | `src/lib/__tests__/commandBridge.test.ts` (source-grep) · `src/viewer/v3/__tests__/imagePick.test.ts` (unit) · `tests/ui-walk-build.test.ts` (source-grep) · +1 |
| `toolbar.exportPdf` | `UNTESTED` | `button:export-btn (UNTESTED)` | `src/viewer/components/AllToolsPanel.tsx:189` | — |
| `toolbar.freeDraw` | `wired` | `rail-tool:draw (wired)` | `src/viewer/components/AllToolsPanel.tsx:123` | `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `toolbar.fullscreen` | `wired` | `palette:fullscreen (wired)` | `src/viewer/components/AllToolsPanel.tsx:104` | `src/viewer/tools/__tests__/runtime-tool-wiring.test.ts` (unit) · `tests/viewer-fullscreen-shortcut.test.ts` (source-grep) · `tests/viewer-fullscreen-toggle.test.ts` (source-grep) |
| `toolbar.headerFooter` | `NO ACTION` | — | `src/viewer/components/AllToolsPanel.tsx:137` | — |
| `toolbar.hide` | `NO ACTION` | — | `src/viewer/components/AllToolsPanel.tsx:179` | — |
| `toolbar.highlight` | `UNTESTED` | `rail-tool:highlight (UNTESTED)` | `src/viewer/components/AllToolsPanel.tsx:114` | — |
| `toolbar.image` | `wired` | `button:place-image-btn (wired)` | `src/viewer/components/AllToolsPanel.tsx:133` | `src/viewer/v3/__tests__/placementTiles.test.ts` (unit) |
| `toolbar.initials` | `wired` | `button:add-initials-btn (wired)` | `src/viewer/components/AllToolsPanel.tsx:147` | `src/viewer/v3/__tests__/placementTiles.test.ts` (unit) |
| `toolbar.insertPage` | `wired` | `insert_pdf_at` | `src/viewer/components/AllToolsPanel.tsx:152` | `tests/viewer-organize-assembly.test.ts` (source-grep) |
| `toolbar.invoice` | `wired` | `extract_invoice_data`, `validate_invoice` | `src/viewer/components/AllToolsPanel.tsx:197` | `tests/i18n-key-parity.test.ts` (source-grep) · `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `toolbar.link` | `NO ACTION` | — | `src/viewer/components/AllToolsPanel.tsx:134` | — |
| `toolbar.merge` | `wired` | `merge_pdfs` | `src/viewer/components/AllToolsPanel.tsx:159` | `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `toolbar.metadata` | `wired` | `set_metadata` | `src/viewer/components/AllToolsPanel.tsx:141` | `tests/i18n-key-parity.test.ts` (source-grep) · `tests/viewer-capability-entry-points.test.ts` (source-grep) · `tests/viewer-metadata-editor.test.ts` (source-grep) |
| `toolbar.note` | `wired` | `rail-tool:comment (UNTESTED)` | `src/viewer/components/AllToolsPanel.tsx:119` | `src/viewer/v3/__tests__/placementTiles.test.ts` (unit) |
| `toolbar.ocrScan` | `wired` | `panel:convert (wired)` | `src/viewer/components/AllToolsPanel.tsx:193` | `src/viewer/tools/__tests__/runtime-tool-wiring.test.ts` (unit) · `tests/viewer-ocr-ui.test.ts` (source-grep) |
| `toolbar.pan` | `UNTESTED` | `rail-tool:hand (wired)` | `src/viewer/components/AllToolsPanel.tsx:99` | — |
| `toolbar.password` | `wired` | `decrypt_pdf`, `encrypt_pdf`, `password_removal_state` | `src/viewer/components/AllToolsPanel.tsx:174` | `tests/remove-password-form.test.ts` (source-grep) · `tests/viewer-capability-entry-points.test.ts` (source-grep) · `tests/viewer-right-context-panel.test.ts` (source-grep) |
| `toolbar.pdfa` | `wired` | `convert_to_pdfa`, `validate_pdfa` | `src/viewer/components/AllToolsPanel.tsx:196` | `src/viewer/state/__tests__/fallbackNotices.test.ts` (source-grep) · `tests/i18n-key-parity.test.ts` (source-grep) · `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `toolbar.permissions` | `NO ACTION` | — | `src/viewer/components/AllToolsPanel.tsx:175` | — |
| `toolbar.radioButton` | `NO ACTION` | — | `src/viewer/components/AllToolsPanel.tsx:169` | — |
| `toolbar.readAloud` | `wired` | `native_tts_speak`, `native_tts_stop` | `src/viewer/components/AllToolsPanel.tsx:108` | `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `toolbar.redact` | `wired` | `panel:redact (UNTESTED)` | `src/viewer/components/AllToolsPanel.tsx:178` | `src/viewer/tools/__tests__/runtime-tool-wiring.test.ts` (unit) · `tests/viewer-ocr-ui.test.ts` (source-grep) · `tests/viewer-redaction-text-selection.test.ts` (source-grep) |
| `toolbar.rotateLeft` | `wired` | `rotate_pages` | `src/viewer/components/AllToolsPanel.tsx:154` | `src/viewer/tools/__tests__/runtime-tool-wiring.test.ts` (unit) · `tests/ui-walk-build.test.ts` (source-grep) · `tests/viewer-mode-toolbar.test.ts` (source-grep) · +3 |
| `toolbar.rotateRight` | `wired` | `rotate_pages` | `src/viewer/components/AllToolsPanel.tsx:155` | `src/viewer/tools/__tests__/runtime-tool-wiring.test.ts` (unit) · `tests/ui-walk-build.test.ts` (source-grep) · `tests/viewer-fullscreen-toggle.test.ts` (source-grep) · +4 |
| `toolbar.searchText` | `wired` | `button:search-btn (wired)` | `src/viewer/components/AllToolsPanel.tsx:107` | `src/viewer/tools/__tests__/runtime-tool-wiring.test.ts` (unit) · `tests/viewer-fullscreen-toggle.test.ts` (source-grep) · `tests/viewer-mode-toolbar.test.ts` (source-grep) |
| `toolbar.select` | `UNTESTED` | `rail-tool:select (UNTESTED)` | `src/viewer/components/AllToolsPanel.tsx:98` | — |
| `toolbar.signature` | `wired` | `sign_pdf`, `verify_signatures` | `src/viewer/components/AllToolsPanel.tsx:146` | `tests/ui-walk-build.test.ts` (source-grep) · `tests/viewer-capability-entry-points.test.ts` (source-grep) · `tests/viewer-signatures-ui.test.ts` (source-grep) · +1 |
| `toolbar.split` | `wired` | `split_into_pages`, `split_pdf` | `src/viewer/components/AllToolsPanel.tsx:158` | `tests/viewer-capability-entry-points.test.ts` (source-grep) · `tests/viewer-organize-assembly.test.ts` (source-grep) |
| `toolbar.stamp` | `wired` | `button:place-stamp-btn (wired)` | `src/viewer/components/AllToolsPanel.tsx:124` | `src/viewer/v3/__tests__/placementTiles.test.ts` (unit) |
| `toolbar.strikethrough` | `UNTESTED` | `button:annotation-tool-strikeout (wired)` | `src/viewer/components/AllToolsPanel.tsx:116` | — |
| `toolbar.textField` | `NO ACTION` | — | `src/viewer/components/AllToolsPanel.tsx:167` | — |
| `toolbar.toPdf` | `NO ACTION` | — | `src/viewer/components/AllToolsPanel.tsx:188` | — |
| `toolbar.underline` | `UNTESTED` | `button:annotation-tool-underline (wired)` | `src/viewer/components/AllToolsPanel.tsx:115` | — |
| `toolbar.watermark` | `wired` | `add_watermark` | `src/viewer/components/AllToolsPanel.tsx:138` | `tests/ui-walk-build.test.ts` (source-grep) · `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `toolbar.zoomIn` | `wired` | `button:zoom-in-btn (wired)` | `src/viewer/components/AllToolsPanel.tsx:102` | `src/viewer/tools/__tests__/runtime-tool-wiring.test.ts` (unit) · `tests/viewer-fullscreen-toggle.test.ts` (source-grep) · `tests/viewer-mode-toolbar.test.ts` (source-grep) · +1 |
| `toolbar.zoomOut` | `wired` | `button:zoom-out-btn (wired)` | `src/viewer/components/AllToolsPanel.tsx:103` | `src/viewer/tools/__tests__/runtime-tool-wiring.test.ts` (unit) · `tests/viewer-fullscreen-toggle.test.ts` (source-grep) · `tests/viewer-mode-toolbar.test.ts` (source-grep) · +1 |

## Right-hand panels

| affordance | state | reaches | seen at | proven by |
|---|---|---|---|---|
| `compress` | `wired` | `compress_pdf` | `src/viewer/v3/EditorV3Shell.tsx:2725` | `tests/all-tools-reachable.test.ts` (source-grep) · `tests/ui-walk-build.test.ts` (source-grep) · `tests/viewer-capability-entry-points.test.ts` (source-grep) · +3 |
| `convert` | `wired` | `<ToolRow>`, `onOpenExport → inline` | `src/viewer/v3/EditorV3Shell.tsx:2587` | `tests/viewer-capability-entry-points.test.ts` (source-grep) · `tests/viewer-ocr-ui.test.ts` (source-grep) |
| `edit` | `wired` | `delete_page_image`, `frontend_log`, `list_page_images`, `pick_image_dialog`, `replace_annotation_image`, `replace_page_image`, `update_annotation_color` | `src/viewer/v3/EditorV3Shell.tsx:2480` | `src/lib/__tests__/commandBridge.test.ts` (source-grep) · `src/viewer/v3/__tests__/imagePick.test.ts` (unit) · `tests/all-tools-reachable.test.ts` (source-grep) · +2 |
| `esign` | `wired` | `sign_pdf`, `verify_signatures` | `src/viewer/v3/EditorV3Shell.tsx:2650` | `tests/ui-walk-build.test.ts` (source-grep) · `tests/usage-rights-warning.test.ts` (source-grep) · `tests/viewer-capability-entry-points.test.ts` (source-grep) · +2 |
| `invoice` | `wired` | `extract_invoice_data`, `validate_invoice` | `src/viewer/v3/EditorV3Shell.tsx:2875` | `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `merge` | `wired` | `merge_pdfs` | `src/viewer/v3/EditorV3Shell.tsx:2814` | `tests/ui-walk-build.test.ts` (source-grep) · `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `metadata` | `wired` | `set_metadata` | `src/viewer/v3/EditorV3Shell.tsx:2865` | `tests/viewer-capability-entry-points.test.ts` (source-grep) · `tests/viewer-metadata-editor.test.ts` (source-grep) |
| `pdfa` | `wired` | `convert_to_pdfa`, `validate_pdfa` | `src/viewer/v3/EditorV3Shell.tsx:2855` | `src/viewer/state/__tests__/fallbackNotices.test.ts` (source-grep) · `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `protect` | `wired` | `decrypt_pdf`, `encrypt_pdf`, `password_removal_state` | `src/viewer/v3/EditorV3Shell.tsx:2700` | `tests/remove-password-form.test.ts` (source-grep) · `tests/viewer-capability-entry-points.test.ts` (source-grep) · `tests/viewer-ocr-ui.test.ts` (source-grep) · +2 |
| `redact` | `UNTESTED` | `setRedactSearchQuery`, `handleTextRedactSearch` | `src/viewer/v3/EditorV3Shell.tsx:2885` | — |
| `split` | `wired` | `split_into_pages`, `split_pdf` | `src/viewer/v3/EditorV3Shell.tsx:2763` | `tests/ui-walk-build.test.ts` (source-grep) · `tests/viewer-capability-entry-points.test.ts` (source-grep) · `tests/viewer-organize-assembly.test.ts` (source-grep) |
| `tools` | `wired` | `add_attachment_dialog`, `frontend_log`, `list_attachments`, `list_page_images`, `remember_file_access`, `remove_attachment`, `save_attachment_dialog`, `save_pdf` | `src/viewer/v3/EditorV3Shell.tsx:2340` | `src/lib/__tests__/commandBridge.test.ts` (source-grep) · `tests/e2e/fault-guard.spec.ts` (e2e) · `tests/fault-guard.test.ts` (e2e) · +10 |
| `watermark` | `wired` | `add_watermark` | `src/viewer/v3/EditorV3Shell.tsx:2717` | `tests/ui-walk-build.test.ts` (source-grep) · `tests/viewer-capability-entry-points.test.ts` (source-grep) |

## Mode tabs

| affordance | state | reaches | seen at | proven by |
|---|---|---|---|---|
| `convert` | `wired` | `onPanelToggle → togglePanel`, `togglePanel` | `src/viewer/v3/EditorV3Shell.tsx:1730` | `tests/viewer-ocr-ui.test.ts` (source-grep) |
| `edit` | `wired` | `onPanelToggle → togglePanel`, `togglePanel` | `src/viewer/v3/EditorV3Shell.tsx:1730` | `tests/all-tools-reachable.test.ts` (source-grep) · `tests/ui-walk-build.test.ts` (source-grep) |
| `esign` | `wired` | `onPanelToggle → togglePanel`, `togglePanel` | `src/viewer/v3/EditorV3Shell.tsx:1730` | `tests/usage-rights-warning.test.ts` (source-grep) · `tests/viewer-v3-sign-panel.test.ts` (source-grep) |
| `tools` | `wired` | `onPanelToggle → togglePanel`, `togglePanel` | `src/viewer/v3/EditorV3Shell.tsx:1730` | `tests/ui-walk-build.test.ts` (source-grep) · `tests/viewer-v3-workflow-regressions.test.ts` (source-grep) |

## Left rail tools

| affordance | state | reaches | seen at | proven by |
|---|---|---|---|---|
| `comment` | `UNTESTED` | `onAnnotationToolChange → setActiveAnnotationTool`, `onAnnotationToolChange → onAnnotationToolChange` | `src/viewer/v3/EditorV3Shell.tsx:3011` | — |
| `draw` | `wired` | `setPassiveRailTool`, `onModeChange → inline` | `src/viewer/v3/EditorV3Shell.tsx:3013` | `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `hand` | `wired` | `onAnnotationToolChange → setActiveAnnotationTool`, `onAnnotationToolChange → onAnnotationToolChange` | `src/viewer/v3/EditorV3Shell.tsx:3009` | `tests/ui-walk-build.test.ts` (source-grep) |
| `highlight` | `UNTESTED` | `setPassiveRailTool`, `onModeChange → inline` | `src/viewer/v3/EditorV3Shell.tsx:3012` | — |
| `more` | `UNTESTED` | `setMoreToolsOpen` | `src/viewer/v3/EditorV3Shell.tsx:3017` | — |
| `select` | `UNTESTED` | `onAnnotationToolChange → setActiveAnnotationTool`, `onAnnotationToolChange → onAnnotationToolChange` | `src/viewer/v3/EditorV3Shell.tsx:3008` | — |
| `sign` | `UNTESTED` | `setPassiveRailTool`, `onAnnotationToolChange → setActiveAnnotationTool` | `src/viewer/v3/EditorV3Shell.tsx:3015` | — |
| `text` | `UNTESTED` | `setPassiveRailTool`, `onAnnotationToolChange → setActiveAnnotationTool` | `src/viewer/v3/EditorV3Shell.tsx:3014` | — |

## Command palette

| affordance | state | reaches | seen at | proven by |
|---|---|---|---|---|
| `check-for-updates` | `wired` | `onCheckForUpdates` | `src/viewer/hooks/useCommands.ts:130` | `tests/startup-update-check-gate.test.ts` (source-grep) · `tests/viewer-auto-update.test.ts` (source-grep) |
| `close-document` | `wired` | `closeDocumentWithGuard`, `closeDocument` | `src/viewer/hooks/useCommands.ts:98` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) · `tests/viewer-unsaved-changes-dialog.test.ts` (source-grep) |
| `export` | `wired` | `setExportOpen` | `src/viewer/hooks/useCommands.ts:84` | `tests/crash-fixture-classification.test.ts` (unit) · `tests/e2e/a11y-core-journeys.spec.ts` (e2e) · `tests/e2e/contrast.spec.ts` (e2e) · +8 |
| `first-page` | `wired` | `setPageIndex` | `src/viewer/hooks/useCommands.ts:68` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) |
| `fullscreen` | `wired` | `Fullscreen API` | `src/viewer/hooks/useCommands.ts:88` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) |
| `last-page` | `wired` | `setPageIndex` | `src/viewer/hooks/useCommands.ts:70` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) |
| `mode-convert` | `wired` | `setMode` | `src/viewer/hooks/useCommands.ts:127` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) |
| `mode-edit` | `wired` | `setMode` | `src/viewer/hooks/useCommands.ts:117` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) |
| `mode-forms` | `wired` | `setMode` | `src/viewer/hooks/useCommands.ts:123` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) |
| `mode-organize` | `wired` | `setMode` | `src/viewer/hooks/useCommands.ts:121` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) |
| `mode-protect` | `wired` | `setMode` | `src/viewer/hooks/useCommands.ts:125` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) |
| `mode-read` | `wired` | `setMode` | `src/viewer/hooks/useCommands.ts:113` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) |
| `mode-review` | `wired` | `setMode` | `src/viewer/hooks/useCommands.ts:115` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) |
| `mode-sign` | `wired` | `setMode` | `src/viewer/hooks/useCommands.ts:119` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) |
| `next-page` | `wired` | `setPageIndex` | `src/viewer/hooks/useCommands.ts:66` | `src/viewer/components/__tests__/commandPalette.options.test.ts` (unit) · `tests/viewer-command-palette-expansion.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) |
| `open-settings` | `wired` | `setSettingsOpen` | `src/viewer/hooks/useCommands.ts:132` | `tests/startup-update-check-gate.test.ts` (source-grep) |
| `prev-page` | `wired` | `setPageIndex` | `src/viewer/hooks/useCommands.ts:64` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) |
| `print` | `wired` | `print_document` | `src/viewer/hooks/useCommands.ts:96` | `src/viewer/state/__tests__/printFlow.test.ts` (unit) · `tests/viewer-print.test.ts` (source-grep) |
| `save-as` | `wired` | `frontend_log`, `remember_file_access` | `src/viewer/hooks/useCommands.ts:82` | `src/lib/__tests__/commandBridge.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) · `tests/viewer-save-as.test.ts` (source-grep) |
| `shortcut-sheet` | `wired` | `setShortcutSheetOpen` | `src/viewer/hooks/useCommands.ts:94` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) |
| `toggle-rail` | `wired` | `setLeftRailOpen` | `src/viewer/hooks/useCommands.ts:86` | `tests/viewer-left-rail-toggle.test.ts` (source-grep) |
| `zoom-100` | `wired` | `setZoom`, `setZoomState` | `src/viewer/hooks/useCommands.ts:77` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) |
| `zoom-200` | `wired` | `setZoom`, `setZoomState` | `src/viewer/hooks/useCommands.ts:79` | `tests/viewer-command-palette-expansion.test.ts` (source-grep) |
| `zoom-in` | `wired` | `setZoom`, `setZoomState` | `src/viewer/hooks/useCommands.ts:73` | `src/viewer/components/__tests__/commandPalette.options.test.ts` (unit) · `tests/ui-walk-build.test.ts` (source-grep) · `tests/viewer-command-palette-expansion.test.ts` (source-grep) · +1 |
| `zoom-out` | `wired` | `setZoom`, `setZoomState` | `src/viewer/hooks/useCommands.ts:75` | `src/viewer/components/__tests__/commandPalette.options.test.ts` (unit) · `tests/viewer-command-palette-expansion.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) |

## Buttons with a test id

| affordance | state | reaches | seen at | proven by |
|---|---|---|---|---|
| `add-attachment-btn` | `wired` | `add_attachment_dialog` | `src/viewer/v3/EditorV3Shell.tsx:2441` | `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `add-initials-btn` | `wired` | `openSignDialog`, `signDialogFor` | `src/viewer/v3/EditorV3Shell.tsx:2674` | `src/viewer/v3/__tests__/placementControls.test.ts` (unit) |
| `add-signature-btn` | `wired` | `openSignDialog`, `signDialogFor` | `src/viewer/v3/EditorV3Shell.tsx:2673` | `src/viewer/v3/__tests__/placementControls.test.ts` (unit) |
| `annotation-tool-attachment` | `wired` | `add_attachment_dialog` | `src/viewer/v3/EditorV3Shell.tsx:3024` | `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `annotation-tool-rectangle` | `wired` | `onMoreTool → handleMoreTool`, `handleMoreTool` | `src/viewer/v3/EditorV3Shell.tsx:3023` | `tests/viewer-annotation-toolbar.test.ts` (source-grep) |
| `annotation-tool-strikeout` | `wired` | `onMoreTool → handleMoreTool`, `handleMoreTool` | `src/viewer/v3/EditorV3Shell.tsx:3021` | `tests/viewer-annotation-toolbar.test.ts` (source-grep) · `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `annotation-tool-underline` | `wired` | `onMoreTool → handleMoreTool`, `handleMoreTool` | `src/viewer/v3/EditorV3Shell.tsx:3022` | `tests/viewer-annotation-toolbar.test.ts` (source-grep) · `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `batch-delete-btn` | `wired` | `delete_pages` | `src/viewer/components/OrganizeGrid.tsx:494` | `tests/ui-walk-build.test.ts` (source-grep) · `tests/viewer-mode-toolbar.test.ts` (source-grep) · `tests/viewer-organize-batch.test.ts` (source-grep) · +1 |
| `batch-rotate-left-btn` | `wired` | `rotate_pages` | `src/viewer/components/OrganizeGrid.tsx:474` | `tests/ui-walk-build.test.ts` (source-grep) · `tests/viewer-organize-batch.test.ts` (source-grep) · `tests/viewer-organize-grid.test.ts` (source-grep) |
| `batch-rotate-right-btn` | `wired` | `rotate_pages` | `src/viewer/components/OrganizeGrid.tsx:484` | `tests/ui-walk-build.test.ts` (source-grep) · `tests/viewer-organize-batch.test.ts` (source-grep) · `tests/viewer-organize-grid.test.ts` (source-grep) |
| `bb-next-page-btn` | `wired` | `onNavigatePage → navigateToPage`, `onNavigatePage → onNavigatePage` | `src/viewer/v3/EditorV3Shell.tsx:1121` | `tests/e2e/a11y-core-journeys.spec.ts` (e2e) |
| `bb-prev-page-btn` | `wired` | `onNavigatePage → navigateToPage`, `onNavigatePage → onNavigatePage` | `src/viewer/v3/EditorV3Shell.tsx:1108` | `tests/e2e/a11y-core-journeys.spec.ts` (e2e) |
| `clear-selection-btn` | `wired` | `clearSelection`, `setSelectedPages` | `src/viewer/components/OrganizeGrid.tsx:503` | `tests/viewer-organize-batch.test.ts` (source-grep) |
| `comment-edit-confirm-btn` | `wired` | `list_page_images` | `src/viewer/v3/EditorV3Shell.tsx:1441` | `tests/viewer-annotation-write-update-delete.test.ts` (source-grep) |
| `convert-pdfa-btn` | `wired` | `convert_to_pdfa` | `src/viewer/v3/EditorV3Shell.tsx:3399` | `src/viewer/state/__tests__/fallbackNotices.test.ts` (source-grep) · `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `delete-comment-btn` | `wired` | `list_page_images` | `src/viewer/v3/EditorV3Shell.tsx:2394` | `tests/viewer-annotation-write-update-delete.test.ts` (source-grep) · `tests/viewer-forms-write.test.ts` (source-grep) · `tests/viewer-review-author-color.test.ts` (source-grep) |
| `delete-selected-annotation-btn` | `wired` | `delete_page_image`, `frontend_log`, `list_page_images` | `src/viewer/v3/EditorV3Shell.tsx:2581` | `src/lib/__tests__/commandBridge.test.ts` (source-grep) · `src/viewer/__tests__/pageImages.test.ts` (unit) · `src/viewer/v3/__tests__/placementControls.test.ts` (unit) · +1 |
| `edit-comment-btn` | `wired` | `onEditComment → inline`, `setNoteDraft` | `src/viewer/v3/EditorV3Shell.tsx:2391` | `tests/viewer-annotation-write-update-delete.test.ts` (source-grep) · `tests/viewer-forms-write.test.ts` (source-grep) · `tests/viewer-review-author-color.test.ts` (source-grep) |
| `edit-font-size-larger` | `wired` | `onFormatCommand → handleFormatCommand`, `onFormatCommand → onFormatCommand` | `src/viewer/v3/EditorV3Shell.tsx:2499` | `src/viewer/text/__tests__/fontSizeStep.test.ts` (unit) |
| `edit-font-size-smaller` | `wired` | `onFormatCommand → handleFormatCommand`, `onFormatCommand → onFormatCommand` | `src/viewer/v3/EditorV3Shell.tsx:2497` | `src/viewer/text/__tests__/fontSizeStep.test.ts` (unit) |
| `edit-text-box-btn` | `wired` | `onEditAnnotationText → inline`, `setTextOverlayDraft` | `src/viewer/v3/EditorV3Shell.tsx:2576` | `src/viewer/v3/__tests__/placementControls.test.ts` (unit) · `tests/ui-walk-build.test.ts` (source-grep) |
| `export-btn` | `UNTESTED` | `onOpenExport → inline`, `onOpenExport → onOpenExport` | `src/viewer/v3/EditorV3Shell.tsx:1912` | — |
| `flatten-form-btn` | `wired` | `onFlattenForm → handleFlattenForm`, `onFlattenForm → onFlattenForm` | `src/viewer/v3/EditorV3Shell.tsx:2413` | `src/viewer/state/__tests__/flattenForm.test.ts` (unit) |
| `floating-page-indicator` | `wired` | `onOpenGoToPage → inline`, `setGoToPageOpen` | `src/viewer/v3/EditorV3Shell.tsx:1113` | `tests/e2e/a11y-core-journeys.spec.ts` (e2e) · `tests/e2e/sign-panel.spec.ts` (e2e) · `tests/e2e/visual-e2e-beta-blockers.spec.ts` (e2e) · +6 |
| `insert-text-box-btn` | `wired` | `onArm → inline`, `armFromControl` | `src/viewer/v3/EditorV3Shell.tsx:2511` | `src/viewer/v3/__tests__/placementControls.test.ts` (unit) |
| `more-menu-btn` | `wired` | `onMoreToggle → inline`, `setMoreOpen` | `src/viewer/v3/EditorV3Shell.tsx:1835` | `tests/e2e/a11y-core-journeys.spec.ts` (e2e) · `tests/e2e/contrast.spec.ts` (e2e) |
| `organize-apply-order-btn` | `wired` | `reorder_pages` | `src/viewer/components/OrganizeGrid.tsx:591` | `tests/viewer-organize-drag-reorder.test.ts` (source-grep) · `tests/viewer-organize-pending-order.test.ts` (source-grep) · `tests/viewer-thumbnail-reorder.test.ts` (source-grep) |
| `organize-cancel-order-btn` | `wired` | `handleCancelOrder`, `setPendingOrder` | `src/viewer/components/OrganizeGrid.tsx:584` | `tests/viewer-organize-pending-order.test.ts` (source-grep) |
| `organize-combine-btn` | `wired` | `append_pdf` | `src/viewer/components/OrganizeGrid.tsx:539` | `tests/ui-walk-build.test.ts` (source-grep) · `tests/viewer-organize-assembly.test.ts` (source-grep) |
| `organize-export-selection-btn` | `wired` | `extract_pages_to_file` | `src/viewer/components/OrganizeGrid.tsx:444` | `tests/viewer-organize-assembly.test.ts` (source-grep) |
| `organize-insert-before-btn` | `wired` | `insert_pdf_at` | `src/viewer/components/OrganizeGrid.tsx:434` | `tests/viewer-organize-assembly.test.ts` (source-grep) |
| `organize-merge-pdf-btn` | `wired` | `append_pdf` | `src/viewer/components/OrganizeGrid.tsx:529` | `tests/ui-walk-build.test.ts` (source-grep) · `tests/viewer-organize-assembly.test.ts` (source-grep) |
| `organize-move-left-btn` | `wired` | `moveSelectedPage`, `handleLocalReorder` | `src/viewer/components/OrganizeGrid.tsx:454` | `tests/viewer-v3-workflow-regressions.test.ts` (source-grep) |
| `organize-move-right-btn` | `wired` | `moveSelectedPage`, `handleLocalReorder` | `src/viewer/components/OrganizeGrid.tsx:464` | `tests/viewer-v3-workflow-regressions.test.ts` (source-grep) |
| `organize-split-btn` | `wired` | `split_into_pages` | `src/viewer/components/OrganizeGrid.tsx:550` | `tests/viewer-organize-assembly.test.ts` (source-grep) |
| `organize-split-range-btn` | `wired` | `split_pdf` | `src/viewer/components/OrganizeGrid.tsx:562` | `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `place-image-btn` | `wired` | `onArm → inline`, `armFromControl` | `src/viewer/v3/EditorV3Shell.tsx:2512` | `src/viewer/v3/__tests__/placementControls.test.ts` (unit) |
| `place-stamp-btn` | `wired` | `onArm → inline`, `armFromControl` | `src/viewer/v3/EditorV3Shell.tsx:2525` | `src/viewer/v3/__tests__/placementControls.test.ts` (unit) |
| `read-aloud-btn` | `wired` | `native_tts_speak`, `native_tts_stop` | `src/viewer/v3/EditorV3Shell.tsx:1826` | `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `redact-metadata-btn` | `wired` | `onRedactMetadata → handleRedactMetadata`, `onRedactMetadata → onRedactMetadata` | `src/viewer/v3/EditorV3Shell.tsx:2937` | `tests/viewer-redaction-ui.test.ts` (source-grep) |
| `redo-btn` | `wired` | `onRedo → inline`, `onRedo → onRedo` | `src/viewer/v3/EditorV3Shell.tsx:1812` | `src/viewer/hooks/__tests__/useUndoRedo.backend.test.ts` (unit) |
| `replace-image-btn` | `wired` | `delete_page_image`, `frontend_log`, `list_page_images`, `pick_image_dialog`, `replace_annotation_image`, `replace_page_image` | `src/viewer/v3/EditorV3Shell.tsx:2579` | `src/lib/__tests__/commandBridge.test.ts` (source-grep) · `src/viewer/__tests__/pageImages.test.ts` (unit) · `src/viewer/v3/__tests__/imagePick.test.ts` (unit) · +2 |
| `save-as-btn` | `wired` | `handleSaveAsClick`, `onSaveAs → handleRuntimeSaveAs` | `src/viewer/v3/EditorV3Shell.tsx:1913` | `tests/e2e/a11y-core-journeys.spec.ts` (e2e) · `tests/share-menu-save-as-reports-failure.test.ts` (source-grep) · `tests/viewer-save-as.test.ts` (source-grep) |
| `save-btn` | `wired` | `save_pdf` | `src/viewer/v3/EditorV3Shell.tsx:1830` | `src/lib/__tests__/commandBridge.test.ts` (source-grep) · `tests/e2e/fault-guard.spec.ts` (e2e) · `tests/fault-guard.test.ts` (e2e) · +8 |
| `search-btn` | `wired` | `onOpenSearch → inline`, `onOpenSearch → onOpenSearch` | `src/viewer/v3/EditorV3Shell.tsx:1817` | `tests/e2e/a11y-core-journeys.spec.ts` (e2e) · `tests/e2e/contrast.spec.ts` (e2e) |
| `select-all-btn` | `wired` | `selectAll`, `setSelectedPages` | `src/viewer/components/OrganizeGrid.tsx:519` | `tests/viewer-organize-batch.test.ts` (source-grep) · `tests/viewer-organize-keyboard.test.ts` (source-grep) |
| `sign-cert-pick` | `wired` | `chooseCertificate`, `native file dialog` | `src/viewer/v3/EditorV3Shell.tsx:3754` | `tests/e2e/sign-panel.spec.ts` (e2e) · `tests/ui-walk-build.test.ts` (source-grep) · `tests/viewer-v3-sign-panel.test.ts` (source-grep) |
| `sign-with-certificate` | `wired` | `sign_pdf` | `src/viewer/v3/EditorV3Shell.tsx:3787` | `tests/e2e/sign-panel.spec.ts` (e2e) · `tests/ui-walk-build.test.ts` (source-grep) · `tests/viewer-signatures-ui.test.ts` (source-grep) · +1 |
| `text-box-save` | `wired` | `add_free_text_annotation`, `add_image_annotation`, `add_signature_annotation`, `add_stamp_annotation`, `delete_page_image`, `frontend_log`, `list_page_images`, `update_annotation_contents` | `src/viewer/v3/EditorV3Shell.tsx:1409` | `src/lib/__tests__/commandBridge.test.ts` (source-grep) · `src/viewer/v3/__tests__/placement.test.ts` (unit) · `tests/ui-walk-build.test.ts` (source-grep) · +1 |
| `undo-btn` | `wired` | `onUndo → inline`, `onUndo → onUndo` | `src/viewer/v3/EditorV3Shell.tsx:1809` | `src/viewer/hooks/__tests__/useUndoRedo.backend.test.ts` (unit) |
| `v3-outline-item` | `wired` | `onPageSelect → onNavigatePage`, `onNavigatePage → navigateToPage` | `src/viewer/v3/EditorV3Shell.tsx:3137` | `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `validate-pdfa-btn` | `wired` | `validate_pdfa` | `src/viewer/v3/EditorV3Shell.tsx:3389` | `tests/viewer-capability-entry-points.test.ts` (source-grep) |
| `zoom-fit-width-btn` | `wired` | `onFitToView → fitZoomToWindow` | `src/viewer/v3/EditorV3Shell.tsx:1157` | `tests/viewer-zoom-controls.test.ts` (source-grep) |
| `zoom-in-btn` | `wired` | `onZoomChange → setZoom`, `setZoom` | `src/viewer/v3/EditorV3Shell.tsx:1147` | `tests/e2e/a11y-core-journeys.spec.ts` (e2e) · `tests/ui-walk-build.test.ts` (source-grep) · `tests/viewer-mode-toolbar.test.ts` (source-grep) |
| `zoom-out-btn` | `wired` | `onZoomChange → setZoom`, `setZoom` | `src/viewer/v3/EditorV3Shell.tsx:1127` | `tests/e2e/a11y-core-journeys.spec.ts` (e2e) · `tests/viewer-mode-toolbar.test.ts` (source-grep) |
| `zoom-reset-btn` | `wired` | `setZoomPresetsOpen` | `src/viewer/v3/EditorV3Shell.tsx:1137` | `tests/e2e/a11y-core-journeys.spec.ts` (e2e) · `tests/e2e/contrast.spec.ts` (e2e) · `tests/viewer-floating-page-indicator.test.ts` (source-grep) · +7 |

## Advertised keyboard shortcuts

| affordance | state | reaches | seen at | proven by |
|---|---|---|---|---|
| `closeDialog (Escape)` | `wired` | `keydown Escape` | `src/viewer/components/ShortcutSheet.tsx:79` | `tests/e2e/a11y-core-journeys.spec.ts` (e2e) · `tests/e2e/contrast.spec.ts` (e2e) · `tests/e2e/feedback-form.spec.ts` (e2e) · +11 |
| `commandPalette (⌘K / Ctrl+K)` | `wired` | `keydown k` | `src/viewer/components/ShortcutSheet.tsx:66` | `tests/ui-walk-build.test.ts` (source-grep) · `tests/viewer-goto-page.test.ts` (source-grep) · `tests/viewer-keyboard-nav.test.ts` (source-grep) · +3 |
| `export (⌘E / Ctrl+E)` | `wired` | `keydown e` | `src/viewer/components/ShortcutSheet.tsx:65` | `tests/viewer-export-shortcut.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) |
| `firstLastPage (Home / End)` | `wired` | `keydown Home, End` | `src/viewer/components/ShortcutSheet.tsx:48` | `tests/viewer-arrow-page-nav.test.ts` (source-grep) · `tests/viewer-keyboard-nav.test.ts` (source-grep) · `tests/viewer-page-navigation.test.ts` (source-grep) |
| `fitZoom (⌘/Ctrl + Scroll)` | `wired` | `keydown wheel` | `src/viewer/components/ShortcutSheet.tsx:58` | `tests/viewer-scroll-to-zoom.test.ts` (source-grep) |
| `goToPage (⌘G / Ctrl+G)` | `wired` | `keydown g` | `src/viewer/components/ShortcutSheet.tsx:49` | `tests/viewer-floating-page-indicator.test.ts` (source-grep) · `tests/viewer-goto-page.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) |
| `prevNextPage (← / →)` | `wired` | `keydown ArrowLeft, ArrowRight` | `src/viewer/components/ShortcutSheet.tsx:46` | `tests/viewer-arrow-page-nav.test.ts` (source-grep) · `tests/viewer-keyboard-nav.test.ts` (source-grep) · `tests/viewer-page-navigation.test.ts` (source-grep) · +2 |
| `prevNextPage (PageUp / PageDown)` | `wired` | `keydown PageUp, PageDown` | `src/viewer/components/ShortcutSheet.tsx:47` | `tests/e2e/a11y-core-journeys.spec.ts` (e2e) · `tests/viewer-arrow-page-nav.test.ts` (source-grep) · `tests/viewer-keyboard-nav.test.ts` (source-grep) · +1 |
| `save (⌘S / Ctrl+S)` | `wired` | `keydown s` | `src/viewer/components/ShortcutSheet.tsx:64` | `tests/viewer-export-shortcut.test.ts` (source-grep) · `tests/viewer-goto-page.test.ts` (source-grep) · `tests/viewer-page-input-enter.test.ts` (source-grep) · +3 |
| `switchMode (1 – 8)` | `wired` | `keydown 1, 8` | `src/viewer/components/ShortcutSheet.tsx:73` | `tests/viewer-zoom-shortcuts.test.ts` (source-grep) |
| `thisOverview (⌘? / Ctrl+?)` | `wired` | `keydown ?` | `src/viewer/components/ShortcutSheet.tsx:80` | `tests/viewer-release-readiness.test.ts` (source-grep) · `tests/viewer-shortcut-sheet.test.ts` (source-grep) |
| `toggleFullscreen (F11 / ⌘⇧F)` | `wired` | `keydown F11, f` | `src/viewer/components/ShortcutSheet.tsx:72` | `tests/viewer-fullscreen-shortcut.test.ts` (source-grep) · `tests/viewer-release-readiness.test.ts` (source-grep) · `tests/viewer-search-shortcut.test.ts` (source-grep) |
| `zoom100 (⌘0 / Ctrl+0)` | `wired` | `keydown 0` | `src/viewer/components/ShortcutSheet.tsx:57` | `tests/viewer-zoom-reset-click.test.ts` (source-grep) · `tests/viewer-zoom-shortcuts.test.ts` (source-grep) |
| `zoomIn (⌘= / Ctrl+=)` | `wired` | `keydown =` | `src/viewer/components/ShortcutSheet.tsx:55` | `tests/viewer-goto-page.test.ts` (source-grep) · `tests/viewer-scroll-to-zoom.test.ts` (source-grep) · `tests/viewer-zoom-presets.test.ts` (source-grep) · +2 |
| `zoomOut (⌘− / Ctrl+−)` | `wired` | `keydown -` | `src/viewer/components/ShortcutSheet.tsx:56` | `tests/viewer-zoom-shortcuts.test.ts` (source-grep) |

## Components nothing renders

Loaded or not, no live file puts these on screen. They are counted here
because a dead panel keeps reading as the product — and because two of the
descriptions this register replaces were written from them.

| file | exports | lines |
|---|---|---|
| `src/viewer/components/RightContextPanel.tsx` | RightContextPanel | 2170 |
| `src/viewer/components/ModeToolbar.tsx` | ModeToolbar | 500 |
| `src/viewer/components/TopBar.tsx` | TopBar | 441 |
| `src/viewer/components/SignaturePanel.tsx` | SignaturePanel | 283 |
| `src/viewer/components/ObjectSelectionOverlay.tsx` | ObjectSelectionOverlay | 249 |
| `src/viewer/components/WelcomeScreen.tsx` | WelcomeScreen | 229 |
| `src/viewer/components/BusyStateOverlay.tsx` | BusyStateOverlay | 148 |
| `src/viewer/components/EmptyStates.tsx` | EmptyStateNoDocument, EmptyStateNoAnnotations, EmptyStateNoIssues, EmptyStateNoResults | 146 |
| `src/viewer/ViewerSidePanels.tsx` | ViewerSidePanels | 140 |
| `src/viewer/components/IssuePanel.tsx` | IssuePanel | 128 |
| `src/viewer/components/SearchPanel.tsx` | SearchPanel | 115 |
| `src/viewer/components/TimelinePanel.tsx` | TimelinePanel | 93 |
| `src/viewer/WelcomeSection.tsx` | WelcomeSection | 92 |

