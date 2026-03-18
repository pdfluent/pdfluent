# PDFluent Architecture

_Last updated: 2026-03-17_

## Core Principles

1. **Viewer-first MVP**: Build minimal working viewer with new architecture before migrating existing features
2. **Capability-driven**: Runtime capability checking enables graceful degradation and feature discovery
3. **Engine abstraction**: Clean separation between PDF operations and runtime-specific implementations
4. **Multi-runtime support**: Tauri (production), Browser-test (development/testing)
5. **Reliability-first**: Every edit path is validated, telemetered, and collision-checked before mutation

---

## Module Structure

### Core Layer
- **Document Model** (`src/core/document/`) — Immutable PDF document representation
- **Capability Registry** (`src/core/capability/`) — Runtime capability checking
- **Engine Interfaces** (`src/core/engine/`) — PDF operation abstractions

### Platform Layer
- **Runtime Adapters** (`src/platform/runtime/`) — Runtime-specific engine factories
- **Engine Implementations** (`src/platform/engine/`) — Concrete engine implementations

### Viewer Layer (`src/viewer/`)
Subdivided by concern. All modules are pure TypeScript/React — no Rust dependency at this layer.

| Subdirectory | Responsibility |
|---|---|
| `text/` | Text mutation pipeline, font encoding support, messaging |
| `layout/` | Object detection, move/resize/replace engines, alignment, layers, collision |
| `components/` | React UI components (overlay, selection, busy state) |
| `state/` | App state validators, error center, edit telemetry, autosave, settings |
| `integrity/` | Document structural integrity validation |
| `modes/` | Mode transition validation and UI consistency checks |
| `native/` | File path guards and native operation wrappers |
| `performance/` | In-memory performance telemetry and budget monitoring |
| `validation/` | File path and input validation |
| `ai/` | AI context building, entity extraction, guardrails |
| `collaboration/` | Review bundle format and export |
| `export/` | Export dialog and format pipeline |
| `hooks/` | Shared React hooks |
| `import/` | File import utilities |
| `interaction/` | Mouse/keyboard interaction handlers |
| `recovery/` | Error recovery strategies |
| `tools/` | Tool-specific logic (redaction, annotation, etc.) |

---

## Data Flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   UI Layer  │ ──> │ Runtime Layer│ ──> │ Engine Layer│
└─────────────┘     └──────────────┘     └─────────────┘
      │                     │                     │
      ▼                     ▼                     ▼
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Document  │     │  Runtime     │     │   PDF SDK   │
│   Context   │     │  Detection   │     │ (XFA Rust)  │
└─────────────┘     └──────────────┘     └─────────────┘
```

---

## Runtime Adapter Architecture

### Architecture Overview

```
┌─────────────────┐     ┌───────────────────┐     ┌─────────────────┐
│  EngineFactory  │ ◄── │ Runtime Adapters  │ ◄── │ Runtime Registry│
└─────────────────┘     └───────────────────┘     └─────────────────┘
         │                       │                         │
         ▼                       ▼                         ▼
┌─────────────────┐     ┌───────────────────┐     ┌─────────────────┐
│   PDF Engines   │     │ Runtime Detection │     │   Adapter Mgmt  │
└─────────────────┘     └───────────────────┘     └─────────────────┘
```

### Runtime Types
- **tauri**: Production desktop runtime with XFA Rust SDK backend
- **browser-test**: Development/testing runtime with mock implementations

### Runtime Detection
```typescript
function detectRuntime(): Runtime {
  if (typeof window !== 'undefined' && window.__TAURI__) {
    return 'tauri';
  }
  return 'browser-test';
}
```

### Runtime Adapters
```typescript
interface RuntimeAdapter {
  readonly runtime: Runtime;
  readonly priority: number;
  isAvailable(): boolean;
  createEngine(config?: EngineConfig): Promise<PdfEngine>;
  getMetadata(): RuntimeAdapterMetadata;
  getCapabilities(): RuntimeCapabilities;
}
```

### Default Adapters
- **TauriRuntimeAdapter**: Production adapter (priority: 100)
- **BrowserTestRuntimeAdapter**: Development adapter (priority: 50)

---

## Text Mutation Pipeline

Fully implemented in `src/viewer/text/`.

### Flow
```
hover → select → enter edit mode → validate → type → commit/cancel
           │
           └── FontMutationSupport (encoding check)
               └── TextMutationSupport (validateReplacement)
                   └── MutationConstraints { maxLength, expansionChars }
                       └── computeBboxExpansionChars (bbox-aware expansion)
