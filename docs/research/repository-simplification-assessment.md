# Repository Simplification & Cleanup Assessment

**Date:** 2026-06-11
**Scope:** `pdfluent-v3` repository (882 tracked files, 181 commits)
**Type:** READ-ONLY assessment — nothing was deleted, moved, or committed by this audit.
**Method:** Four parallel exploration passes (architecture, docs, tests, assets) + manual verification of every load-bearing claim (import traces, `git ls-files`, live test runs).

---

## Executive summary

The repository contains **three generations of editor UI in one tree**, **~84% source-string-assertion tests**, **completed-migration docs that still read as current plans**, and **an e2e suite whose central helper waits for a testid that only exists in a dead component**. The single highest-value cleanup is not deleting bulk files — it is removing the ~15 items that actively *lie* to readers (human or AI) about what the architecture is today.

Proof that the confusion risk is real: during this very assessment, a documentation-audit agent read `XFA_MIGRATIE_ANALYSE.md` and concluded the app "currently uses Pdfium." It does not — `src-tauri/Cargo.toml:32-47` depends exclusively on XFA SDK crates (`../../../XFA/crates/*`). The doc describes a migration that **completed**, but nothing marks it as historical.

---

## 1. Architecture inventory

### Active production path (verified by import tracing)

```
index.html
  → src/main.tsx                      (URL switch: ?legacy → old App, default → ViewerApp)
    → src/viewer/ViewerApp.tsx        (the product; ~2,900 lines, all state + hooks)
      → src/viewer/v3/EditorV3Shell.tsx   (V3 chrome: topbar, panels, thumbnails, read-bar)
        → src/viewer/components/*     (38 components, all actively imported)
        → src/viewer/hooks/*          (23 hooks, all actively imported)
```

- **Engine:** XFA Rust SDK via Tauri IPC (`src-tauri/Cargo.toml:32-47`, `src-tauri/src/sdk_facade.rs`). **Zero WASM references in `src/`** — the frontend has no in-browser PDF engine anymore.
- **The only runtime version switch:** `src/main.tsx:40` — `new URLSearchParams(window.location.search).has('legacy')`. There is **no `?v2` check anywhere**; `/?v2` renders the same `ViewerApp` as `/`.
- **Welcome/empty state actually rendered:** `src/viewer/components/WelcomeScreen.tsx` (`data-testid="welcome-screen"`). The older `src/viewer/WelcomeSection.tsx` (`data-testid="viewer-empty-state"`) has **zero importers** — it is dead code.

### Subsystem status

| Subsystem | Path | Status | Evidence |
|---|---|---|---|
| V3 shell | `src/viewer/v3/` | **ACTIVE** | Mounted by ViewerApp |
| Viewer components | `src/viewer/components/` (38) | **ACTIVE** | 200+ import refs |
| Viewer hooks | `src/viewer/hooks/` (23) | **ACTIVE** | 150+ import refs |
| Text editing | `src/viewer/text/` (15) | **ACTIVE** | 79 import refs |
| State / events | `src/viewer/state/` | **ACTIVE** | 38 refs incl. main.tsx |
| Interaction / export / validation / native / import / recovery / collaboration / tools / performance | `src/viewer/*` | **ACTIVE** | each ≥1 active importer |
| Core (document, engine, capabilities) | `src/core/` | **ACTIVE** | 100+ refs |
| Lib + platform | `src/lib/`, `src/platform/` | **ACTIVE** | 100+ refs |
| Legacy shell | `src/App.tsx` + `src/components/` (13 files) | **LEGACY** | Only reachable via `?legacy`; App.tsx:12-180 is the sole importer |
| `src/components/AnnotationToolbar.tsx` | — | **DEAD** | Zero importers (not even App.tsx) |
| `src/viewer/WelcomeSection.tsx` | — | **DEAD** | Zero importers; superseded by `components/WelcomeScreen.tsx` |
| `src/viewer/modes/modeConsistencyValidator.ts` | — | **UNKNOWN/likely dead** | No importers found |
| `src/viewer/integrity/` | — | **UNKNOWN/likely dead** | No importers found |
| `src/workers/` | — | **DEAD** | Empty directory, zero worker imports in src/ |

