// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Workflow Corpus Tests — ACROBAT_CLASS_RELIABILITY_AND_UX_HARDENING_BLOCK Batch 1
 *
 * Validates the real workflow corpus definitions:
 * - All 6 workflows are present and structurally valid
 * - All release-gating workflows are correct
 * - All workflows have valid step structure
 * - Helper functions return correct results
 * - Critical steps are correctly identified
 * - Category filtering works
 * - Step severity/outcome types are valid
 */

import { describe, it, expect } from 'vitest';
import {
  getAllWorkflows,
  getReleaseGatingWorkflows,
  getWorkflowsByCategory,
  getCriticalSteps,
  getWorkflowById,
  WORKFLOW_CORPUS,
} from './workflowCorpus';
import type { WorkflowEntry, WorkflowAction, StepSeverity, StepOutcome, WorkflowCategory } from './workflowCorpus';

// ---------------------------------------------------------------------------
// Corpus structure
// ---------------------------------------------------------------------------

describe('workflowCorpus — corpus structure', () => {
  it('WORKFLOW_CORPUS has exactly 6 workflows', () => {
    expect(WORKFLOW_CORPUS).toHaveLength(6);
  });

  it('all workflow ids are unique', () => {
    const ids = WORKFLOW_CORPUS.map(w => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all workflows have non-empty id, name, description', () => {
    for (const w of WORKFLOW_CORPUS) {
      expect(w.id.length).toBeGreaterThan(0);
      expect(w.name.length).toBeGreaterThan(0);
      expect(w.description.length).toBeGreaterThan(0);
    }
  });

  it('all workflows have at least one step', () => {
    for (const w of WORKFLOW_CORPUS) {
      expect(w.steps.length).toBeGreaterThan(0);
    }
  });

  it('all workflows have a boolean releaseGating', () => {
    for (const w of WORKFLOW_CORPUS) {
      expect(typeof w.releaseGating).toBe('boolean');
    }
  });
});

// ---------------------------------------------------------------------------
// Expected workflow ids
// ---------------------------------------------------------------------------

describe('workflowCorpus — expected workflow ids', () => {
  const expectedIds = [
    'open_review_comment_save',
    'open_edit_text_save_reopen',
    'open_move_object_save_reopen',
    'open_annotate_export_audit',
    'open_redact_save',
    'open_large_navigate_edit_save',
  ];

  for (const id of expectedIds) {
    it(`workflow '${id}' is present`, () => {
      expect(WORKFLOW_CORPUS.some(w => w.id === id)).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Step structure validity
// ---------------------------------------------------------------------------

const VALID_SEVERITIES: StepSeverity[] = ['critical', 'major', 'minor'];
const VALID_OUTCOMES: StepOutcome[] = ['success', 'blocked', 'warning', 'any'];

describe('workflowCorpus — step structure validity', () => {
  it('all steps have non-empty description', () => {
    for (const w of WORKFLOW_CORPUS) {
      for (const s of w.steps) {
        expect(s.description.length).toBeGreaterThan(0);
      }
    }
  });

  it('all steps have valid severity', () => {
    for (const w of WORKFLOW_CORPUS) {
      for (const s of w.steps) {
        expect(VALID_SEVERITIES).toContain(s.severity);
      }
    }
  });

  it('all steps have valid expectedOutcome', () => {
    for (const w of WORKFLOW_CORPUS) {
      for (const s of w.steps) {
        expect(VALID_OUTCOMES).toContain(s.expectedOutcome);
      }
    }
  });

  it('all steps have a non-empty action string', () => {
    for (const w of WORKFLOW_CORPUS) {
      for (const s of w.steps) {
        expect(typeof s.action).toBe('string');
        expect(s.action.length).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Release gating
// ---------------------------------------------------------------------------

describe('workflowCorpus — release gating', () => {
  it('at least one workflow is release-gating', () => {
    expect(WORKFLOW_CORPUS.some(w => w.releaseGating)).toBe(true);
  });

  it('open_review_comment_save is release-gating', () => {
    expect(getWorkflowById('open_review_comment_save')?.releaseGating).toBe(true);
  });

  it('open_edit_text_save_reopen is release-gating', () => {
    expect(getWorkflowById('open_edit_text_save_reopen')?.releaseGating).toBe(true);
  });

  it('open_move_object_save_reopen is release-gating', () => {
    expect(getWorkflowById('open_move_object_save_reopen')?.releaseGating).toBe(true);
  });

  it('open_redact_save is release-gating', () => {
    expect(getWorkflowById('open_redact_save')?.releaseGating).toBe(true);
  });

  it('open_annotate_export_audit is NOT release-gating', () => {
    expect(getWorkflowById('open_annotate_export_audit')?.releaseGating).toBe(false);
  });

  it('open_large_navigate_edit_save is NOT release-gating', () => {
    expect(getWorkflowById('open_large_navigate_edit_save')?.releaseGating).toBe(false);
  });

  it('getReleaseGatingWorkflows returns only gated workflows', () => {
    const gated = getReleaseGatingWorkflows();
    for (const w of gated) {
      expect(w.releaseGating).toBe(true);
    }
  });

  it('getReleaseGatingWorkflows returns exactly 4 workflows', () => {
    expect(getReleaseGatingWorkflows()).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// getAllWorkflows
// ---------------------------------------------------------------------------

describe('workflowCorpus — getAllWorkflows', () => {
  it('returns all 6 workflows', () => {
    expect(getAllWorkflows()).toHaveLength(6);
  });

  it('is readonly (same reference as WORKFLOW_CORPUS)', () => {
    expect(getAllWorkflows()).toBe(WORKFLOW_CORPUS);
  });
});

// ---------------------------------------------------------------------------
// getWorkflowById
// ---------------------------------------------------------------------------

describe('workflowCorpus — getWorkflowById', () => {
  it('returns correct workflow for known id', () => {
    const w = getWorkflowById('open_review_comment_save');
    expect(w).not.toBeNull();
    expect(w!.id).toBe('open_review_comment_save');
  });

  it('returns null for unknown id', () => {
    expect(getWorkflowById('nonexistent_workflow')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(getWorkflowById('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getWorkflowsByCategory
// ---------------------------------------------------------------------------

describe('workflowCorpus — getWorkflowsByCategory', () => {
  it('review category returns open_review_comment_save', () => {
    const workflows = getWorkflowsByCategory('review');
    expect(workflows.some(w => w.id === 'open_review_comment_save')).toBe(true);
  });

  it('text_editing category returns open_edit_text_save_reopen', () => {
    const workflows = getWorkflowsByCategory('text_editing');
    expect(workflows.some(w => w.id === 'open_edit_text_save_reopen')).toBe(true);
  });

  it('layout_editing category returns open_move_object_save_reopen', () => {
    const workflows = getWorkflowsByCategory('layout_editing');
    expect(workflows.some(w => w.id === 'open_move_object_save_reopen')).toBe(true);
  });

  it('annotation category returns open_annotate_export_audit', () => {
    const workflows = getWorkflowsByCategory('annotation');
    expect(workflows.some(w => w.id === 'open_annotate_export_audit')).toBe(true);
  });

  it('redaction category returns open_redact_save', () => {
    const workflows = getWorkflowsByCategory('redaction');
    expect(workflows.some(w => w.id === 'open_redact_save')).toBe(true);
  });

  it('large_document category returns open_large_navigate_edit_save', () => {
    const workflows = getWorkflowsByCategory('large_document');
    expect(workflows.some(w => w.id === 'open_large_navigate_edit_save')).toBe(true);
  });

  it('unknown category returns empty array', () => {
    expect(getWorkflowsByCategory('forms' as WorkflowCategory)).toHaveLength(0);
  });

  it('all workflows belong to known categories', () => {
    const validCategories: WorkflowCategory[] = [
      'review', 'text_editing', 'layout_editing', 'annotation', 'redaction', 'forms', 'large_document',
    ];
    for (const w of WORKFLOW_CORPUS) {
      expect(validCategories).toContain(w.category);
    }
  });
});

// ---------------------------------------------------------------------------
// getCriticalSteps
// ---------------------------------------------------------------------------

describe('workflowCorpus — getCriticalSteps', () => {
  it('returns an array', () => {
    expect(Array.isArray(getCriticalSteps())).toBe(true);
  });

  it('every entry has workflowId and step', () => {
    for (const entry of getCriticalSteps()) {
      expect(typeof entry.workflowId).toBe('string');
      expect(entry.workflowId.length).toBeGreaterThan(0);
      expect(entry.step).toBeDefined();
      expect(entry.step.severity).toBe('critical');
    }
  });

  it('all workflowIds in critical steps reference known workflows', () => {
    const ids = new Set(WORKFLOW_CORPUS.map(w => w.id));
    for (const entry of getCriticalSteps()) {
      expect(ids.has(entry.workflowId)).toBe(true);
    }
  });

  it('there are critical steps across multiple workflows', () => {
    const workflowIds = new Set(getCriticalSteps().map(e => e.workflowId));
    expect(workflowIds.size).toBeGreaterThan(1);
  });

  it('open_document steps are critical in gated workflows', () => {
    const criticalOpenSteps = getCriticalSteps().filter(
      e => e.step.action === 'open_document',
    );
    expect(criticalOpenSteps.length).toBeGreaterThan(0);
  });

  it('save_document steps are critical in gated workflows', () => {
    const criticalSaveSteps = getCriticalSteps().filter(
      e => e.step.action === 'save_document',
    );
    expect(criticalSaveSteps.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Specific workflow content
// ---------------------------------------------------------------------------

describe('workflowCorpus — open_redact_save workflow content', () => {
  it('has a step with expectedOutcome blocked (redact verification)', () => {
    const w = getWorkflowById('open_redact_save')!;
    expect(w.steps.some(s => s.expectedOutcome === 'blocked')).toBe(true);
  });

  it('verify_text_content step has mustNotContain param', () => {
    const w = getWorkflowById('open_redact_save')!;
    const verifyStep = w.steps.find(s => s.action === 'verify_text_content');
    expect(verifyStep).toBeDefined();
    expect(verifyStep!.params?.mustNotContain).toBeDefined();
  });
});

describe('workflowCorpus — open_edit_text_save_reopen workflow content', () => {
  it('has enter_edit_mode and commit_edit steps', () => {
    const w = getWorkflowById('open_edit_text_save_reopen')!;
    expect(w.steps.some(s => s.action === 'enter_edit_mode')).toBe(true);
    expect(w.steps.some(s => s.action === 'commit_edit')).toBe(true);
  });

  it('type_replacement step has replacement param', () => {
    const w = getWorkflowById('open_edit_text_save_reopen')!;
    const typeStep = w.steps.find(s => s.action === 'type_replacement');
    expect(typeStep!.params?.replacement).toBe('Updated');
  });

  it('has reopen_document step after save_document', () => {
    const w = getWorkflowById('open_edit_text_save_reopen')!;
    const saveIdx = w.steps.findIndex(s => s.action === 'save_document');
    const reopenIdx = w.steps.findIndex(s => s.action === 'reopen_document');
    expect(reopenIdx).toBeGreaterThan(saveIdx);
  });
});

describe('workflowCorpus — open_large_navigate_edit_save workflow content', () => {
  it('open_document step requires minPages 100', () => {
    const w = getWorkflowById('open_large_navigate_edit_save')!;
    const openStep = w.steps.find(s => s.action === 'open_document');
    expect(openStep!.params?.minPages).toBe(100);
  });

  it('navigate_to_page step targets page 50', () => {
    const w = getWorkflowById('open_large_navigate_edit_save')!;
    const navStep = w.steps.find(s => s.action === 'navigate_to_page');
    expect(navStep!.params?.page).toBe(50);
  });

  it('verify_page_count step checks minPages 100', () => {
    const w = getWorkflowById('open_large_navigate_edit_save')!;
    const verifyStep = w.steps.find(s => s.action === 'verify_page_count');
    expect(verifyStep!.params?.minPages).toBe(100);
  });
});
