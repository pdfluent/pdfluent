// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Release Acceptance Matrix Tests — ACROBAT_CLASS_RELIABILITY_AND_UX_HARDENING_BLOCK Batch 10
 *
 * Validates the release acceptance matrix structure and helper functions.
 * Also acts as the aggregate release gate: verifies that all feature areas
 * from the ACROBAT_CLASS_RELIABILITY_AND_UX_HARDENING_BLOCK are covered by
 * at least one blocking criterion.
 *
 * Verified:
 * - Matrix has a valid version and description
 * - All criteria have unique IDs
 * - All criteria reference non-empty test files
 * - All severity values are valid
 * - All feature areas are valid
 * - getBlockingCriteria / getWarnCriteria return consistent subsets
 * - getCriteriaByArea returns correct entries
 * - getCriterionById returns correct entry or null
 * - getCriteriaByWorkflow links to known workflow IDs
 * - getCoveredAreas covers all required feature areas
 * - At least one blocking criterion per critical feature area
 */

import { describe, it, expect } from 'vitest';
import {
  RELEASE_ACCEPTANCE_MATRIX,
  getBlockingCriteria,
  getWarnCriteria,
  getCriteriaByArea,
  getCriterionById,
  getCriteriaByWorkflow,
  getCoveredAreas,
} from './releaseAcceptanceMatrix';
import type { AcceptanceSeverity, FeatureArea } from './releaseAcceptanceMatrix';

// ---------------------------------------------------------------------------
// Matrix structure
// ---------------------------------------------------------------------------