---

## 2. V1 / V2 / V3 audit

The version vocabulary is itself a confusion source — three numbering schemes overlap:

| Term | What it actually means | Where |
|---|---|---|
| "V1" / legacy | `src/App.tsx` + `src/components/` shell | Launchable via `/?legacy` |
| "v2 viewer" | `src/viewer/ViewerApp.tsx` — called "the v2 viewer is the product" in `main.tsx:37` | The default at `/` |
| "V3" | `EditorV3Shell` + `viewer-v3.css` — the current chrome **inside** ViewerApp | Also the default at `/` |
| `/?v2` | **A no-op URL param** used by e2e tests; not checked by any code | `tests/e2e/helpers/app.ts:12` |
| `pdfluent-v3` | The repo/worktree directory name | — |

Findings:

- **V1 is still launchable** (`/?legacy`) and `main.tsx:38` says it "stays reachable … until its remaining unique features are ported and it can be retired." Whether any unique features remain unported is undetermined — this needs a one-time feature-parity check before retiring it (AdminPanel, FirstRunDialog, LicenseBanner, Settings have no obvious V3 equivalents traced).
- **"V2" and "V3" are the same running app.** There is no separate V2 implementation to delete; V2→V3 was an in-place redesign of ViewerApp's chrome. The only V2-era artifacts are stale *references* (test URLs, comments, doc names), not code paths.
- **Build scripts:** no version-specific build flags. `vite.config.ts` and `vitest.config.ts` are version-agnostic.
- **Tests:** the legacy shell has essentially no dedicated tests; the quarantined e2e `workflows/**` suite predates the V3 chrome and is excluded from every Playwright project (`playwright.config.ts:10-15`).
- **Pdfium remnants** (the pre-XFA engine): `scripts/setup-pdfium.sh`, a Pdfium block in `.gitignore` (`src-tauri/lib/lib/`, `src-tauri/lib/include/` …), and mentions in `scripts/generate-third-party.mjs`. No Rust source references Pdfium.

---

## 3. Documentation audit

97 markdown files audited. Headline counts: **KEEP 64 · ARCHIVE 24 · DELETE 9**.

### Root level (17 files)

