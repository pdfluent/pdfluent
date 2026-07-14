# Playwright Quarantine

Date: 2026-05-14

This quarantine is release-candidate test debt tracking for the browser-test app. It does not mark skipped coverage as passing. Each quarantined suite has an owner, reason, disposition, and exit criteria. Active release-candidate coverage stays in normal `npx playwright test` collection.

## Active Release-Candidate Path

These suites remain in normal collection:

- `tests/e2e/playwright-smoke.spec.ts`
- `tests/e2e/visual-e2e-beta-blockers.spec.ts`

The active spec covers the native desktop app path with real app fixtures. It skips only proven runtime gaps for native annotation creation:

- VE-007: missing `PdfDoc.addHighlight`
- VE-008: missing `PdfDoc.addStickyNote`
- VE-010: blocked by missing native annotation creation

VE-009 remains documented as a runtime gap in the scenario fixture because the current browser runtime exposes no `PdfDoc.addFreeText`.

## Quarantined Suites

Owner for every item below: PDFluent app QA. None are SDK-owned.

| Suite | Classification | Disposition | Reason | Exit Criteria |
|---|---|---|---|---|
| `tests/e2e/smoke.test.ts` | stale test expectation | Rewrite | Expects legacy page-count text and older file-input behavior. Current release-candidate path loads real fixtures through `window.__pdfluent_test__.loadDocument`. | Replace with fixture-backed smoke assertions or delete after equivalent assertions exist in `playwright-smoke.spec.ts`. |
| `tests/e2e/tauri-mock-bootstrap.spec.ts` | legacy/mock-doc-only test | Keep quarantined | Verifies old mock bootstrap behavior, not the native desktop app path. | Rewrite only if mock bootstrap remains a supported test utility; otherwise delete. |
| `tests/e2e/viewer.test.ts` | legacy/mock-doc-only test | Rewrite or delete | Mixes mock document setup, stale file-input assumptions, and role selectors from the previous shell. | Split any still-valuable assertions into fixture-backed tests using current selectors, then delete this broad suite. |
| `tests/e2e/workflows/accessibility.spec.ts` | stale broad workflow | Rewrite | Uses older shell assumptions and should be validated against the current loaded-document state. | Reintroduce as focused keyboard/ARIA tests using real fixtures. |
| `tests/e2e/workflows/ai.spec.ts` | out of active desktop app scope | Keep quarantined | AI handoff is not part of the native desktop release-candidate path. | Re-enable only when AI/review handoff is in release scope and the required UI exists. |
| `tests/e2e/workflows/annotation-create.spec.ts` | already-covered runtime gap | Keep quarantined | native annotation creation is blocked by missing runtime exports. | Re-enable only after `native Tauri commands` exposes the creation APIs and app capability gates change. |
| `tests/e2e/workflows/close-document.spec.ts` | stale workflow | Rewrite | Close/dirty-state assertions predate the current export and dirty-state behavior. | Rewrite against real fixtures and current unsaved-changes dialog. |
| `tests/e2e/workflows/collaboration.spec.ts` | out of active desktop app scope | Keep quarantined | Collaboration workflow is not part of the native desktop release-candidate path. | Re-enable only when collaboration UI is in release scope. |
| `tests/e2e/workflows/drag-drop.spec.ts` | stale workflow | Rewrite | Depends on older file loading behavior. | Rewrite with current drag/drop contract and real fixture upload. |
| `tests/e2e/workflows/error-states.spec.ts` | stale workflow | Rewrite | Useful coverage, but expectations need current engine and error copy. | Reintroduce malformed/encrypted fixture coverage when fixtures exist in app repo. |
| `tests/e2e/workflows/export.spec.ts` | superseded stale workflow | Rewrite | Browser PDF export is covered by the active visual E2E path; older export cases use stale assumptions. | Keep only cases not covered by `visual-e2e-beta-blockers.spec.ts`, using current export dialog selectors. |
| `tests/e2e/workflows/forms.spec.ts` | fixture gap | Keep quarantined | App repo has no real AcroForm fixture. | Add an app-owned AcroForm fixture, then rewrite. |
| `tests/e2e/workflows/interaction.spec.ts` | stale workflow | Rewrite | Interaction tests target older canvas/text-layer behavior. | Rewrite as focused current viewer interaction tests if not already covered. |
| `tests/e2e/workflows/keyboard-shortcuts.spec.ts` | stale workflow | Rewrite | Shortcut UI and command labels changed. | Rewrite against current command palette and shortcut sheet. |
| `tests/e2e/workflows/layout-edit.spec.ts` | out of active desktop app scope | Keep quarantined | Layout editing is not part of the current native desktop release-candidate path. | Re-enable when layout editing is in release scope and backed by runtime capability. |
| `tests/e2e/workflows/page-organize.spec.ts` | Tauri-only or disabled outside Tauri | Keep quarantined | browser-test app deliberately disables mutating organize tools; active spec verifies disabled gating. | Re-enable only for Tauri E2E or if native page mutation APIs become release scope. |
| `tests/e2e/workflows/recovery.spec.ts` | stale workflow | Rewrite | Recovery UX should be tested, but old setup relies on mock document state. | Rewrite with current autosave/recovery hooks and real fixtures. |
| `tests/e2e/workflows/release-matrix.spec.ts` | stale matrix | Rewrite | Matrix predates current machine-readable visual scenario fixture. | Replace with assertions over `tests/fixtures/visual-e2e-scenarios.json`. |
| `tests/e2e/workflows/review.spec.ts` | already-covered runtime gap | Keep quarantined | Review creation controls are hidden in browser-test due missing annotation exports. | Re-enable only after runtime annotation creation exists. |
| `tests/e2e/workflows/right-panel-tabs.spec.ts` | stale workflow | Rewrite | Right panel behavior changed, including the new PDF/A panel. | Rewrite focused panel tests for Read, Convert, Protect, and Forms when fixtures exist. |
| `tests/e2e/workflows/search.spec.ts` | superseded stale workflow | Rewrite or delete | Active visual E2E already covers current search. | Delete if no unique assertions remain; otherwise rewrite the unique cases. |
| `tests/e2e/workflows/settings.spec.ts` | out of active desktop app scope | Keep quarantined | Settings workflow is not part of current release-candidate app path. | Re-enable when settings become release scope. |
| `tests/e2e/workflows/shell.spec.ts` | stale workflow | Rewrite | Shell selectors and loaded-state assumptions changed. | Move current shell-only checks into active smoke coverage. |
| `tests/e2e/workflows/text-edit-entry.spec.ts` | out of active desktop app scope | Keep quarantined | Text editing is not in the current native desktop release-candidate path. | Re-enable when runtime-backed text editing is release scope. |
| `tests/e2e/workflows/text-edit-flow.spec.ts` | out of active desktop app scope | Keep quarantined | Text editing is not in the current native desktop release-candidate path. | Re-enable when runtime-backed text editing is release scope. |
| `tests/e2e/workflows/text-interaction.spec.ts` | superseded stale workflow | Rewrite | Text selection/copy is covered by active E2E; older interaction expectations are stale. | Keep only unique current text-layer checks. |
| `tests/e2e/workflows/text-real-edit.spec.ts` | out of active desktop app scope | Keep quarantined | Real text editing is not in the current native desktop release-candidate path. | Re-enable when runtime-backed text editing is release scope. |
| `tests/e2e/workflows/viewport-responsive.spec.ts` | stale broad visual workflow | Rewrite | Useful, but should target current shell and stable viewport assertions. | Reintroduce as non-screenshot layout assertions after current shell baselines settle. |
| `tests/e2e/visual/full-visual-regression.spec.ts` | stale visual baseline | Rewrite | Snapshots were captured before the current viewer shell and capability-honest toolbar state. | Recapture against current release-candidate UI or replace with semantic visual checks. |
| `tests/e2e/visual/i18n-layout.spec.ts` | stale visual baseline | Rewrite | Locale layout snapshots need current shell and text. | Recapture after current UI copy is frozen. |
| `tests/e2e/visual/layout-integrity.spec.ts` | stale visual baseline | Rewrite | Old layout assertions predate current side panels and toolbars. | Rewrite as current overflow/collision checks. |
| `tests/e2e/visual/overflow-detection.spec.ts` | stale visual baseline | Rewrite | Useful category, but tied to stale snapshots/selectors. | Reintroduce with current fixtures and selectors. |
| `tests/e2e/visual/text-edit-visual.spec.ts` | out of active desktop app scope | Keep quarantined | Text editing is not in the current native desktop release-candidate path. | Re-enable when runtime-backed text editing is release scope. |
| `tests/e2e/visual/viewport-visual.spec.ts` | stale visual baseline | Rewrite | Baselines predate the current shell. | Recapture after release-candidate shell is frozen. |

## Fixture Gaps

The app repo currently contains:

- `tests/fixtures/minimal.pdf`
- `tests/fixtures/sample-text.pdf`
- `tests/fixtures/sample-xfa.pdf`

`sample-xfa.pdf` contains an `/XFA` marker and is valid for workflow-level flatten testing, byte-difference checks, export checks, and reopen checks. It is not a full real-world XFA packet fixture, so tests must not claim deep packet-removal proof until the app repo has a redistributable fixture with:

- a real `/AcroForm` dictionary containing an `/XFA` packet array or stream,
- at least one XFA field with visible data,
- redistribution rights documented in the fixture metadata or test comments.

## Not Quarantined

No active native desktop release-candidate blocker is hidden here. Current app-path coverage remains in `visual-e2e-beta-blockers.spec.ts`, with runtime gaps documented in `tests/fixtures/visual-e2e-scenarios.json`, `docs/VISUAL_E2E_TEST_PLAN.md`, and `docs/APP_100_PERCENT_READINESS.md`.
