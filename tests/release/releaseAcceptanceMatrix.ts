// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Release Acceptance Matrix — ACROBAT_CLASS_RELIABILITY_AND_UX_HARDENING_BLOCK Batch 10
 *
 * Defines the complete acceptance gate for a PDFluent release.
 * A release is only permitted when ALL matrix entries pass.
 *
 * The matrix captures:
 *   - Which feature area is covered
 *   - What the acceptance criteria is
 *   - What severity a failure has (block = release blocked, warn = advisory)
 *   - Which test file(s) provide coverage
 *
 * This module is pure data — it has no runtime effects.
 * The companion test file (`release-acceptance-matrix.test.ts`) validates
 * the matrix structure and runs the aggregate pass/fail logic.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AcceptanceSeverity = 'block' | 'warn';

export type FeatureArea =
  | 'document_open'
  | 'text_editing'
  | 'layout_editing'
  | 'annotation'
  | 'redaction'
  | 'forms'
  | 'save_export'
  | 'performance'
  | 'integrity'
  | 'state_machine'
  | 'error_handling'
  | 'native_operations'
  | 'workflow_corpus'
  | 'mode_consistency';

export interface AcceptanceCriterion {
  /** Unique identifier within the matrix. */
  readonly id: string;
  /** Feature area this criterion belongs to. */
  readonly area: FeatureArea;
  /** Human-readable description of what must pass. */
  readonly description: string;
  /** Severity when this criterion fails. */
  readonly severity: AcceptanceSeverity;
  /**
   * Test file(s) that provide coverage for this criterion.
   * Relative to the `tests/` directory.
   */
  readonly coveredBy: readonly string[];
  /** Whether this criterion is tied to a release-gating workflow. */
  readonly linkedToWorkflow?: string;
}

export interface AcceptanceMatrix {
  readonly criteria: readonly AcceptanceCriterion[];
  readonly version: string;
  readonly description: string;
}

// ---------------------------------------------------------------------------
// Matrix definition
// ---------------------------------------------------------------------------