| File | Verdict | Reason |
|---|---|---|
| `README.md` | KEEP | Accurate entry point |
| `AGENTS.md` | **KEEP + UPDATE** | Authoritative agent briefing, but still describes "the v2 viewer" as the product without mentioning the V3 shell or the `?legacy`-only switch — first doc agents read, must be exactly right |
| `architecture.md` | KEEP + UPDATE | Module map mostly accurate (2026-03-19); refresh the shell section |
| `RELEASE.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `LICENSE.md`, `THIRD_PARTY*.md` | KEEP | Process/legal, current |
| `EDITOR_ACROBAT_PARITY_ROADMAP.md` | KEEP | Current strategy (2026-06-02) |
| `OCR_SPIKE_NOTE.md` | KEEP | Current spike (2026-06-07) |
| `PHASE8_REPORT.md`, `PHASE9_REPORT.md` | ARCHIVE | Completed-phase reports (2026-05-14); historical value only |
| `WORKFLOW_READINESS_MATRIX.md` | KEEP | Capability matrix, referenced |
| `ROADMAP-1.0-BETA.md` | **DELETE** | Claims the build is BROKEN (March 2026 snapshot); contradicted by everything since — actively misleads |
| `ROADMAP-1.1.md` | **DELETE** | Superseded March roadmap |
| `XFA_MIGRATIE_ANALYSE.md` | **ARCHIVE with banner** | Describes the Pdfium→XFA migration as a *proposal*; the migration is done. Misled an audit agent during this assessment. If kept at root it needs a "HISTORICAL — migration completed" banner |

### `docs/` (24 files)

| File | Verdict | Reason |
|---|---|---|
| `DESIGN_SYSTEM.md`, `VISUAL_E2E_TEST_PLAN.md`, `use-case-matrix.md`, `APP_100_PERCENT_READINESS.md`, `app-store-metadata.md`, `download-page.md`, `launch-plan.md` | KEEP | Current reference/marketing |
| `perf/render-path-v2-report.md` | KEEP | Documents the *current* render path (2026-06-10) |
| `perf/app-render-performance-report.md` | KEEP | Background for current perf work |
| `perf/wasm-render-performance-brief.md` | ARCHIVE | WASM render path no longer exists in the frontend |
| `wasm-capability-matrix.md`, `wasm-product-completeness-audit.md` | ARCHIVE | Describe the WASM/browser product surface; desktop frontend has zero WASM — high agent-confusion risk |
| `sdk-text-extraction-improvements.md`, `text-interaction-research-findings.md`, `text-interaction-research-plan.md` | KEEP (and commit — currently untracked) | Current research (2026-06-07) |
| `EDITOR_UX_COMPLETION.md`, `PERFORMANCE.md`, `TEST_TRIAGE.md` | ARCHIVE | Completed-work / pre-merge analyses |
| `viewer-next-phase-plan.md`, `viewer-rust-phase-1-plan.md`, `viewer-rust-phase-2-plan.md` | ARCHIVE | Executed phase plans (March), read as if pending |
| `native-rendering-debug-plan.md` | ARCHIVE | Debug plan; resolved by render-path-v2 work |
| `AUTONOMOUS-QA-SYSTEM.md` | ARCHIVE | Aspirational; system not operational |
| `telemetry/PHASE1_BACKLOG.md` | KEEP | Open backlog |

### `benchmarks/` (43 files)

| Group | Verdict | Reason |
|---|---|---|
| `BINDING_PARITY_MATRIX.md`, `RELEASE_GATE.md` | KEEP | Active references |
| `DIAGNOSTICS_AND_SUPPORT.md`, `DISTRIBUTION_BLOCKERS.md`, `ERROR_TAXONOMY.md`, `SUPPORT_WORKFLOW.md` | ARCHIVE | Stubs/unclear status |
| `benchmarks/runs/**` (37 phase/closure reports + 12 JSON artifacts) | ARCHIVE (move under `docs/archive/benchmark-runs/` or leave but exclude from search guidance) | Timestamped completed-work records; enormous surface area for grep noise (e.g., five different "100% closure" reports) |

### Other

| File | Verdict |
|---|---|
| `compliance/README.md`, `infra/report-worker/README.md`, `src/i18n/README.md`, `tests/e2e/PLAYWRIGHT_QUARANTINE.md`, `tests/e2e/visual-capability-alignment.spec.md` | KEEP |
| `test-results/**/error-context.md` (12+) | DELETE (generated; and gitignore the dir) |

---

## 4. Test suite audit

**Inventory:** 310 top-level vitest files + 18 `src/**/__tests__` + 37 e2e specs. Vitest: 332 files / 6,462 tests, all green.

### The core problem: source-string assertion

~**262 of 310 (84.5%)** top-level vitest files are "source-assertion" tests: `readFileSync` a source file, `expect(src).toContain('some string')`. They:

- pass even when the asserted component is **dead** — proven: `tests/viewer-recent-files.test.ts:204-205` asserts `data-testid="viewer-empty-state"` exists by reading `src/viewer/WelcomeSection.tsx` (line 32 of the test's source-blob list) — a component with **zero importers** that never renders;
- break on any rename/refactor regardless of behavior (this milestone: 3 zoom tests broke on `1.0`→`1.5`);
- give AI agents false confidence ("6,462 tests pass") about runtime behavior.

### E2E reality (verified by live run, 2026-06-11)

| Spec | Status | Cause |
|---|---|---|
| `smoke-shell.spec.ts` | **PASSES** | Targets V3 shell DOM at `/` |
| `visual-e2e-beta-blockers.spec.ts` scenario-selection | PASSES | No app boot needed |
| `playwright-smoke.spec.ts` (7 tests) | **FAILS** | `helpers/app.ts:23` waits for `viewer-empty-state` — testid lives only in dead `WelcomeSection.tsx`; never renders |
| `visual-e2e-beta-blockers.spec.ts` (rest), `visual-validate.spec.ts`, `editor-performance-regression.spec.ts` | FAIL | Same dead helper + browser mode has no PDF engine (frontend WASM removed) |
| `workflows/**` (25 specs) | QUARANTINED | `playwright.config.ts:10-15` — predate V3 chrome |
| `visual/**` (6 specs) | QUARANTINED | Stale screenshot baselines |
| `smoke.test.ts`, `viewer.test.ts`, `tauri-mock-bootstrap.spec.ts` | QUARANTINED | Legacy expectations |

**Conclusion:** of 37 e2e specs, exactly **1** meaningfully passes. The browser-mode e2e strategy is structurally dead because the desktop app is Tauri-native-only; e2e confidence must come from Tauri-driven (or mocked-IPC) tests, not plain chromium.

### Duplicate clusters (consolidation candidates)

- Zoom: 8 files (`viewer-zoom-controls/-persist/-presets/-reset-click/-shortcuts`, `toolbar-zoom-display`, `viewer-modetoolbar-zoom`, `viewer-scroll-to-zoom`)
- Text editing: 44 `viewer-text-*` files (9 `viewer-text-mutation-*` variants alone)
- Annotations: 13 files; Redaction: 9; Review: 15; Search: 8; Forms: 9

### Recommended release gate

1. **Blocking:** behavioral vitest (~48 files incl. `document-structure`, `page-ranges`, `ocr-policy`, `src/**/__tests__`), `cargo test --lib` (39 tests), `cargo clippy -D warnings`, `npm run typecheck`, `smoke-shell.spec.ts`.
2. **Non-blocking CI signal:** the 262 source-assertion tests (cheap, catch accidental deletions, but must never be read as behavioral proof).
3. **Delete or rewrite:** `helpers/app.ts` (`VIEWER_URL='/?v2'`, dead testid), `playwright-smoke.spec.ts`, quarantined `workflows/**`, `visual/**`, `smoke.test.ts`, `viewer.test.ts`, `tauri-mock-bootstrap.spec.ts`, `editor-performance-regression.spec.ts`, `visual-validate.spec.ts` → replace with a small Tauri-runtime smoke suite.

---

## 5. Asset audit

| Item | Status | Verdict |
|---|---|---|
| `public/favicon.{png,svg}` | Referenced | KEEP |
| `src-tauri/icons/*` (8) | Build-referenced | KEEP |
| `scripts/dmg/*` (bg images + make-bg.py) | Used by `release-macos.sh` | KEEP |
| `tests/e2e/visual/*-snapshots/` (~15 PNG baselines) | Quarantined specs' baselines | DELETE with the quarantined visual specs (stale baselines, acknowledged in config) |
| `tests/fixtures/*.pdf` (minimal, sample-text, sample-xfa) | Test fixtures | KEEP |
| `compliance-report.json` | **TRACKED, generated**, 432 KB / 13,722 lines | Untrack + gitignore (regenerate via `npm run compliance:generate`) |
| `test-results/` (2.2 MB) + `test-results/.last-run.json` (tracked!) | Generated | Untrack `.last-run.json`, add `test-results/` to `.gitignore` (currently missing) |
| `dist/`, `src-tauri/target/`, `src-tauri/gen/` | Properly ignored | OK |
| `.DS_Store` ×3 | Untracked, ignored | OK (local noise) |
| `benchmarks/runs/**/*.json` (12) | Tracked historical artifacts | ARCHIVE with their reports |

---

## 6. Code cleanup opportunities

| Item | Path | Impact | Risk |
|---|---|---|---|
| Dead component (testid trap) | `src/viewer/WelcomeSection.tsx` | Removes the root cause of all e2e timeouts + one false-green vitest | **Low** — zero importers; update `tests/viewer-recent-files.test.ts:204` + `helpers/app.ts` in the same change |
| Dead component | `src/components/AnnotationToolbar.tsx` | — | Low — zero importers |
| Empty dir | `src/workers/` | — | None |
| Duplicate script | `verify-tauri-engine.js` **and** `.ts` both tracked, neither referenced by package.json/CI | Pick one (or delete both) | Low |
| Orphaned scripts | `scripts/check-wasm-contract.mjs`, `scripts/check-wasm-stale.mjs` (note: `check-wasm-artifacts.mjs` **is used** — `.gitlab-ci.yml:74`) | — | Low |
| Orphaned dev tools | `scripts/capture-ui-screenshots.mjs`, `scripts/verify-redesign.mjs` | Document or delete | Low |
| Pdfium remnants | `scripts/setup-pdfium.sh`, Pdfium block in `.gitignore`, refs in `scripts/generate-third-party.mjs` | Removes "which engine is this?" ambiguity | Low — verify no CI job calls setup-pdfium first |
| Likely-dead modules | `src/viewer/modes/modeConsistencyValidator.ts`, `src/viewer/integrity/` | — | **Medium** — confirm zero importers incl. dynamic imports before removing |
| Legacy shell retirement | `src/App.tsx` + `src/components/` (12 files) + `?legacy` switch in `main.tsx` | −13 files, removes an entire wrong-code-path target for agents | **Medium-High** — requires one-time feature-parity check (AdminPanel/Settings/FirstRunDialog/LicenseBanner) before deletion. Until then: QUARANTINE (see roadmap) |
| Deprecated export | `ModeToolbar.tsx:59` `@deprecated getWiredTools` predecessor; `ShortcutSheet.tsx:85` legacy export "for tests" | — | Low — update the importing tests |

---

## 7. AI-agent confusion analysis (ranked)

1. **`tests/e2e/helpers/app.ts:11-12`** — comment claims "ViewerApp is served at /?v2 via main.tsx's URL-param switch." **False on both counts** (`?v2` is checked nowhere; the switch is `?legacy`). Every agent debugging e2e starts here and inherits a wrong mental model.
2. **`src/viewer/WelcomeSection.tsx`** — dead component holding the `viewer-empty-state` testid that the e2e helper waits on and a vitest asserts on. Makes failures look environmental when they're structural.
3. **Source-assertion test corpus (262 files)** — "6,462 passing tests" reads as behavioral coverage; it is mostly string matching. Agents repeatedly conclude features are verified when only source text is.
4. **`XFA_MIGRATIE_ANALYSE.md`** — completed migration written as proposal. *Demonstrably* misled an analysis agent during this assessment into reporting Pdfium as the current engine.
5. **Version vocabulary collision** — "v2 viewer is the product" (`main.tsx:37`) vs `EditorV3Shell`/`viewer-v3.css` vs repo dir `pdfluent-v3` vs no-op `/?v2`. Agents cannot tell which "version" they're editing.
6. **`ROADMAP-1.0-BETA.md`** — states the build is broken; it is not. An agent reading top-level docs first will misjudge project state.
7. **WASM docs trio** (`wasm-capability-matrix.md`, `wasm-product-completeness-audit.md`, `perf/wasm-render-performance-brief.md`) + WASM script names — frontend has zero WASM; agents grep "wasm", find 3 docs + 3 scripts + CI step, and assume an active browser engine.
8. **`src/components/` vs `src/viewer/components/`** — near-identical names, different generations. One asset-audit agent in this assessment concluded `src/components/` "is the real components dir." Import tracing proves it is `?legacy`-only.
9. **`benchmarks/runs/**`** — 37 reports with names like `EDITOR_FULL_SUITE_TRUE_GREEN_100_REPORT.md` and five "closure"/"100%" variants. Grep for almost any feature lands here first and returns stale states.
10. **Quarantine split across three places** — `playwright.config.ts` lists, `PLAYWRIGHT_QUARANTINE.md`, and silently-excluded specs (`editor-performance-regression`, `visual-validate` sit in e2e root but run in no project). Agents run "the e2e suite" without knowing 36/37 specs are dead weight.

---

## 8. Cleanup roadmap

> Risk legend: **None** = mechanical; **Low** = zero importers / generated; **Medium** = needs a verification step first; **High** = behavior-affecting.

### Phase A — Safe archive (create `docs/archive/`, `git mv`, add a one-line HISTORICAL banner)

| Path | Rationale | Risk |
|---|---|---|
| `XFA_MIGRATIE_ANALYSE.md` | Completed migration, reads as pending | None |
| `PHASE8_REPORT.md`, `PHASE9_REPORT.md` | Completed phases | None |
| `docs/viewer-rust-phase-1-plan.md`, `docs/viewer-rust-phase-2-plan.md`, `docs/viewer-next-phase-plan.md` | Executed plans | None |
| `docs/EDITOR_UX_COMPLETION.md`, `docs/PERFORMANCE.md`, `docs/TEST_TRIAGE.md` | Pre-merge/completed analyses | None |
| `docs/native-rendering-debug-plan.md` | Resolved by render-path v2 | None |
| `docs/AUTONOMOUS-QA-SYSTEM.md` | Aspirational, not operational | None |
| `docs/wasm-capability-matrix.md`, `docs/wasm-product-completeness-audit.md`, `docs/perf/wasm-render-performance-brief.md` | Frontend WASM removed | None |
| `benchmarks/DIAGNOSTICS_AND_SUPPORT.md`, `DISTRIBUTION_BLOCKERS.md`, `ERROR_TAXONOMY.md`, `SUPPORT_WORKFLOW.md` | Stubs | None |
| `benchmarks/runs/**` (37 md + 12 json) | Historical run records | None |

### Phase B — Safe deletions

| Path | Rationale | Risk |
|---|---|---|
| `ROADMAP-1.0-BETA.md`, `ROADMAP-1.1.md` | Actively wrong ("build broken") | None |
| `src/viewer/WelcomeSection.tsx` | Zero importers (fix `tests/viewer-recent-files.test.ts:204` + `tests/e2e/helpers/app.ts` in same commit) | Low |
| `src/components/AnnotationToolbar.tsx` | Zero importers | Low |
| `src/workers/` | Empty | None |
| `verify-tauri-engine.js` + `verify-tauri-engine.ts` | Unreferenced duplicates | Low |
| `scripts/check-wasm-contract.mjs`, `scripts/check-wasm-stale.mjs` | Orphaned (keep `check-wasm-artifacts.mjs` — CI uses it) | Low |
| `scripts/capture-ui-screenshots.mjs`, `scripts/verify-redesign.mjs` | Orphaned dev tools | Low |
| `scripts/setup-pdfium.sh` + Pdfium `.gitignore` block | Pre-XFA engine remnant | Low (verify CI first) |
| `compliance-report.json` (untrack + gitignore) | 432 KB generated file | Low |
| `test-results/.last-run.json` (untrack) + add `test-results/` to `.gitignore` | Generated | None |
| `tests/e2e/smoke.test.ts`, `viewer.test.ts`, `tauri-mock-bootstrap.spec.ts` | Quarantined, legacy | Low |
| `tests/e2e/workflows/**` (25 specs) | Quarantined in every project | Low |
| `tests/e2e/visual/**` (6 specs + snapshot dirs) | Stale baselines, quarantined | Low |
| `tests/e2e/playwright-smoke.spec.ts`, `visual-validate.spec.ts`, `editor-performance-regression.spec.ts`, most of `visual-e2e-beta-blockers.spec.ts` | Structurally cannot pass (dead testid + no browser engine) | Low-Medium — replace with Tauri-runtime smoke first if e2e coverage must not drop to one spec |

### Phase C — Structural simplification

| Item | Rationale | Risk |
|---|---|---|
| **Quarantine the legacy shell**: move `src/App.tsx` + `src/components/` (minus shared `telemetry/`) to `src/legacy/`, keep the `?legacy` switch pointing there, add a `LEGACY — scheduled for removal` header to each file | Stops agents editing V1 by accident while preserving launchability until parity check | Medium |
| Run the V1 feature-parity check (AdminPanel, Settings, FirstRunDialog, LicenseBanner) → then delete `src/legacy/` + the `main.tsx` switch | −13 files, one shell | Medium-High |
| Rewrite `tests/e2e/helpers/app.ts`: `VIEWER_URL = '/'`, wait on `welcome-screen` testid, fix the comment | Unblocks any future browser e2e | Low |
| Confirm-and-remove `src/viewer/modes/modeConsistencyValidator.ts`, `src/viewer/integrity/` | Likely dead | Medium |
| Consolidate duplicate vitest clusters (8 zoom files → 1-2, 9 mutation variants → 2-3, etc.) | −50 to −80 files, less grep noise | Medium (keep assertions, merge files) |
| Commit or discard the untracked working-tree docs/tests (`docs/sdk-text-extraction-improvements.md`, `docs/text-interaction-research-*.md`, `src/lib/__tests__/textIntelligence.test.ts`) | Untracked files invisible to fresh clones/agents | None |

### Phase D — Naming improvements

| Item | Rationale | Risk |
|---|---|---|
| `src/main.tsx:37` comment: replace "v2 viewer is the product" with "ViewerApp (V3 shell) is the product; `?legacy` serves the retired V1 shell until removal" | Kills the v2/v3 vocabulary collision at its source | None |
| Update `AGENTS.md` with: active path map (§1 above), "engine = XFA SDK, no frontend WASM", "`?v2` does nothing", source-assertion-test caveat | The doc agents read first must inoculate against the top-10 list | None |
| Refresh `architecture.md` shell section | Same | None |
| Optional: rename `tests/e2e/smoke-shell.spec.ts` → `v3-shell-smoke.spec.ts` and standardize `viewer-*` test prefix docs | Cosmetic | None |

### Phase E — Release-gate simplification

| Item | Rationale | Risk |
|---|---|---|
| Add `npm run test:behavioral` (the ~48 behavioral files + `src/**/__tests__`) and make it + `cargo test --lib` + `clippy -D warnings` + `typecheck` + `smoke-shell` the **blocking** gate | Gate reflects real behavior | Low |
| Demote the 262 source-assertion tests to a non-blocking `test:static` CI job with a name that says what it is | Honest signal | Low |
| Build a minimal Tauri-runtime smoke (open fixture PDF → navigate → zoom → save) to replace the deleted browser e2e | Restores true end-to-end coverage | Medium (new infra) |
| Document the gate in `RELEASE.md` and delete `tests/e2e/PLAYWRIGHT_QUARANTINE.md` once quarantined specs are gone | Single source of truth | None |

---

## 9. Final summaries

### Top 20 archive candidates

1. `XFA_MIGRATIE_ANALYSE.md`
2. `PHASE8_REPORT.md`
3. `PHASE9_REPORT.md`
4. `docs/viewer-rust-phase-1-plan.md`
5. `docs/viewer-rust-phase-2-plan.md`
6. `docs/viewer-next-phase-plan.md`
7. `docs/EDITOR_UX_COMPLETION.md`
8. `docs/PERFORMANCE.md`
9. `docs/TEST_TRIAGE.md`
10. `docs/native-rendering-debug-plan.md`
11. `docs/AUTONOMOUS-QA-SYSTEM.md`
12. `docs/wasm-capability-matrix.md`
13. `docs/wasm-product-completeness-audit.md`
14. `docs/perf/wasm-render-performance-brief.md`
15. `benchmarks/DIAGNOSTICS_AND_SUPPORT.md`
16. `benchmarks/DISTRIBUTION_BLOCKERS.md`
17. `benchmarks/ERROR_TAXONOMY.md`
18. `benchmarks/SUPPORT_WORKFLOW.md`
19. `benchmarks/runs/editor_wasm_contract/**` (largest run-report cluster, 18 files)
20. `benchmarks/runs/**` remainder (19 md + 12 json)

### Top 20 delete candidates

1. `ROADMAP-1.0-BETA.md`
2. `ROADMAP-1.1.md`
3. `src/viewer/WelcomeSection.tsx` (with test+helper fix)
4. `src/components/AnnotationToolbar.tsx`
5. `src/workers/` (empty dir)
6. `verify-tauri-engine.js`
7. `verify-tauri-engine.ts`
8. `scripts/check-wasm-contract.mjs`
9. `scripts/check-wasm-stale.mjs`
10. `scripts/capture-ui-screenshots.mjs`
11. `scripts/verify-redesign.mjs`
12. `scripts/setup-pdfium.sh` (+ `.gitignore` Pdfium block)
13. `compliance-report.json` (untrack, regenerable)
14. `test-results/.last-run.json` (untrack) + gitignore `test-results/`
15. `tests/e2e/workflows/**` (25 specs)
16. `tests/e2e/visual/**` (6 specs + PNG baselines)
17. `tests/e2e/smoke.test.ts`
18. `tests/e2e/viewer.test.ts`
19. `tests/e2e/tauri-mock-bootstrap.spec.ts`
20. `tests/e2e/playwright-smoke.spec.ts` + `visual-validate.spec.ts` + `editor-performance-regression.spec.ts` (after Tauri-smoke replacement exists)

### Top 10 sources of AI-agent confusion

1. `tests/e2e/helpers/app.ts:11-12` — false `?v2` comment + dead-testid wait
2. `src/viewer/WelcomeSection.tsx` — dead component backing a "passing" vitest and a failing e2e
3. The 262-file source-assertion corpus presenting as behavioral coverage
4. `XFA_MIGRATIE_ANALYSE.md` — completed migration framed as pending (misled an agent during this audit)
5. v1/v2/v3 vocabulary collision (`main.tsx:37` "v2 viewer" vs `EditorV3Shell` vs `/?v2` no-op vs repo name)
6. `ROADMAP-1.0-BETA.md` — "build broken" claim
7. WASM docs + scripts implying an in-browser engine that no longer exists
8. `src/components/` vs `src/viewer/components/` twin naming
9. `benchmarks/runs/**` — 37 stale "closure/100%" reports dominating grep results
10. Three-way quarantine split (config lists / quarantine doc / silently-unprojected specs)

### Recommended execution order

1. **Phase D first** (naming/docs: `main.tsx` comment, `AGENTS.md`, `architecture.md`) — zero risk, immediately reduces confusion for every subsequent agent, including the ones doing this cleanup.
2. **Phase B items 1-14** (deletions that need no replacement: roadmaps, dead components, duplicate/orphaned scripts, generated-file untracking).
3. **Phase A** (bulk archive moves — mechanical once `docs/archive/` exists).
4. **Phase E** (release-gate split: behavioral vs static; Tauri smoke build-out).
5. **Phase B items 15-20** (e2e suite deletion — only after the Tauri smoke from step 4 exists, so coverage never drops below today's single passing spec).
6. **Phase C last** (legacy-shell quarantine → parity check → removal; test-cluster consolidation) — highest effort, benefits from the cleaner tree produced by steps 1-5.

---

*Assessment artifacts: this document only. No repository files were modified, moved, or deleted.*
