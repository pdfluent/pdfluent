// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Mode Consistency Validator — ACROBAT_CLASS_RELIABILITY_AND_UX_HARDENING_BLOCK Batch 7
 *
 * Validates that the viewer toolbar, active mode, and UI component visibility
 * are mutually consistent at any point in time.
 *
 * Prevents:
 *   - Edit toolbar shown while in viewing mode
 *   - Annotation toolbar shown while in non-annotation mode
 *   - Multiple active modes reported simultaneously
 *   - Overlay and mode out of sync
 *   - Form fill active on non-form documents
 *
 * Each check returns a ModeConsistencyIssue or null.
 * The full validator runs all checks and returns a ModeConsistencyReport.
 */

import type { EditorMode } from '../state/editStateValidator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ModeConsistencyCode =
  | 'toolbar-mode-mismatch'
  | 'overlay-mode-mismatch'
  | 'multiple-active-modes'
  | 'form-fill-on-non-form'
  | 'annotation-toolbar-in-non-annotation-mode'
  | 'edit-overlay-in-view-mode'
  | 'redaction-toolbar-in-non-redaction-mode';

export interface ModeConsistencyIssue {
  readonly code: ModeConsistencyCode;
  readonly message: string;
  readonly blocking: boolean;
}

export interface ModeConsistencyReport {
  readonly issues: ModeConsistencyIssue[];
  readonly hasBlockingIssues: boolean;
  readonly consistent: boolean;
}

// ---------------------------------------------------------------------------
// UI state snapshot (input)
// ---------------------------------------------------------------------------

export interface ModeUiState {
  /** Currently active editor mode. */
  readonly mode: EditorMode;
  /** Whether the annotation toolbar is visible. */
  readonly annotationToolbarVisible: boolean;
  /** Whether the text edit overlay/toolbar is visible. */
  readonly editOverlayVisible: boolean;
  /** Whether the redaction toolbar is visible. */
  readonly redactionToolbarVisible: boolean;
  /** Whether any form-fill overlay is active. */
  readonly formFillOverlayVisible: boolean;
  /** Whether the document contains fillable form fields. */
  readonly documentHasForms: boolean;
  /** All modes that report themselves as active simultaneously. */
  readonly activeModes: readonly EditorMode[];
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

/**
 * Validate that exactly one mode is active at a time.
 */
export function checkSingleActiveMode(activeModes: readonly EditorMode[]): ModeConsistencyIssue | null {
  if (activeModes.length > 1) {
    return {
      code: 'multiple-active-modes',
      message: `Meerdere actieve modi gedetecteerd: ${activeModes.join(', ')}. Slechts één modus is toegestaan.`,
      blocking: true,
    };
  }
  return null;
}

/**
 * Validate that the annotation toolbar is only visible in annotation mode.
 */
export function checkAnnotationToolbarConsistency(
  mode: EditorMode,
  annotationToolbarVisible: boolean,
): ModeConsistencyIssue | null {
  if (annotationToolbarVisible && mode !== 'annotating') {
    return {
      code: 'annotation-toolbar-in-non-annotation-mode',
      message: `Annotatiebalk is zichtbaar in modus '${mode}', maar vereist 'annotating'.`,
      blocking: false,
    };
  }
  return null;
}

/**
 * Validate that the text edit overlay is not shown in pure viewing mode.
 */
export function checkEditOverlayConsistency(
  mode: EditorMode,
  editOverlayVisible: boolean,
): ModeConsistencyIssue | null {
  if (editOverlayVisible && mode === 'viewing') {
    return {
      code: 'edit-overlay-in-view-mode',
      message: 'Bewerkingsoverlay is zichtbaar terwijl de viewer in weergavemodus staat.',
      blocking: false,
    };
  }
  return null;
}

/**
 * Validate that the redaction toolbar is only visible in redaction mode.
 */
export function checkRedactionToolbarConsistency(
  mode: EditorMode,
  redactionToolbarVisible: boolean,
): ModeConsistencyIssue | null {
  if (redactionToolbarVisible && mode !== 'redacting') {
    return {
      code: 'redaction-toolbar-in-non-redaction-mode',
      message: `Redigeerbalk is zichtbaar in modus '${mode}', maar vereist 'redacting'.`,
      blocking: false,
    };
  }
  return null;
}

/**
 * Validate that form-fill mode is only entered on documents with forms.
 */
export function checkFormFillPrerequisite(
  mode: EditorMode,
  documentHasForms: boolean,
): ModeConsistencyIssue | null {
  if (mode === 'form-fill' && !documentHasForms) {
    return {
      code: 'form-fill-on-non-form',
      message: 'Formuliervulmodus is actief op een document zonder formuliervelden.',
      blocking: true,
    };
  }
  return null;
}

/**
 * Validate that the active mode in activeModes matches the declared mode.
 */
export function checkToolbarModeParity(
  mode: EditorMode,
  activeModes: readonly EditorMode[],
): ModeConsistencyIssue | null {
  if (activeModes.length === 1 && activeModes[0] !== mode) {
    return {
      code: 'toolbar-mode-mismatch',
      message: `Actieve modus in toolbar '${activeModes[0]}' komt niet overeen met editor-modus '${mode}'.`,
      blocking: true,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Full validation
// ---------------------------------------------------------------------------

function makeReport(issues: ModeConsistencyIssue[]): ModeConsistencyReport {
  return {
    issues,
    hasBlockingIssues: issues.some(i => i.blocking),
    consistent: issues.length === 0,
  };
}

/**
 * Run all mode consistency checks for the given UI state snapshot.
 */
export function validateModeConsistency(state: ModeUiState): ModeConsistencyReport {
  const issues: ModeConsistencyIssue[] = [];

  const singleMode = checkSingleActiveMode(state.activeModes);
  if (singleMode) issues.push(singleMode);

  // Only check parity when exactly one active mode is reported
  if (state.activeModes.length === 1) {
    const parity = checkToolbarModeParity(state.mode, state.activeModes);
    if (parity) issues.push(parity);
  }

  const annotIssue = checkAnnotationToolbarConsistency(state.mode, state.annotationToolbarVisible);
  if (annotIssue) issues.push(annotIssue);

  const editIssue = checkEditOverlayConsistency(state.mode, state.editOverlayVisible);
  if (editIssue) issues.push(editIssue);

  const redactIssue = checkRedactionToolbarConsistency(state.mode, state.redactionToolbarVisible);
  if (redactIssue) issues.push(redactIssue);

  const formIssue = checkFormFillPrerequisite(state.mode, state.documentHasForms);
  if (formIssue) issues.push(formIssue);

  return makeReport(issues);
}

/**
 * Quick check: is the UI in a fully consistent state?
 */
export function isModeConsistent(state: ModeUiState): boolean {
  return validateModeConsistency(state).consistent;
}
