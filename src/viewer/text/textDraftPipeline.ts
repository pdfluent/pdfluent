// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Text Draft Pipeline
 *
 * Manages the lifecycle of an inline text edit draft:
 *   startDraft   — begin editing a paragraph
 *   updateDraft  — update the live draft text
 *   cancelDraft  — discard and return to idle
 *   commitDraft  — attempt to persist the draft
 *
 * Phase 3 scope:
 * - The pipeline tracks draft state and validates the edit.
 * - For targets that are not yet truly writable (e.g. all targets in Phase 3),
 *   commitDraft returns a result explaining why the mutation was deferred.
 * - The pipeline NEVER silently pretends success for unwritable targets.
 * - A minimal real write path will be wired here when Phase 4+ delivers mutation.
 */

import type { TextParagraphTarget } from './textInteractionModel';
import { getEditability } from './textEditability';
import { getMutationSupport } from './textMutationSupport';
import type { ViewerMode } from '../types';
import type { AnnotationTool } from '../components/ModeToolbar';

// ---------------------------------------------------------------------------
// Pipeline state
// ---------------------------------------------------------------------------

export type DraftStatus = 'idle' | 'editing' | 'committing' | 'committed' | 'cancelled' | 'error';

export interface DraftState {
  status: DraftStatus;
  target: TextParagraphTarget | null;
  /** Original text at the time the draft was started. */
  originalText: string;
  /** Current draft text. */
  draftText: string;
}

export interface DraftCommitResult {
  success: boolean;
  /** Machine-readable reason code. */
  reason: string;
  /** Human-readable message (Dutch UI language). */
  message: string;
}

// ---------------------------------------------------------------------------
// Initial state factory
// ---------------------------------------------------------------------------

export function createIdleDraftState(): DraftState {
  return { status: 'idle', target: null, originalText: '', draftText: '' };
}

// ---------------------------------------------------------------------------
// Pipeline operations
// ---------------------------------------------------------------------------

/**
 * Begin a draft editing session for a paragraph.
 * Returns the new draft state, or null if the target is not editable.
 */
export function startDraft(
  target: TextParagraphTarget,
  originalText: string,
  mode: ViewerMode,
  activeTool: AnnotationTool | null,
): DraftState | null {
  const editability = getEditability(target, mode, activeTool);
  if (editability.status !== 'editable') return null;
  return {
    status: 'editing',
    target,
    originalText,
    draftText: originalText,
  };
}

/**
 * Update the live draft text.
 * No-op if the draft is not currently in editing state.
 */
export function updateDraft(state: DraftState, text: string): DraftState {
  if (state.status !== 'editing') return state;
  return { ...state, draftText: text };
}

/**
 * Cancel an active draft — return to idle state.
 */
export function cancelDraft(state: DraftState): DraftState {
  if (state.status !== 'editing') return state;
  return createIdleDraftState();
}

/**
 * Attempt to commit the draft.
 *
 * Phase 3: PDF mutation is not yet implemented.
 * For targets that are not truly writable, this returns a safe failure
 * result with an honest, user-visible message.
 *
 * Returns a tuple of [new state, commit result].
 */
export function commitDraft(
  state: DraftState,
  mode: ViewerMode,
  activeTool: AnnotationTool | null,
): [DraftState, DraftCommitResult] {
  if (state.status !== 'editing' || !state.target) {
    return [
      state,
      {
        success: false,
        reason: 'no-active-draft',
        message: 'Geen actieve bewerking om op te slaan.',
      },
    ];
  }

  // Re-validate editability at commit time (mode may have changed)
  const editability = getEditability(state.target, mode, activeTool);
  if (editability.status !== 'editable') {
    return [
      { ...state, status: 'error' },
      {
        success: false,
        reason: editability.status,
        message: editability.label,
      },
    ];
  }

  // No-change shortcut
  if (state.draftText === state.originalText) {
    return [
      createIdleDraftState(),
      {
        success: true,
        reason: 'no-change',
        message: 'Geen wijzigingen om op te slaan.',
      },
    ];
  }

  // Phase 4: check whether this target supports real PDF mutation.
  const mutationSupport = getMutationSupport(state.target);

  if (mutationSupport.writable) {
    // Writable target: signal the caller to invoke the mutation backend.
    // The caller (handleDraftCommit in ViewerApp) performs the async IPC call.
    return [
      { ...state, status: 'committed', draftText: state.draftText },
      {
        success: true,
        reason: 'mutation-pending',
        message: 'Bewerking gereed voor opslaan in PDF.',
      },
    ];
  }

  // Digital text but structure not yet supported — surface the reason honestly.
  // This is not an error; the user sees why the change cannot be persisted.
  return [
    { ...state, status: 'committed', draftText: state.draftText },
    {
      success: false,
      reason: 'non-writable-structure',
      message: mutationSupport.label,
    },
  ];
}

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

export function isDraftActive(state: DraftState): boolean {
  return state.status === 'editing';
}

export function isDraftDirty(state: DraftState): boolean {
  return state.status === 'editing' && state.draftText !== state.originalText;
}