const CRITERIA: readonly AcceptanceCriterion[] = [
  // Document open
  {
    id: 'doc-open-valid',
    area: 'document_open',
    description: 'Valid PDFs open without integrity violations.',
    severity: 'block',
    coveredBy: ['viewer-document-integrity-validator.test.ts'],
    linkedToWorkflow: 'open_review_comment_save',
  },
  {
    id: 'doc-open-path-guard',
    area: 'document_open',
    description: 'Open paths are validated before reaching Tauri.',
    severity: 'block',
    coveredBy: ['native/native-file-operations.test.ts'],
  },

  // Text editing
  {
    id: 'text-edit-validation',
    area: 'text_editing',
    description: 'validateReplacement enforces equal-or-shorter constraint.',
    severity: 'block',
    coveredBy: ['viewer-text-mutation-support.test.ts'],
    linkedToWorkflow: 'open_edit_text_save_reopen',
  },
  {
    id: 'text-edit-telemetry',
    area: 'text_editing',
    description: 'Edit telemetry ring buffer caps at MAX_EVENTS.',
    severity: 'warn',
    coveredBy: ['viewer-edit-telemetry.test.ts'],
  },
  {
    id: 'text-edit-font-support',
    area: 'text_editing',
    description: 'Font encoding classes are all handled by messaging.',
    severity: 'block',
    coveredBy: ['viewer-text-mutation-messaging-extended.test.ts'],
  },

  // Layout editing
  {
    id: 'layout-object-detection',
    area: 'layout_editing',
    description: 'All 5 raw object types are detected and classified.',
    severity: 'block',
    coveredBy: ['viewer-object-detection.test.ts', 'viewer-layout-stability.test.ts'],
    linkedToWorkflow: 'open_move_object_save_reopen',
  },
  {
    id: 'layout-move-engine',
    area: 'layout_editing',
    description: 'Move engine clamps to page bounds and blocks form_widget.',
    severity: 'block',
    coveredBy: ['viewer-object-move-engine.test.ts'],
  },
  {
    id: 'layout-resize-engine',
    area: 'layout_editing',
    description: 'Resize engine respects MIN_OBJECT_SIZE.',
    severity: 'block',
    coveredBy: ['viewer-object-resize-engine.test.ts'],
  },
  {
    id: 'layout-collision-validator',
    area: 'layout_editing',
    description: 'Collision validator returns clean report for valid moves.',
    severity: 'block',
    coveredBy: ['viewer-layout-collision-validator.test.ts'],
  },

  // Annotation
  {
    id: 'annotation-workflow',
    area: 'annotation',
    description: 'Annotation workflow corpus passes all steps.',
    severity: 'warn',
    coveredBy: ['workflows/viewer-workflow-corpus.test.ts'],
    linkedToWorkflow: 'open_annotate_export_audit',
  },

  // Redaction
  {
    id: 'redaction-workflow',
    area: 'redaction',
    description: 'Redaction workflow blocks re-reading of SENSITIVE content.',
    severity: 'block',
    coveredBy: ['workflows/viewer-workflow-corpus.test.ts'],
    linkedToWorkflow: 'open_redact_save',
  },

  // Save / export
  {
    id: 'save-path-guard',
    area: 'save_export',
    description: 'Save and export paths are validated before Tauri invoke.',
    severity: 'block',
    coveredBy: ['native/native-file-operations.test.ts'],
  },

  // Performance
  {
    id: 'perf-telemetry-ring-buffer',
    area: 'performance',
    description: 'Performance telemetry ring buffer caps at MAX_PERF_EVENTS.',
    severity: 'warn',
    coveredBy: ['viewer-performance-telemetry.test.ts'],
  },
  {
    id: 'large-doc-stability',
    area: 'performance',
    description: 'Large document workloads (500 pages, 500 objects) do not crash.',
    severity: 'block',
    coveredBy: ['performance/large-document-stress.test.ts'],
  },

  // Document integrity
  {
    id: 'integrity-zero-page',
    area: 'integrity',
    description: 'Documents with 0 pages return critical integrity issue.',
    severity: 'block',
    coveredBy: ['viewer-document-integrity-validator.test.ts'],
  },
  {
    id: 'integrity-safe-to-edit',
    area: 'integrity',
    description: 'Encrypted and edit-locked documents are not safe to edit.',
    severity: 'block',
    coveredBy: ['viewer-document-integrity-validator.test.ts'],
  },

  // State machine
  {
    id: 'state-invalid-transitions-blocked',
    area: 'state_machine',
    description: 'Invalid mode transitions are blocked.',
    severity: 'block',
    coveredBy: ['viewer-edit-state-validator.test.ts'],
  },
  {
    id: 'state-session-presence',
    area: 'state_machine',
    description: 'Edit modes require an active session.',
    severity: 'block',
    coveredBy: ['viewer-edit-state-validator.test.ts'],
  },

  // Error handling
  {
    id: 'error-center-capacity',
    area: 'error_handling',
    description: 'Error center never exceeds ERROR_CENTER_MAX entries.',
    severity: 'block',
    coveredBy: ['viewer-error-center-hardening.test.ts'],
  },
  {
    id: 'error-center-factories',
    area: 'error_handling',
    description: 'All error factory helpers produce correct severity and source.',
    severity: 'block',
    coveredBy: ['viewer-error-center-hardening.test.ts'],
  },

  // Native operations
  {
    id: 'native-open-path-validation',
    area: 'native_operations',
    description: 'Non-PDF paths are rejected before open.',
    severity: 'block',
    coveredBy: ['native/native-file-operations.test.ts'],
  },

  // Workflow corpus
  {
    id: 'workflow-corpus-complete',
    area: 'workflow_corpus',
    description: 'All 6 workflows are present, structurally valid, and correctly categorised.',
    severity: 'block',
    coveredBy: ['workflows/viewer-workflow-corpus.test.ts'],
  },
  {
    id: 'workflow-release-gating',
    area: 'workflow_corpus',
    description: 'Exactly 4 release-gating workflows are defined.',
    severity: 'block',
    coveredBy: ['workflows/viewer-workflow-corpus.test.ts'],
  },

  // Mode consistency
  {
    id: 'mode-single-active',
    area: 'mode_consistency',
    description: 'Multiple simultaneous active modes are blocked.',
    severity: 'block',
    coveredBy: ['viewer-mode-consistency-validator.test.ts'],
  },
  {
    id: 'mode-form-fill-prereq',
    area: 'mode_consistency',
    description: 'Form-fill mode requires a document with form fields.',
    severity: 'block',
    coveredBy: ['viewer-mode-consistency-validator.test.ts'],
  },
];

export const RELEASE_ACCEPTANCE_MATRIX: AcceptanceMatrix = {
  version: '1.0.0',
  description: 'PDFluent release acceptance gate — ACROBAT_CLASS_RELIABILITY_AND_UX_HARDENING_BLOCK',
  criteria: CRITERIA,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return all blocking criteria. */
export function getBlockingCriteria(): readonly AcceptanceCriterion[] {
  return RELEASE_ACCEPTANCE_MATRIX.criteria.filter(c => c.severity === 'block');
}

/** Return all warning criteria. */
export function getWarnCriteria(): readonly AcceptanceCriterion[] {
  return RELEASE_ACCEPTANCE_MATRIX.criteria.filter(c => c.severity === 'warn');
}

/** Return criteria for a specific feature area. */
export function getCriteriaByArea(area: FeatureArea): readonly AcceptanceCriterion[] {
  return RELEASE_ACCEPTANCE_MATRIX.criteria.filter(c => c.area === area);
}

/** Return a criterion by id, or null if not found. */
export function getCriterionById(id: string): AcceptanceCriterion | null {
  return RELEASE_ACCEPTANCE_MATRIX.criteria.find(c => c.id === id) ?? null;
}

/** Return all criteria linked to a workflow id. */
export function getCriteriaByWorkflow(workflowId: string): readonly AcceptanceCriterion[] {
  return RELEASE_ACCEPTANCE_MATRIX.criteria.filter(c => c.linkedToWorkflow === workflowId);
}

/** Return all feature areas covered by the matrix. */
export function getCoveredAreas(): FeatureArea[] {
  return [...new Set(RELEASE_ACCEPTANCE_MATRIX.criteria.map(c => c.area))];
}
