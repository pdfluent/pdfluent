// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Mode Consistency Validator Tests — ACROBAT_CLASS_RELIABILITY_AND_UX_HARDENING_BLOCK Batch 7
 *
 * Verified:
 * - checkSingleActiveMode: blocks when multiple modes active
 * - checkAnnotationToolbarConsistency: warns when annotation toolbar in wrong mode
 * - checkEditOverlayConsistency: warns when edit overlay visible in viewing mode
 * - checkRedactionToolbarConsistency: warns when redaction toolbar in wrong mode
 * - checkFormFillPrerequisite: blocks form-fill on non-form document
 * - checkToolbarModeParity: blocks when toolbar mode differs from editor mode
 * - validateModeConsistency: full check, consistent and inconsistent states
 * - isModeConsistent: quick boolean helper
 */

import { describe, it, expect } from 'vitest';
import {
  checkSingleActiveMode,
  checkAnnotationToolbarConsistency,
  checkEditOverlayConsistency,
  checkRedactionToolbarConsistency,
  checkFormFillPrerequisite,
  checkToolbarModeParity,
  validateModeConsistency,
  isModeConsistent,
} from '../src/viewer/modes/modeConsistencyValidator';
import type { ModeUiState } from '../src/viewer/modes/modeConsistencyValidator';
import type { EditorMode } from '../src/viewer/state/editStateValidator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<ModeUiState> = {}): ModeUiState {
  return {
    mode: 'viewing',
    annotationToolbarVisible: false,
    editOverlayVisible: false,
    redactionToolbarVisible: false,
    formFillOverlayVisible: false,
    documentHasForms: false,
    activeModes: ['viewing'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// checkSingleActiveMode
// ---------------------------------------------------------------------------

describe('modeConsistencyValidator — checkSingleActiveMode', () => {
  it('returns null for single mode', () => {
    expect(checkSingleActiveMode(['viewing'])).toBeNull();
  });

  it('returns null for empty activeModes (no mode)', () => {
    expect(checkSingleActiveMode([])).toBeNull();
  });

  it('returns blocking issue for two active modes', () => {
    const issue = checkSingleActiveMode(['viewing', 'text-edit']);
    expect(issue).not.toBeNull();
    expect(issue!.code).toBe('multiple-active-modes');
    expect(issue!.blocking).toBe(true);
  });

  it('returns blocking issue for three active modes', () => {
    const issue = checkSingleActiveMode(['viewing', 'text-edit', 'annotating']);
    expect(issue!.blocking).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkAnnotationToolbarConsistency
// ---------------------------------------------------------------------------

describe('modeConsistencyValidator — checkAnnotationToolbarConsistency', () => {
  it('returns null when toolbar hidden in any mode', () => {
    const modes: EditorMode[] = ['viewing', 'text-edit', 'annotating'];
    for (const mode of modes) {
      expect(checkAnnotationToolbarConsistency(mode, false)).toBeNull();
    }
  });

  it('returns null when toolbar visible in annotating mode', () => {
    expect(checkAnnotationToolbarConsistency('annotating', true)).toBeNull();
  });

  it('returns non-blocking issue when toolbar visible in viewing mode', () => {
    const issue = checkAnnotationToolbarConsistency('viewing', true);
    expect(issue!.code).toBe('annotation-toolbar-in-non-annotation-mode');
    expect(issue!.blocking).toBe(false);
  });

  it('returns issue when toolbar visible in text-edit mode', () => {
    const issue = checkAnnotationToolbarConsistency('text-edit', true);
    expect(issue!.code).toBe('annotation-toolbar-in-non-annotation-mode');
  });
});

// ---------------------------------------------------------------------------
// checkEditOverlayConsistency
// ---------------------------------------------------------------------------

describe('modeConsistencyValidator — checkEditOverlayConsistency', () => {
  it('returns null when overlay hidden in viewing mode', () => {
    expect(checkEditOverlayConsistency('viewing', false)).toBeNull();
  });

  it('returns null when overlay visible in text-edit mode', () => {
    expect(checkEditOverlayConsistency('text-edit', true)).toBeNull();
  });

  it('returns non-blocking issue when overlay visible in viewing mode', () => {
    const issue = checkEditOverlayConsistency('viewing', true);
    expect(issue!.code).toBe('edit-overlay-in-view-mode');
    expect(issue!.blocking).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkRedactionToolbarConsistency
// ---------------------------------------------------------------------------

describe('modeConsistencyValidator — checkRedactionToolbarConsistency', () => {
  it('returns null when toolbar hidden', () => {
    expect(checkRedactionToolbarConsistency('viewing', false)).toBeNull();
  });

  it('returns null when toolbar visible in redacting mode', () => {
    expect(checkRedactionToolbarConsistency('redacting', true)).toBeNull();
  });

  it('returns non-blocking issue when toolbar visible in viewing mode', () => {
    const issue = checkRedactionToolbarConsistency('viewing', true);
    expect(issue!.code).toBe('redaction-toolbar-in-non-redaction-mode');
    expect(issue!.blocking).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkFormFillPrerequisite
// ---------------------------------------------------------------------------

describe('modeConsistencyValidator — checkFormFillPrerequisite', () => {
  it('returns null when mode is not form-fill', () => {
    expect(checkFormFillPrerequisite('viewing', false)).toBeNull();
    expect(checkFormFillPrerequisite('text-edit', false)).toBeNull();
  });

  it('returns null when form-fill mode AND document has forms', () => {
    expect(checkFormFillPrerequisite('form-fill', true)).toBeNull();
  });

  it('returns blocking issue when form-fill mode on document without forms', () => {
    const issue = checkFormFillPrerequisite('form-fill', false);
    expect(issue!.code).toBe('form-fill-on-non-form');
    expect(issue!.blocking).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkToolbarModeParity
// ---------------------------------------------------------------------------

describe('modeConsistencyValidator — checkToolbarModeParity', () => {
  it('returns null when activeModes is empty', () => {
    expect(checkToolbarModeParity('viewing', [])).toBeNull();
  });

  it('returns null when activeModes has more than one entry (handled elsewhere)', () => {
    expect(checkToolbarModeParity('viewing', ['viewing', 'text-edit'])).toBeNull();
  });

  it('returns null when single active mode matches editor mode', () => {
    expect(checkToolbarModeParity('viewing', ['viewing'])).toBeNull();
  });

  it('returns blocking issue when single active mode differs', () => {
    const issue = checkToolbarModeParity('viewing', ['text-edit']);
    expect(issue!.code).toBe('toolbar-mode-mismatch');
    expect(issue!.blocking).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateModeConsistency — full check
// ---------------------------------------------------------------------------

describe('modeConsistencyValidator — validateModeConsistency', () => {
  it('returns consistent for a clean viewing state', () => {
    const result = validateModeConsistency(makeState());
    expect(result.consistent).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.hasBlockingIssues).toBe(false);
  });

  it('consistent for annotation mode with annotation toolbar', () => {
    const result = validateModeConsistency(makeState({
      mode: 'annotating',
      activeModes: ['annotating'],
      annotationToolbarVisible: true,
    }));
    expect(result.consistent).toBe(true);
  });

  it('consistent for form-fill mode on document with forms', () => {
    const result = validateModeConsistency(makeState({
      mode: 'form-fill',
      activeModes: ['form-fill'],
      documentHasForms: true,
    }));
    expect(result.consistent).toBe(true);
  });

  it('detects annotation toolbar in viewing mode', () => {
    const result = validateModeConsistency(makeState({ annotationToolbarVisible: true }));
    expect(result.issues.some(i => i.code === 'annotation-toolbar-in-non-annotation-mode')).toBe(true);
  });

  it('detects edit overlay in viewing mode', () => {
    const result = validateModeConsistency(makeState({ editOverlayVisible: true }));
    expect(result.issues.some(i => i.code === 'edit-overlay-in-view-mode')).toBe(true);
  });

  it('detects form-fill on non-form document (blocking)', () => {
    const result = validateModeConsistency(makeState({
      mode: 'form-fill',
      activeModes: ['form-fill'],
      documentHasForms: false,
    }));
    expect(result.hasBlockingIssues).toBe(true);
    expect(result.issues.some(i => i.code === 'form-fill-on-non-form')).toBe(true);
  });

  it('detects multiple active modes', () => {
    const result = validateModeConsistency(makeState({
      activeModes: ['viewing', 'text-edit'],
    }));
    expect(result.issues.some(i => i.code === 'multiple-active-modes')).toBe(true);
    expect(result.hasBlockingIssues).toBe(true);
  });

  it('detects toolbar-mode mismatch', () => {
    const result = validateModeConsistency(makeState({
      mode: 'viewing',
      activeModes: ['text-edit'],
    }));
    expect(result.issues.some(i => i.code === 'toolbar-mode-mismatch')).toBe(true);
  });

  it('consistent is false = !issues.length', () => {
    const result = validateModeConsistency(makeState({ annotationToolbarVisible: true }));
    expect(result.consistent).toBe(result.issues.length === 0);
  });
});

// ---------------------------------------------------------------------------
// isModeConsistent
// ---------------------------------------------------------------------------

describe('modeConsistencyValidator — isModeConsistent', () => {
  it('returns true for clean viewing state', () => {
    expect(isModeConsistent(makeState())).toBe(true);
  });

  it('returns false when annotation toolbar is visible in viewing mode', () => {
    expect(isModeConsistent(makeState({ annotationToolbarVisible: true }))).toBe(false);
  });

  it('returns false when multiple modes active', () => {
    expect(isModeConsistent(makeState({ activeModes: ['viewing', 'annotating'] }))).toBe(false);
  });
});