```

### Key Modules

| Module | Exports |
|---|---|
| `textMutationSupport.ts` | `validateReplacement`, `computeBboxExpansionChars`, `MutationConstraints` |
| `textMutationFidelity.ts` | `ESTIMATED_CHAR_WIDTH_RATIO = 0.55`, fidelity scoring |
| `textMutationMessaging.ts` | `getFontEncodingMessage`, `getOverflowRiskMessage`, Dutch message maps |
| `fontMutationSupport.ts` | `FontEncodingClass` (7 values), `classifyFontEncoding` |

### Mutation Constraints
- **Base rule:** replacement must be equal or shorter than original (`maxLength`)
- **Bbox expansion:** `computeBboxExpansionChars` calculates spare character slots from the visible bounding box using `ESTIMATED_CHAR_WIDTH_RATIO = 0.55`
- **expansionChars:** optional field on `MutationConstraints` that relaxes the strict equal-or-shorter rule for spans with extra horizontal space

### Font Encoding Classes
`standard_latin` | `subset_embedded` | `identity_h` | `identity_v` | `cid_keyed` | `custom_encoding` | `unknown`

### Edit Telemetry
- Ring buffer capped at `MAX_EVENTS = 500`
- `EditOutcome`: `mutation-pending` | `mutation-committed` | `mutation-rejected` | `validation-failed` | `support-blocked` | `cancelled` | `no-change`
- Test hook: `window.__pdfluent_test__.editTelemetry`

---

## Object & Layout Editing Pipeline

Fully implemented in `src/viewer/layout/` and `src/viewer/components/`.

### Object Types
```typescript
type LayoutObjectType = 'text_block' | 'image' | 'vector_graphics' | 'shape' | 'form_widget';
```

### Capability Matrix
| Type | Movable | Resizable | Replaceable |
|---|---|---|---|
| `image` | ✅ | ✅ | ✅ |
| `text_block` | ✅ | ❌ | ❌ |
| `shape` | ✅ | ✅ | ❌ |
| `vector_graphics` | ✅ | ❌ | ❌ |
| `form_widget` | ❌ | ❌ | ❌ |

### Key Modules

| Module | Key Exports |
|---|---|
| `objectDetection.ts` | `detectLayoutObjects`, `classifyRawObject`, `IDENTITY_MATRIX`, rect utilities |
| `objectMoveEngine.ts` | `computeMove`, `beginMoveSession`, `updateMoveSession`, `translateMatrix`, `snapToGrid` |
| `objectResizeEngine.ts` | `computeResize`, `computeResizeRect`, `MIN_OBJECT_SIZE = 10` |
| `imageReplacePipeline.ts` | `validateImageReplace`, `prepareImageReplaceRequest`, `computeImageDisplayRect`, `isSupportedMimeType` |
| `layoutAlignmentGuides.ts` | `buildAllGuides`, `computeActiveGuides`, `SNAP_THRESHOLD = 6` |
| `layoutLayerModel.ts` | `buildLayerModel`, `isObjectLocked`, `isObjectVisible`, `getZOrder` |
| `layoutCollisionValidator.ts` | `validateCollisions`, individual check functions, `CollisionCode` |

### Component: ObjectSelectionOverlay
`src/viewer/components/ObjectSelectionOverlay.tsx`

- `RESIZE_HANDLES`: 8 handles (`nw`, `n`, `ne`, `w`, `e`, `sw`, `s`, `se`)
- `HANDLE_SIZE = 8` px, `HANDLE_CURSORS`, `OBJECT_TYPE_LABELS` (Dutch)
- `pdfRectToDom(rect, pageHeightPt, zoom)` — Y-flip: `domY = (H - rect.y - rect.height) * zoom`
- `handlePosition(handle, boxWidth, boxHeight)`

### Coordinate System
PDF space: origin **bottom-left**, Y upward.
DOM space: origin **top-left**, Y downward.

```
domX = rect.x * zoom
domY = (pageHeightPt - rect.y - rect.height) * zoom
```

### Image Scale Strategies
`preserve` | `fit` | `fill` | `stretch`

### Collision Codes
`page-boundary-violation` | `object-overlap` | `annotation-misalignment` | `clipping-risk` | `minimum-size-violation` | `locked-layer`

---

## Reliability & Hardening Subsystems

Implemented in `src/viewer/integrity/`, `src/viewer/state/`, `src/viewer/modes/`, `src/viewer/native/`, `src/viewer/performance/`, `src/viewer/components/`.

### Document Integrity Validator (`integrity/documentIntegrityValidator.ts`)
Pre-flight and post-save validation. Checks: page count, PDF version, metadata, xref completeness, annotation count, file size, encryption consistency, edit lock.

- `validateDocumentIntegrity(doc)` → `IntegrityReport { hasCritical, hasWarnings, clean }`
- `isDocumentSafeToOpen(doc)` / `isDocumentSafeToEdit(doc)` — quick boolean helpers
- `MAX_PAGE_COUNT = 100_000`, `MAX_FILE_SIZE_BYTES = 2 GB`

### Edit State Validator (`state/editStateValidator.ts`)
Validates state machine transitions and internal consistency.

- `VALID_TRANSITIONS`: 7 `EditorMode` values with explicit allowed targets
- `validateEditorState(state)` → `StateValidationResult { violations, hasBlockingViolations, valid }`
- `validateModeTransition(from, to, state)` — validates a proposed transition

**EditorMode values:** `idle` | `viewing` | `text-edit` | `layout-edit` | `annotating` | `redacting` | `form-fill`

### Error Center (`state/errorCenter.ts`)
Centralised in-memory error registry, capped at `ERROR_CENTER_MAX = 50`.

Extended in hardening block with:
- `getErrorsBySeverity`, `getErrorsBySource` — query helpers
- `hasErrors`, `hasWarnings` — quick boolean checks
- `getErrorSummary` → `{ total, errorCount, warningCount, infoCount, sources }`
- `getLatestError`, `getLatestErrorBySeverity` — recency helpers
- `deduplicateErrors` — removes consecutive duplicate title+source pairs
- `isAtCapacity` — capacity guard
- Factory helpers: `makeOcrError`, `makeExportError`, `makeRedactionError`, `makeDocumentLoadError`, `makeTextMutationError`, `makeLayoutEditError`, `makeSaveError`, `makeAnnotationError`

### Mode Consistency Validator (`modes/modeConsistencyValidator.ts`)
Validates that toolbar state, overlay visibility, and active mode are mutually consistent.

- `validateModeConsistency(state)` → `ModeConsistencyReport`
- `isModeConsistent(state)` — quick boolean
- Codes: `toolbar-mode-mismatch` | `overlay-mode-mismatch` | `multiple-active-modes` | `form-fill-on-non-form` | `annotation-toolbar-in-non-annotation-mode` | `edit-overlay-in-view-mode` | `redaction-toolbar-in-non-redaction-mode`

### Native File Operations (`native/nativeFileOperations.ts`)
Path guard layer between UI and Tauri invoke.

- `guardOpenPath`, `guardSavePath`, `guardSaveAsPath`, `guardExportPath`
- `getFilename`, `getDirectory`, `getExtension`, `replaceExtension`
- `pathsEqual`, `isSaveOverwrite`
- All guards return `FileOpResult<{ normalizedPath }>`

### Performance Telemetry (`performance/performanceTelemetry.ts`)
In-memory ring buffer capped at `MAX_PERF_EVENTS = 1000`.

- `recordPerfEvent`, `clearPerfTelemetry`, `getPerfEvents`
- `getPerfEventsByCategory`, `getRecordedCategories`, `getSlowEvents`
- `computePercentile(values, percentile)` — p50/p95/p99
- `getPerfSummary(category)` → `{ count, avgMs, p50Ms, p95Ms, p99Ms, maxMs, minMs }`
- `startPerfTimer(category, label)` → `{ stop(label?, pageIndex?) }`
- `isPageRenderWithinBudget(sampleSize, budgetMs)` — budget monitor
- `SLOW_OPERATION_THRESHOLD_MS = 3000`, `PAGE_RENDER_BUDGET_MS = 250`
- Test hook: `window.__pdfluent_test__.perfTelemetry`

### BusyStateOverlay (`components/BusyStateOverlay.tsx`)
Full-screen blocking overlay for long-running operations.

- `clampProgress`, `severityClass`, `buildAriaLabel`, `isProgressComplete`
- `BusySeverity`: `neutral` | `warning` | `error`
- Renders `null` when `busy=false` — no hidden DOM cost

---

## Workflow Corpus

`tests/workflows/workflowCorpus.ts` — 6 real user workflows used as reliability benchmarks.

| ID | Category | Release Gate |
|---|---|---|
| `open_review_comment_save` | review | ✅ |
| `open_edit_text_save_reopen` | text_editing | ✅ |
| `open_move_object_save_reopen` | layout_editing | ✅ |
| `open_annotate_export_audit` | annotation | ❌ |
| `open_redact_save` | redaction | ✅ |
| `open_large_navigate_edit_save` | large_document | ❌ |

`getReleaseGatingWorkflows()` returns exactly 4 workflows.

---

## Release Acceptance Matrix

`tests/release/releaseAcceptanceMatrix.ts` — 25 acceptance criteria across 13 feature areas.

Every blocking criterion must pass before a release. Areas covered:
`document_open` | `text_editing` | `layout_editing` | `annotation` | `redaction` | `save_export` | `performance` | `integrity` | `state_machine` | `error_handling` | `native_operations` | `workflow_corpus` | `mode_consistency`

---

## Testing Architecture

### Counts (2026-03-17)
- **Test files:** 317 (312 passing, 5 pre-existing failures unrelated to viewer work)
- **Tests:** 6350 (6345 passing)
- **Coverage blocks completed:** 3 blocks × 10 batches = 30 batches

### Test Layers

| Layer | Tool | Directory |
|---|---|---|
| Unit / integration | Vitest | `tests/*.test.ts` |
| Component / source readiness | Vitest | `tests/*.test.ts` |
| Layout stability | Vitest | `tests/viewer-layout-stability.test.ts` |
| Performance / stress | Vitest | `tests/performance/` |
| Workflow corpus | Vitest | `tests/workflows/` |
| Release acceptance | Vitest | `tests/release/` |
| E2E / source readiness | Playwright | `tests/e2e/` |
| Native file ops | Vitest | `tests/native/` |

### Pre-existing Failures (5, unrelated to viewer work)
1. `tests/ocr-paddle-bridge.test.ts` — OCR bridge source not yet implemented
2. `tests/toolbar-advanced-tools-menu.test.ts` — tests toolbar component diverged from source
3. `tests/toolbar-recent-files.test.ts` — tests separate toolbar component
4. `tests/viewer-continuous-windowing.test.ts` — tests windowed rendering not yet implemented
5. `tests/xfa-warning-parity.test.ts` — tests Rust source strings; Rust side changed independently

---

## Key Interfaces

### PdfEngine
- `DocumentEngine`: Load, save, metadata operations
- `RenderEngine`: Page rendering and thumbnails
- `AnnotationEngine`: Annotation CRUD operations
- `FormEngine`: Form field operations
- `QueryEngine`: Search and text extraction
- `TransformEngine`: Merge, split, rotate
- `ValidationEngine`: PDF/A validation

### CapabilityRegistry
- `checkOperation(operation: OperationType): boolean`
- `getLimit(limit: LimitType): LimitInfo`
- `listSupportedOperations(): OperationType[]`

---

## Performance Budgets

| Operation | Budget | Constant |
|---|---|---|
| Page render | 250 ms | `PAGE_RENDER_BUDGET_MS` |
| Slow operation threshold | 3 000 ms | `SLOW_OPERATION_THRESHOLD_MS` |
| Document load (target) | < 1 000 ms | — |
| Text search (target) | < 500 ms | — |

---

## File Structure

```
src/
├── core/                        # Core abstractions
│   ├── document/               # Document model
│   ├── capability/             # Capability registry
│   └── engine/                 # Engine interfaces
│
├── platform/                    # Platform-specific code
│   ├── runtime/                # Runtime adapters
│   │   ├── types.ts
│   │   ├── RuntimeRegistry.ts
│   │   ├── RuntimeAdapterFactory.ts
│   │   └── adapters/
│   │       ├── TauriRuntimeAdapter.ts
│   │       └── BrowserTestRuntimeAdapter.ts
│   └── engine/                 # Engine implementations
│
└── viewer/                      # Viewer application layer
    ├── ai/                     # AI features
    ├── collaboration/          # Review bundles
    ├── components/             # React UI components
    │   ├── ObjectSelectionOverlay.tsx
    │   └── BusyStateOverlay.tsx
    ├── export/                 # Export pipeline
    ├── hooks/                  # Shared hooks
    ├── import/                 # File import
    ├── integrity/              # Document integrity
    │   └── documentIntegrityValidator.ts
    ├── interaction/            # Mouse/keyboard handlers
    ├── layout/                 # Object & layout editing
    │   ├── objectDetection.ts
    │   ├── objectMoveEngine.ts
    │   ├── objectResizeEngine.ts
    │   ├── imageReplacePipeline.ts
    │   ├── layoutAlignmentGuides.ts
    │   ├── layoutLayerModel.ts
    │   └── layoutCollisionValidator.ts
    ├── modes/                  # Mode consistency validation
    │   └── modeConsistencyValidator.ts
    ├── native/                 # Native operation guards
    │   └── nativeFileOperations.ts
    ├── performance/            # Performance telemetry
    │   └── performanceTelemetry.ts
    ├── recovery/               # Error recovery
    ├── state/                  # App state
    │   ├── editTelemetry.ts
    │   ├── editStateValidator.ts
    │   ├── errorCenter.ts
    │   ├── autosaveManager.ts
    │   └── appSettings.ts
    ├── text/                   # Text mutation pipeline
    │   ├── textMutationSupport.ts
    │   ├── textMutationFidelity.ts
    │   ├── textMutationMessaging.ts
    │   └── fontMutationSupport.ts
    ├── tools/                  # Tool implementations
    ├── validation/             # Input validation
    │   └── filePathValidator.ts
    └── ViewerApp.tsx           # Root viewer component

tests/
├── *.test.ts                   # Unit / integration tests
├── e2e/                        # Playwright E2E tests
│   └── workflows/
├── native/                     # Native operation tests
├── performance/                # Stress tests
├── release/                    # Release acceptance matrix
└── workflows/                  # Workflow corpus
```

---

## Decision Records

### 2026-03-13: Engine Interface Design
**Decision**: Use `Result<T, E>` pattern for all engine operations
**Rationale**: Type-safe error handling, consistent across all interfaces

### 2026-03-13: Runtime Adapter Architecture
**Decision**: Three-layer architecture: Runtime Registry → Runtime Adapters → EngineFactory
**Components**: `RuntimeRegistry`, `RuntimeAdapter`, `RuntimeAdapterFactory`

### 2026-03-13: Mock Engine Minimalism
**Decision**: Mock engines implement only interfaces, no real PDF logic
**Rationale**: Fast compilation, enables testing without XFA SDK dependency

### 2026-03-15: Text Mutation Constraints
**Decision**: `MutationConstraints.expansionChars` is optional (defaults to 0) for bbox-aware expansion
**Rationale**: Backward compatibility with all existing Phase 4 tests; strict equal-or-shorter preserved for tight bboxes

### 2026-03-15: IDENTITY_MATRIX as shared constant
**Decision**: `IDENTITY_MATRIX = [1, 0, 0, 1, 0, 0]` exported from `objectDetection.ts`
**Rationale**: Single source of truth for all layout modules; prevents drift

### 2026-03-17: Reliability hardening as pre-release gate
**Decision**: `releaseAcceptanceMatrix.ts` defines 25 criteria across 13 areas that must all pass as blocking before any release
**Rationale**: Formalises the release gate into version-controlled, machine-checkable criteria rather than a manual checklist

### 2026-03-17: Performance telemetry ring buffer
**Decision**: `MAX_PERF_EVENTS = 1000`, separate from edit telemetry (`MAX_EVENTS = 500`)
**Rationale**: Performance events are higher frequency (per page render); larger buffer enables meaningful p99 computation over a full session

---

## Version History

### 2026-03-13: Initial Architecture
- Core engine interfaces, mock engine, runtime model

### 2026-03-13: Runtime Adapter Architecture (Issue #60)
- `RuntimeRegistry`, `RuntimeAdapterFactory`, `TauriRuntimeAdapter`, `BrowserTestRuntimeAdapter`

### 2026-03-15: Real Text Edit Verification & Expansion (10 batches)
- Full text mutation pipeline: `textMutationSupport`, `textMutationFidelity`, `textMutationMessaging`, `fontMutationSupport`
- Edit telemetry ring buffer with `window.__pdfluent_test__` hook
- Bbox-aware expansion via `computeBboxExpansionChars`
- 7 `FontEncodingClass` values with Dutch messaging

### 2026-03-15: Object & Layout Editing Excellence (10 batches)
- Complete layout object detection and classification pipeline
- Move engine (4 outcomes), resize engine (`MIN_OBJECT_SIZE = 10`), image replace pipeline
- Alignment guides (`SNAP_THRESHOLD = 6`), layer model (z-order + OCG), collision validator
- `ObjectSelectionOverlay` component with 8 resize handles and `pdfRectToDom`

### 2026-03-17: Acrobat-Class Reliability & UX Hardening (10 batches)
- Workflow corpus (6 workflows, 4 release-gating)
- Document integrity validator with critical/warning/info severity
- Edit state validator: 7 modes, typed transition table, session consistency
- Error center hardened: query helpers, deduplication, capacity guard, 8 factory helpers
- `BusyStateOverlay` component with progress, cancel, severity
- Large-document stress tests (500 pages, 500 objects, ring buffer overflow)
- Mode consistency validator (7 consistency codes)
- Native file operation guards (open/save/save-as/export, path utilities)
- Performance telemetry (p50/p95/p99, budget monitor, timer helpers)
- Release acceptance matrix (25 criteria, 13 feature areas, version-controlled gate)
- Test totals: **317 test files, 6350 tests, 6345 passing**

---

*This document is a living document. Update after each major architectural change or implementation block.*