describe('releaseAcceptanceMatrix — structure', () => {
  it('has a non-empty version string', () => {
    expect(RELEASE_ACCEPTANCE_MATRIX.version.length).toBeGreaterThan(0);
  });

  it('has a non-empty description', () => {
    expect(RELEASE_ACCEPTANCE_MATRIX.description.length).toBeGreaterThan(0);
  });

  it('has at least 10 criteria', () => {
    expect(RELEASE_ACCEPTANCE_MATRIX.criteria.length).toBeGreaterThanOrEqual(10);
  });

  it('all criterion IDs are unique', () => {
    const ids = RELEASE_ACCEPTANCE_MATRIX.criteria.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all criteria have non-empty IDs', () => {
    for (const c of RELEASE_ACCEPTANCE_MATRIX.criteria) {
      expect(c.id.length).toBeGreaterThan(0);
    }
  });

  it('all criteria have non-empty descriptions', () => {
    for (const c of RELEASE_ACCEPTANCE_MATRIX.criteria) {
      expect(c.description.length).toBeGreaterThan(0);
    }
  });

  it('all criteria reference at least one test file', () => {
    for (const c of RELEASE_ACCEPTANCE_MATRIX.criteria) {
      expect(c.coveredBy.length).toBeGreaterThan(0);
      for (const file of c.coveredBy) {
        expect(file.length).toBeGreaterThan(0);
        expect(file).toMatch(/\.ts$/);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Severity validity
// ---------------------------------------------------------------------------

describe('releaseAcceptanceMatrix — severity validity', () => {
  const validSeverities: AcceptanceSeverity[] = ['block', 'warn'];

  it('all criteria have valid severity', () => {
    for (const c of RELEASE_ACCEPTANCE_MATRIX.criteria) {
      expect(validSeverities).toContain(c.severity);
    }
  });

  it('at least one blocking criterion exists', () => {
    expect(RELEASE_ACCEPTANCE_MATRIX.criteria.some(c => c.severity === 'block')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Feature area validity
// ---------------------------------------------------------------------------

describe('releaseAcceptanceMatrix — feature area validity', () => {
  const validAreas: FeatureArea[] = [
    'document_open', 'text_editing', 'layout_editing', 'annotation',
    'redaction', 'forms', 'save_export', 'performance', 'integrity',
    'state_machine', 'error_handling', 'native_operations',
    'workflow_corpus', 'mode_consistency',
  ];

  it('all criteria have valid feature areas', () => {
    for (const c of RELEASE_ACCEPTANCE_MATRIX.criteria) {
      expect(validAreas).toContain(c.area);
    }
  });
});

// ---------------------------------------------------------------------------
// getBlockingCriteria
// ---------------------------------------------------------------------------

describe('releaseAcceptanceMatrix — getBlockingCriteria', () => {
  it('returns only block-severity criteria', () => {
    const blocking = getBlockingCriteria();
    expect(blocking.length).toBeGreaterThan(0);
    for (const c of blocking) {
      expect(c.severity).toBe('block');
    }
  });

  it('blocking + warn count equals total', () => {
    const total = RELEASE_ACCEPTANCE_MATRIX.criteria.length;
    expect(getBlockingCriteria().length + getWarnCriteria().length).toBe(total);
  });
});

// ---------------------------------------------------------------------------
// getWarnCriteria
// ---------------------------------------------------------------------------

describe('releaseAcceptanceMatrix — getWarnCriteria', () => {
  it('returns only warn-severity criteria', () => {
    const warns = getWarnCriteria();
    for (const c of warns) {
      expect(c.severity).toBe('warn');
    }
  });
});

// ---------------------------------------------------------------------------
// getCriteriaByArea
// ---------------------------------------------------------------------------

describe('releaseAcceptanceMatrix — getCriteriaByArea', () => {
  it('returns criteria for document_open area', () => {
    const criteria = getCriteriaByArea('document_open');
    expect(criteria.length).toBeGreaterThan(0);
    for (const c of criteria) {
      expect(c.area).toBe('document_open');
    }
  });

  it('returns empty for forms (no criteria defined in this matrix)', () => {
    expect(getCriteriaByArea('forms')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getCriterionById
// ---------------------------------------------------------------------------

describe('releaseAcceptanceMatrix — getCriterionById', () => {
  it('returns the correct criterion for a known id', () => {
    const c = getCriterionById('doc-open-valid');
    expect(c).not.toBeNull();
    expect(c!.id).toBe('doc-open-valid');
    expect(c!.area).toBe('document_open');
  });

  it('returns null for unknown id', () => {
    expect(getCriterionById('no-such-criterion')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(getCriterionById('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getCriteriaByWorkflow
// ---------------------------------------------------------------------------

describe('releaseAcceptanceMatrix — getCriteriaByWorkflow', () => {
  it('returns criteria linked to open_edit_text_save_reopen', () => {
    const linked = getCriteriaByWorkflow('open_edit_text_save_reopen');
    expect(linked.length).toBeGreaterThan(0);
    for (const c of linked) {
      expect(c.linkedToWorkflow).toBe('open_edit_text_save_reopen');
    }
  });

  it('returns empty array for unknown workflow', () => {
    expect(getCriteriaByWorkflow('nonexistent_workflow')).toHaveLength(0);
  });

  it('workflow-linked criteria are for critical workflows', () => {
    const workflowIds = ['open_review_comment_save', 'open_edit_text_save_reopen',
      'open_move_object_save_reopen', 'open_redact_save'];
    for (const wid of workflowIds) {
      const linked = getCriteriaByWorkflow(wid);
      expect(linked.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// getCoveredAreas
// ---------------------------------------------------------------------------

describe('releaseAcceptanceMatrix — getCoveredAreas', () => {
  it('returns array of unique areas', () => {
    const areas = getCoveredAreas();
    expect(new Set(areas).size).toBe(areas.length);
  });

  it('covers all critical feature areas', () => {
    const areas = getCoveredAreas();
    const criticalAreas: FeatureArea[] = [
      'document_open', 'text_editing', 'layout_editing',
      'redaction', 'save_export', 'performance', 'integrity',
      'state_machine', 'error_handling', 'native_operations',
      'workflow_corpus', 'mode_consistency',
    ];
    for (const area of criticalAreas) {
      expect(areas).toContain(area);
    }
  });
});

// ---------------------------------------------------------------------------
// Aggregate gate — at least one blocking criterion per critical area
// ---------------------------------------------------------------------------

describe('releaseAcceptanceMatrix — aggregate gate', () => {
  const criticalAreas: FeatureArea[] = [
    'document_open',
    'text_editing',
    'layout_editing',
    'redaction',
    'save_export',
    'integrity',
    'state_machine',
    'error_handling',
    'native_operations',
    'workflow_corpus',
    'mode_consistency',
  ];

  for (const area of criticalAreas) {
    it(`${area} has at least one blocking criterion`, () => {
      const blocking = getCriteriaByArea(area).filter(c => c.severity === 'block');
      expect(blocking.length).toBeGreaterThan(0);
    });
  }

  it('workflow_corpus has exactly 4 release-gating workflow links defined', () => {
    // The workflow corpus defines 4 gating workflows — each must be linked
    const gatingWorkflows = [
      'open_review_comment_save',
      'open_edit_text_save_reopen',
      'open_move_object_save_reopen',
      'open_redact_save',
    ];
    for (const wid of gatingWorkflows) {
      expect(getCriteriaByWorkflow(wid).length).toBeGreaterThan(0);
    }
  });

  it('total blocking criteria count meets minimum for a release gate', () => {
    // At minimum, the critical areas must each have a blocking criterion — 11 areas
    expect(getBlockingCriteria().length).toBeGreaterThanOrEqual(11);
  });
});
