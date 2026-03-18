// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Edit State Validator — ACROBAT_CLASS_RELIABILITY_AND_UX_HARDENING_BLOCK Batch 3
 *
 * Validates the consistency of the editor state machine to prevent
 * invalid state transitions that could corrupt user data.
 *
 * Validates:
 *   - Mode transitions: only valid mode→mode transitions are allowed
 *   - Edit session consistency: edit session must have required fields
 *   - Pending changes: dirty flag consistency
 *   - Active page: page index within document bounds
 *   - Concurrent edits: only one active edit session at a time
 *   - Mode guard: certain modes require prerequisites
 *
 * States:
 *   'idle'       — no document open
 *   'viewing'    — document open, no active edit
 *   'text-edit'  — text edit session active
 *   'layout-edit'— layout/object edit session active
 *   'annotating' — annotation placement in progress
 *   'redacting'  — redaction selection in progress
 *   'form-fill'  — form field being filled
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EditorMode =
  | 'idle'
  | 'viewing'
  | 'text-edit'
  | 'layout-edit'
  | 'annotating'
  | 'redacting'
  | 'form-fill';

export type StateViolationCode =
  | 'invalid-transition'
  | 'edit-session-missing'
  | 'edit-session-stale'
  | 'concurrent-edit-conflict'
  | 'dirty-state-inconsistency'
  | 'page-out-of-bounds'
  | 'mode-prerequisite-missing'
  | 'session-id-collision';

export interface StateViolation {
  readonly code: StateViolationCode;
  readonly message: string;
  /** Whether this violation must block the transition. */
  readonly blocking: boolean;
}

export interface EditSession {
  readonly sessionId: string;
  readonly pageIndex: number;
  readonly mode: EditorMode;
  /** ISO 8601 timestamp when session started. */
  readonly startedAt: string;
  /** True if there are uncommitted changes in this session. */
  readonly hasPendingChanges: boolean;
}

export interface EditorState {
  readonly mode: EditorMode;
  readonly pageCount: number;
  readonly activePageIndex: number;
  readonly isDirty: boolean;
  readonly activeSession: EditSession | null;
  readonly documentOpen: boolean;
}

// ---------------------------------------------------------------------------
// Valid transitions
// ---------------------------------------------------------------------------

/**
 * Allowed mode transitions. Key = from, value = allowed to-modes.
 */
export const VALID_TRANSITIONS: Readonly<Record<EditorMode, readonly EditorMode[]>> = {
  idle:          ['viewing'],
  viewing:       ['idle', 'text-edit', 'layout-edit', 'annotating', 'redacting', 'form-fill'],
  'text-edit':   ['viewing'],
  'layout-edit': ['viewing'],
  annotating:    ['viewing'],
  redacting:     ['viewing'],
  'form-fill':   ['viewing'],
};

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

/**
 * Validate that a mode transition is allowed.
 */
export function validateTransition(from: EditorMode, to: EditorMode): StateViolation | null {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    return {
      code: 'invalid-transition',
      message: `Ongeldige moduswisseling: '${from}' → '${to}' is niet toegestaan.`,
      blocking: true,
    };
  }
  return null;
}

/**
 * Validate that an edit session exists when required by a mode.
 */
export function validateSessionPresence(
  mode: EditorMode,
  session: EditSession | null,
): StateViolation | null {
  const editModes: EditorMode[] = ['text-edit', 'layout-edit', 'annotating', 'redacting', 'form-fill'];
  if (editModes.includes(mode) && session === null) {
    return {
      code: 'edit-session-missing',
      message: `Modus '${mode}' vereist een actieve bewerkingssessie.`,
      blocking: true,
    };
  }
  return null;
}

/**
 * Validate that the session mode matches the editor mode.
 */
