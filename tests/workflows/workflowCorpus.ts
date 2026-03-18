// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Real Workflow Corpus — ACROBAT_CLASS_RELIABILITY_AND_UX_HARDENING_BLOCK Batch 1
 *
 * Defines real user workflows that must never break in PDFluent.
 * Each workflow is a sequence of typed steps representing an actual user
 * interaction pattern. These are the benchmark for reliability:
 * if any of these workflows produces an unexpected outcome, the editor
 * is not production-ready.
 *
 * Workflows:
 *   - open_review_comment_save
 *   - open_edit_text_save_reopen
 *   - open_move_object_save_reopen
 *   - open_annotate_export_audit
 *   - open_redact_save
 *   - open_large_navigate_edit_save
 *
 * Each step has: action, expected outcome, and a severity level.
 * Severity 'critical' means the workflow must be blocked or aborted on failure.
 */

// ---------------------------------------------------------------------------
// Step types
// ---------------------------------------------------------------------------

export type WorkflowAction =
  | 'open_document'
  | 'navigate_to_page'
  | 'hover_text'
  | 'select_text'
  | 'enter_edit_mode'
  | 'type_replacement'
  | 'commit_edit'
  | 'cancel_edit'
  | 'add_comment'
  | 'add_highlight'
  | 'add_stamp'
  | 'move_object'
  | 'resize_object'
  | 'replace_image'
  | 'apply_redaction'
  | 'fill_form_field'
  | 'save_document'
  | 'reopen_document'
  | 'export_audit_report'
  | 'verify_page_count'
  | 'verify_text_content'
  | 'verify_annotation_count'
  | 'verify_form_field_value'
  | 'verify_object_position';

export type StepSeverity = 'critical' | 'major' | 'minor';
export type StepOutcome = 'success' | 'blocked' | 'warning' | 'any';

