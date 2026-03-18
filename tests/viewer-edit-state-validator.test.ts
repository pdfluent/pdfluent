// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Edit State Validator Tests — ACROBAT_CLASS_RELIABILITY_AND_UX_HARDENING_BLOCK Batch 3
 *
 * Verified:
 * - validateTransition: blocks invalid transitions, allows valid ones
 * - validateSessionPresence: requires session for edit modes
 * - validateSessionModeParity: detects mode mismatch
 * - validatePageIndex: detects out-of-bounds page
 * - validateDirtyConsistency: detects dirty flag inconsistency
 * - validateDocumentOpenPrerequisite: requires document for non-idle modes
 * - validateSessionId: blocks empty session IDs
 * - validateEditorState: full state consistency checks
 * - validateModeTransition: transition + prerequisite checks
 * - VALID_TRANSITIONS covers all modes
 */

import { describe, it, expect } from 'vitest';
import {
  validateTransition,
  validateSessionPresence,
  validateSessionModeParity,
  validatePageIndex,
  validateDirtyConsistency,
  validateDocumentOpenPrerequisite,
  validateSessionId,
  validateEditorState,
  validateModeTransition,
  VALID_TRANSITIONS,
} from '../src/viewer/state/editStateValidator';
import type { EditorMode, EditorState, EditSession } from '../src/viewer/state/editStateValidator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<EditSession> = {}): EditSession {
  return {
    sessionId: 'sess-001',
    pageIndex: 0,
    mode: 'text-edit',
    startedAt: '2026-01-01T00:00:00Z',
    hasPendingChanges: false,
    ...overrides,
  };
}