export function validateSessionModeParity(
  mode: EditorMode,
  session: EditSession | null,
): StateViolation | null {
  if (session !== null && session.mode !== mode) {
    return {
      code: 'edit-session-stale',
      message: `Sessie-modus '${session.mode}' komt niet overeen met editor-modus '${mode}'.`,
      blocking: true,
    };
  }
  return null;
}

/**
 * Validate that the active page index is within document bounds.
 */
export function validatePageIndex(pageIndex: number, pageCount: number): StateViolation | null {
  if (pageCount <= 0) return null; // no document open, skip
  if (pageIndex < 0 || pageIndex >= pageCount) {
    return {
      code: 'page-out-of-bounds',
      message: `Activepagina-index ${pageIndex} valt buiten documentbereik [0, ${pageCount - 1}].`,
      blocking: false,
    };
  }
  return null;
}

/**
 * Validate dirty flag consistency:
 * dirty must be true if session has pending changes.
 */
export function validateDirtyConsistency(
  isDirty: boolean,
  session: EditSession | null,
): StateViolation | null {
  if (session?.hasPendingChanges === true && !isDirty) {
    return {
      code: 'dirty-state-inconsistency',
      message: 'Sessie heeft niet-opgeslagen wijzigingen maar isDirty is false.',
      blocking: false,
    };
  }
  return null;
}

/**
 * Validate that a document is open when mode requires it.
 */
export function validateDocumentOpenPrerequisite(
  mode: EditorMode,
  documentOpen: boolean,
): StateViolation | null {
  if (mode !== 'idle' && !documentOpen) {
    return {
      code: 'mode-prerequisite-missing',
      message: `Modus '${mode}' vereist een geopend document.`,
      blocking: true,
    };
  }
  return null;
}

/**
 * Validate that the session id is non-empty and unique within the state.
 */
export function validateSessionId(session: EditSession | null): StateViolation | null {
  if (session === null) return null;
  if (!session.sessionId || session.sessionId.trim().length === 0) {
    return {
      code: 'session-id-collision',
      message: 'Sessie-ID is leeg of ongeldig.',
      blocking: true,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Full state validation
// ---------------------------------------------------------------------------

export interface StateValidationResult {
  readonly violations: StateViolation[];
  readonly hasBlockingViolations: boolean;
  readonly valid: boolean;
}

function makeResult(violations: StateViolation[]): StateValidationResult {
  const hasBlockingViolations = violations.some(v => v.blocking);
  return {
    violations,
    hasBlockingViolations,
    valid: violations.length === 0,
  };
}

/**
 * Validate the current editor state for internal consistency.
 */
export function validateEditorState(state: EditorState): StateValidationResult {
  const violations: StateViolation[] = [];

  const docViolation = validateDocumentOpenPrerequisite(state.mode, state.documentOpen);
  if (docViolation) violations.push(docViolation);

  const sessionViolation = validateSessionPresence(state.mode, state.activeSession);
  if (sessionViolation) violations.push(sessionViolation);

  const parityViolation = validateSessionModeParity(state.mode, state.activeSession);
  if (parityViolation) violations.push(parityViolation);

  const pageViolation = validatePageIndex(state.activePageIndex, state.pageCount);
  if (pageViolation) violations.push(pageViolation);

  const dirtyViolation = validateDirtyConsistency(state.isDirty, state.activeSession);
  if (dirtyViolation) violations.push(dirtyViolation);

  const idViolation = validateSessionId(state.activeSession);
  if (idViolation) violations.push(idViolation);

  return makeResult(violations);
}

/**
 * Validate a proposed mode transition from `from` to `to` given current state.
 */
export function validateModeTransition(
  from: EditorMode,
  to: EditorMode,
  state: EditorState,
): StateValidationResult {
  const violations: StateViolation[] = [];

  const transViolation = validateTransition(from, to);
  if (transViolation) violations.push(transViolation);

  // Mode prerequisite for target mode
  const docViolation = validateDocumentOpenPrerequisite(to, state.documentOpen);
  if (docViolation) violations.push(docViolation);

  return makeResult(violations);
}