export interface WorkflowStep {
  /** Human-readable description of the step. */
  readonly description: string;
  /** The action performed. */
  readonly action: WorkflowAction;
  /** Expected outcome of this step. */
  readonly expectedOutcome: StepOutcome;
  /** Severity if this step fails. */
  readonly severity: StepSeverity;
  /** Optional parameters for the action. */
  readonly params?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Workflow entry
// ---------------------------------------------------------------------------

export type WorkflowCategory =
  | 'review'
  | 'text_editing'
  | 'layout_editing'
  | 'annotation'
  | 'redaction'
  | 'forms'
  | 'large_document';

export interface WorkflowEntry {
  /** Unique identifier. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Category of the workflow. */
  readonly category: WorkflowCategory;
  /** Description of what this workflow validates. */
  readonly description: string;
  /** Ordered list of steps. */
  readonly steps: readonly WorkflowStep[];
  /**
   * Whether this workflow must be included in the release acceptance gate.
   * All critical workflows must pass before any release.
   */
  readonly releaseGating: boolean;
}

// ---------------------------------------------------------------------------
// Workflow definitions
// ---------------------------------------------------------------------------

const openReviewCommentSave: WorkflowEntry = {
  id: 'open_review_comment_save',
  name: 'Open → Review → Comment → Save',
  category: 'review',
  description: 'User opens a document, reads it, adds a comment, and saves.',
  releaseGating: true,
  steps: [
    { description: 'Open a standard digital PDF', action: 'open_document', expectedOutcome: 'success', severity: 'critical' },
    { description: 'Navigate to page 2', action: 'navigate_to_page', expectedOutcome: 'success', severity: 'major', params: { page: 2 } },
    { description: 'Add a text highlight annotation', action: 'add_highlight', expectedOutcome: 'success', severity: 'major' },
    { description: 'Add a sticky note comment', action: 'add_comment', expectedOutcome: 'success', severity: 'major', params: { text: 'Review note' } },
    { description: 'Save the document', action: 'save_document', expectedOutcome: 'success', severity: 'critical' },
    { description: 'Verify annotation count increased', action: 'verify_annotation_count', expectedOutcome: 'success', severity: 'critical', params: { minCount: 2 } },
  ],
};

const openEditTextSaveReopen: WorkflowEntry = {
  id: 'open_edit_text_save_reopen',
  name: 'Open → Edit Text → Save → Reopen',
  category: 'text_editing',
  description: 'User edits a text span, saves, and reopens to verify the edit persisted.',
  releaseGating: true,
  steps: [
    { description: 'Open a digital PDF with text', action: 'open_document', expectedOutcome: 'success', severity: 'critical' },
    { description: 'Select an editable text span', action: 'select_text', expectedOutcome: 'success', severity: 'critical' },
    { description: 'Enter edit mode', action: 'enter_edit_mode', expectedOutcome: 'success', severity: 'critical' },
    { description: 'Type replacement text (equal or shorter)', action: 'type_replacement', expectedOutcome: 'success', severity: 'critical', params: { replacement: 'Updated', maxLength: 10 } },
    { description: 'Commit the edit', action: 'commit_edit', expectedOutcome: 'success', severity: 'critical' },
    { description: 'Save the document', action: 'save_document', expectedOutcome: 'success', severity: 'critical' },
    { description: 'Reopen the document', action: 'reopen_document', expectedOutcome: 'success', severity: 'critical' },
    { description: 'Verify text content is preserved', action: 'verify_text_content', expectedOutcome: 'success', severity: 'critical', params: { expected: 'Updated' } },
  ],
};

const openMoveObjectSaveReopen: WorkflowEntry = {
  id: 'open_move_object_save_reopen',
  name: 'Open → Move Object → Save → Reopen',
  category: 'layout_editing',
  description: 'User moves an image, saves, and reopens to verify position persisted.',
  releaseGating: true,
  steps: [
    { description: 'Open a PDF containing an image', action: 'open_document', expectedOutcome: 'success', severity: 'critical' },
    { description: 'Select an image object', action: 'select_text', expectedOutcome: 'success', severity: 'critical' },
    { description: 'Move the object 20pt right and 10pt up', action: 'move_object', expectedOutcome: 'success', severity: 'critical', params: { dx: 20, dy: 10 } },
    { description: 'Save the document', action: 'save_document', expectedOutcome: 'success', severity: 'critical' },
    { description: 'Reopen the document', action: 'reopen_document', expectedOutcome: 'success', severity: 'critical' },
    { description: 'Verify object position matches saved values', action: 'verify_object_position', expectedOutcome: 'success', severity: 'critical' },
  ],
};

const openAnnotateExportAudit: WorkflowEntry = {
  id: 'open_annotate_export_audit',
  name: 'Open → Annotate → Export Audit',
  category: 'annotation',
  description: 'User adds annotations and exports an audit report.',
  releaseGating: false,
  steps: [
    { description: 'Open a PDF', action: 'open_document', expectedOutcome: 'success', severity: 'critical' },
    { description: 'Add a stamp annotation', action: 'add_stamp', expectedOutcome: 'success', severity: 'major' },
    { description: 'Add a comment', action: 'add_comment', expectedOutcome: 'success', severity: 'major', params: { text: 'Approved' } },
    { description: 'Export the audit report', action: 'export_audit_report', expectedOutcome: 'success', severity: 'major' },
    { description: 'Verify annotation count in report', action: 'verify_annotation_count', expectedOutcome: 'success', severity: 'major', params: { minCount: 2 } },
  ],
};

const openRedactSave: WorkflowEntry = {
  id: 'open_redact_save',
  name: 'Open → Redact → Save',
  category: 'redaction',
  description: 'User applies redactions to sensitive content and saves.',
  releaseGating: true,
  steps: [
    { description: 'Open a PDF with sensitive text', action: 'open_document', expectedOutcome: 'success', severity: 'critical' },
    { description: 'Apply redaction to text region', action: 'apply_redaction', expectedOutcome: 'success', severity: 'critical' },
    { description: 'Save the document', action: 'save_document', expectedOutcome: 'success', severity: 'critical' },
    { description: 'Reopen and verify redacted content is gone', action: 'reopen_document', expectedOutcome: 'success', severity: 'critical' },
    { description: 'Verify redacted text is not readable', action: 'verify_text_content', expectedOutcome: 'blocked', severity: 'critical', params: { mustNotContain: 'SENSITIVE' } },
  ],
};

const openLargeNavigateEditSave: WorkflowEntry = {
  id: 'open_large_navigate_edit_save',
  name: 'Open Large Doc → Navigate → Edit → Save',
  category: 'large_document',
  description: 'User opens a large (100+ page) PDF, navigates to a page, edits text, and saves.',
  releaseGating: false,
  steps: [
    { description: 'Open a 100+ page PDF', action: 'open_document', expectedOutcome: 'success', severity: 'critical', params: { minPages: 100 } },
    { description: 'Navigate to page 50', action: 'navigate_to_page', expectedOutcome: 'success', severity: 'major', params: { page: 50 } },
    { description: 'Select an editable text span', action: 'select_text', expectedOutcome: 'success', severity: 'major' },
    { description: 'Enter edit mode', action: 'enter_edit_mode', expectedOutcome: 'success', severity: 'major' },
    { description: 'Type replacement text', action: 'type_replacement', expectedOutcome: 'success', severity: 'major', params: { replacement: 'Edited' } },
    { description: 'Commit the edit', action: 'commit_edit', expectedOutcome: 'success', severity: 'major' },
    { description: 'Save the document', action: 'save_document', expectedOutcome: 'success', severity: 'critical' },
    { description: 'Verify page count unchanged', action: 'verify_page_count', expectedOutcome: 'success', severity: 'critical', params: { minPages: 100 } },
  ],
};

// ---------------------------------------------------------------------------
// Corpus
// ---------------------------------------------------------------------------

export const WORKFLOW_CORPUS: readonly WorkflowEntry[] = [
  openReviewCommentSave,
  openEditTextSaveReopen,
  openMoveObjectSaveReopen,
  openAnnotateExportAudit,
  openRedactSave,
  openLargeNavigateEditSave,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return all workflows in the corpus. */
export function getAllWorkflows(): readonly WorkflowEntry[] {
  return WORKFLOW_CORPUS;
}

/** Return workflows that must pass before release. */
export function getReleaseGatingWorkflows(): readonly WorkflowEntry[] {
  return WORKFLOW_CORPUS.filter(w => w.releaseGating);
}

/** Return workflows in a specific category. */
export function getWorkflowsByCategory(category: WorkflowCategory): readonly WorkflowEntry[] {
  return WORKFLOW_CORPUS.filter(w => w.category === category);
}

/** Return all critical steps across all workflows. */
export function getCriticalSteps(): Array<{ workflowId: string; step: WorkflowStep }> {
  return WORKFLOW_CORPUS.flatMap(w =>
    w.steps
      .filter(s => s.severity === 'critical')
      .map(s => ({ workflowId: w.id, step: s })),
  );
}

/** Return a workflow by id, or null if not found. */
export function getWorkflowById(id: string): WorkflowEntry | null {
  return WORKFLOW_CORPUS.find(w => w.id === id) ?? null;
}