function makeState(overrides: Partial<EditorState> = {}): EditorState {
  return {
    mode: 'viewing',
    pageCount: 10,
    activePageIndex: 0,
    isDirty: false,
    activeSession: null,
    documentOpen: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// VALID_TRANSITIONS
// ---------------------------------------------------------------------------

describe('editStateValidator — VALID_TRANSITIONS', () => {
  const allModes: EditorMode[] = ['idle', 'viewing', 'text-edit', 'layout-edit', 'annotating', 'redacting', 'form-fill'];

  it('covers all EditorMode values', () => {
    for (const mode of allModes) {
      expect(VALID_TRANSITIONS[mode]).toBeDefined();
    }
  });

  it('idle can only go to viewing', () => {
    expect(VALID_TRANSITIONS['idle']).toEqual(['viewing']);
  });

  it('viewing can go to all edit modes and idle', () => {
    const viewingTargets = VALID_TRANSITIONS['viewing'];
    expect(viewingTargets).toContain('idle');
    expect(viewingTargets).toContain('text-edit');
    expect(viewingTargets).toContain('layout-edit');
    expect(viewingTargets).toContain('annotating');
    expect(viewingTargets).toContain('redacting');
    expect(viewingTargets).toContain('form-fill');
  });

  it('all edit modes return to viewing only', () => {
    const editModes: EditorMode[] = ['text-edit', 'layout-edit', 'annotating', 'redacting', 'form-fill'];
    for (const mode of editModes) {
      expect(VALID_TRANSITIONS[mode]).toEqual(['viewing']);
    }
  });
});

// ---------------------------------------------------------------------------
// validateTransition
// ---------------------------------------------------------------------------

describe('editStateValidator — validateTransition', () => {
  it('idle → viewing is valid', () => {
    expect(validateTransition('idle', 'viewing')).toBeNull();
  });

  it('viewing → text-edit is valid', () => {
    expect(validateTransition('viewing', 'text-edit')).toBeNull();
  });

  it('text-edit → viewing is valid', () => {
    expect(validateTransition('text-edit', 'viewing')).toBeNull();
  });

  it('idle → text-edit is invalid (blocking)', () => {
    const v = validateTransition('idle', 'text-edit');
    expect(v).not.toBeNull();
    expect(v!.blocking).toBe(true);
    expect(v!.code).toBe('invalid-transition');
  });

  it('text-edit → layout-edit is invalid', () => {
    const v = validateTransition('text-edit', 'layout-edit');
    expect(v!.code).toBe('invalid-transition');
  });

  it('viewing → viewing is invalid', () => {
    const v = validateTransition('viewing', 'viewing');
    expect(v!.code).toBe('invalid-transition');
  });
});

// ---------------------------------------------------------------------------
// validateSessionPresence
// ---------------------------------------------------------------------------

describe('editStateValidator — validateSessionPresence', () => {
  const editModes: EditorMode[] = ['text-edit', 'layout-edit', 'annotating', 'redacting', 'form-fill'];

  it('viewing with null session is valid', () => {
    expect(validateSessionPresence('viewing', null)).toBeNull();
  });

  it('idle with null session is valid', () => {
    expect(validateSessionPresence('idle', null)).toBeNull();
  });

  for (const mode of editModes) {
    it(`${mode} with null session is a blocking violation`, () => {
      const v = validateSessionPresence(mode, null);
      expect(v!.code).toBe('edit-session-missing');
      expect(v!.blocking).toBe(true);
    });

    it(`${mode} with session is valid`, () => {
      expect(validateSessionPresence(mode, makeSession({ mode }))).toBeNull();
    });
  }
});

// ---------------------------------------------------------------------------
// validateSessionModeParity
// ---------------------------------------------------------------------------

describe('editStateValidator — validateSessionModeParity', () => {
  it('returns null when session is null', () => {
    expect(validateSessionModeParity('viewing', null)).toBeNull();
  });

  it('returns null when session mode matches editor mode', () => {
    expect(validateSessionModeParity('text-edit', makeSession({ mode: 'text-edit' }))).toBeNull();
  });

  it('returns blocking violation when session mode differs', () => {
    const v = validateSessionModeParity('text-edit', makeSession({ mode: 'layout-edit' }));
    expect(v!.code).toBe('edit-session-stale');
    expect(v!.blocking).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validatePageIndex
// ---------------------------------------------------------------------------

describe('editStateValidator — validatePageIndex', () => {
  it('returns null for valid page index', () => {
    expect(validatePageIndex(0, 10)).toBeNull();
    expect(validatePageIndex(9, 10)).toBeNull();
  });

  it('returns null when pageCount is 0 (no document)', () => {
    expect(validatePageIndex(0, 0)).toBeNull();
  });

  it('returns non-blocking violation for negative page index', () => {
    const v = validatePageIndex(-1, 10);
    expect(v!.code).toBe('page-out-of-bounds');
    expect(v!.blocking).toBe(false);
  });

  it('returns violation for page index >= pageCount', () => {
    const v = validatePageIndex(10, 10);
    expect(v!.code).toBe('page-out-of-bounds');
  });
});

// ---------------------------------------------------------------------------
// validateDirtyConsistency
// ---------------------------------------------------------------------------

describe('editStateValidator — validateDirtyConsistency', () => {
  it('returns null when dirty and session has pending changes', () => {
    expect(validateDirtyConsistency(true, makeSession({ hasPendingChanges: true }))).toBeNull();
  });

  it('returns null when not dirty and no pending changes', () => {
    expect(validateDirtyConsistency(false, makeSession({ hasPendingChanges: false }))).toBeNull();
  });

  it('returns null when session is null', () => {
    expect(validateDirtyConsistency(false, null)).toBeNull();
  });

  it('returns non-blocking violation when session has changes but isDirty is false', () => {
    const v = validateDirtyConsistency(false, makeSession({ hasPendingChanges: true }));
    expect(v!.code).toBe('dirty-state-inconsistency');
    expect(v!.blocking).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateDocumentOpenPrerequisite
// ---------------------------------------------------------------------------

describe('editStateValidator — validateDocumentOpenPrerequisite', () => {
  it('returns null for idle regardless of documentOpen', () => {
    expect(validateDocumentOpenPrerequisite('idle', false)).toBeNull();
    expect(validateDocumentOpenPrerequisite('idle', true)).toBeNull();
  });

  it('returns null when documentOpen is true', () => {
    expect(validateDocumentOpenPrerequisite('viewing', true)).toBeNull();
    expect(validateDocumentOpenPrerequisite('text-edit', true)).toBeNull();
  });

  it('returns blocking violation for viewing without document', () => {
    const v = validateDocumentOpenPrerequisite('viewing', false);
    expect(v!.code).toBe('mode-prerequisite-missing');
    expect(v!.blocking).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateSessionId
// ---------------------------------------------------------------------------

describe('editStateValidator — validateSessionId', () => {
  it('returns null when session is null', () => {
    expect(validateSessionId(null)).toBeNull();
  });

  it('returns null for non-empty session id', () => {
    expect(validateSessionId(makeSession({ sessionId: 'sess-001' }))).toBeNull();
  });

  it('returns blocking violation for empty session id', () => {
    const v = validateSessionId(makeSession({ sessionId: '' }));
    expect(v!.code).toBe('session-id-collision');
    expect(v!.blocking).toBe(true);
  });

  it('returns blocking violation for whitespace-only session id', () => {
    const v = validateSessionId(makeSession({ sessionId: '   ' }));
    expect(v!.code).toBe('session-id-collision');
  });
});

// ---------------------------------------------------------------------------
// validateEditorState — full state
// ---------------------------------------------------------------------------

describe('editStateValidator — validateEditorState', () => {
  it('returns valid result for clean state', () => {
    const result = validateEditorState(makeState());
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.hasBlockingViolations).toBe(false);
  });

  it('valid text-edit state with matching session', () => {
    const result = validateEditorState(makeState({
      mode: 'text-edit',
      activeSession: makeSession({ mode: 'text-edit' }),
    }));
    expect(result.valid).toBe(true);
  });

  it('detects missing session in text-edit mode', () => {
    const result = validateEditorState(makeState({ mode: 'text-edit', activeSession: null }));
    expect(result.hasBlockingViolations).toBe(true);
    expect(result.violations.some(v => v.code === 'edit-session-missing')).toBe(true);
  });

  it('detects session parity mismatch', () => {
    const result = validateEditorState(makeState({
      mode: 'text-edit',
      activeSession: makeSession({ mode: 'layout-edit' }),
    }));
    expect(result.violations.some(v => v.code === 'edit-session-stale')).toBe(true);
  });

  it('detects page out of bounds', () => {
    const result = validateEditorState(makeState({ activePageIndex: 99, pageCount: 10 }));
    expect(result.violations.some(v => v.code === 'page-out-of-bounds')).toBe(true);
  });

  it('detects dirty inconsistency', () => {
    const result = validateEditorState(makeState({
      mode: 'text-edit',
      isDirty: false,
      activeSession: makeSession({ mode: 'text-edit', hasPendingChanges: true }),
    }));
    expect(result.violations.some(v => v.code === 'dirty-state-inconsistency')).toBe(true);
  });

  it('detects document-open prerequisite violation', () => {
    const result = validateEditorState(makeState({ mode: 'viewing', documentOpen: false }));
    expect(result.violations.some(v => v.code === 'mode-prerequisite-missing')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateModeTransition
// ---------------------------------------------------------------------------

describe('editStateValidator — validateModeTransition', () => {
  it('valid transition returns no violations', () => {
    const result = validateModeTransition('viewing', 'text-edit', makeState());
    expect(result.valid).toBe(true);
  });

  it('invalid transition returns blocking violation', () => {
    const result = validateModeTransition('idle', 'text-edit', makeState({ documentOpen: true }));
    expect(result.hasBlockingViolations).toBe(true);
    expect(result.violations.some(v => v.code === 'invalid-transition')).toBe(true);
  });

  it('valid transition to edit mode without document is blocked', () => {
    const result = validateModeTransition('viewing', 'text-edit', makeState({ documentOpen: false }));
    expect(result.hasBlockingViolations).toBe(true);
    expect(result.violations.some(v => v.code === 'mode-prerequisite-missing')).toBe(true);
  });
});
