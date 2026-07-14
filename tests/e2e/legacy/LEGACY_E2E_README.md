# Legacy E2E Test Suite

These specs are quarantined and do not run in any Playwright project.

## Why they cannot pass

The desktop app is Tauri-native. There is no in-browser PDF engine (WASM was removed).
Browser-mode Playwright cannot exercise any PDF functionality — every test that opens
a document will fail because the Tauri IPC is not available in the browser sandbox.

Additionally, the old helper (`helpers/app.ts`) waited for `data-testid="viewer-empty-state"`,
which only existed in `WelcomeSection.tsx` — a dead component with zero importers that
never renders. This has been fixed in `helpers/app.ts` (now uses `welcome-screen`), but
these legacy specs may still reference the old testid.

## Replacement plan

Replace with a small Tauri-runtime smoke suite (`tests/e2e/smoke-shell.spec.ts` is the
current passing spec). Build out proper Tauri-driven e2e tests using `tauri-driver` or
mocked IPC before removing these files.

## Files here

| File | Original location | Notes |
|---|---|---|
| `smoke.test.ts` | `tests/e2e/` | Pre-V3 legacy expectations |
| `viewer.test.ts` | `tests/e2e/` | Pre-V3 legacy expectations |
| `tauri-mock-bootstrap.spec.ts` | `tests/e2e/` | Old bootstrap mechanism |
| `playwright-smoke.spec.ts` | `tests/e2e/` | Dead helper dependency |
| `visual-validate.spec.ts` | `tests/e2e/` | No browser PDF engine |
| `editor-performance-regression.spec.ts` | `tests/e2e/` | No browser PDF engine |
| `workflows/` | `tests/e2e/workflows/` | Pre-V3 chrome (quarantined in playwright.config.ts) |
| `visual/` | `tests/e2e/visual/` | Stale screenshot baselines (quarantined in playwright.config.ts) |
