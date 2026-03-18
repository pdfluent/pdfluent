// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useState, useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { TextSpan } from '../../core/document';
import type { ViewerMode } from '../types';
import type { AnnotationTool } from '../components/ModeToolbar';
import type { DocumentEvent } from '../state/documentEvents';
import { makeDocumentEvent, appendEvent } from '../state/documentEvents';
import type { AppError } from '../state/errorCenter';
import { makeTextMutationError, appendError } from '../state/errorCenter';
import { groupDigitalTextSpans } from '../text/textGrouping';
import type { PageTextStructure, TextParagraphTarget } from '../text/textInteractionModel';
import { isTextInteractionActive } from '../text/textInteractionRules';
import { getEditability, extractText } from '../text/textEditability';
import { getMutationSupport, validateReplacement } from '../text/textMutationSupport';
import type { TextContextActionId } from '../components/TextContextBar';
import { getTauriTextMutationEngine } from '../../platform/engine/tauri/TauriTextMutationEngine';

export function useTextInteraction(
  mode: ViewerMode,
  activeAnnotationTool: AnnotationTool,
  textSpans: TextSpan[],
  pageIndex: number,
  markDirty: () => void,
  authorName: string,
  setDocumentEventLog: Dispatch<SetStateAction<DocumentEvent[]>>,
  setAppErrors: Dispatch<SetStateAction<AppError[]>>,
) {
  const [selectedTextTargetId, setSelectedTextTargetId] = useState<string | null>(null);
  const [selectedTextTarget, setSelectedTextTarget] = useState<TextParagraphTarget | null>(null);
  const [editingTextTargetId, setEditingTextTargetId] = useState<string | null>(null);
  const [textDraft, setTextDraft] = useState<string>('');

  // Grouped text structure for the current page — drives TextInteractionOverlay.
  const pageTextStructure = useMemo((): PageTextStructure | null => {
    if (textSpans.length === 0) return null;
    return groupDigitalTextSpans(textSpans, pageIndex);
  }, [textSpans, pageIndex]);

  // Text interaction level driven by mode + active tool (Batch 5 rules).
  const textInteractionActive = isTextInteractionActive(mode, activeAnnotationTool);

  const handleTextTargetSelect = useCallback((target: TextParagraphTarget | null) => {
    setSelectedTextTarget(target);
    setSelectedTextTargetId(target?.id ?? null);
    // Clear editing when selection changes away from the editing target
    setEditingTextTargetId(prev => (target?.id === prev ? prev : null));
    setTextDraft(prev => (target?.id === editingTextTargetId ? prev : ''));
  // editingTextTargetId intentionally excluded — we only need target.id and prev state
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEditEntry = useCallback((target: TextParagraphTarget) => {
    const editability = getEditability(target, mode, activeAnnotationTool);
    if (editability.status !== 'editable') return;
    // Ensure selection is up-to-date (double-click may have deselected via toggle)
    setSelectedTextTarget(target);
    setSelectedTextTargetId(target.id);
    setEditingTextTargetId(target.id);
    setTextDraft(extractText(target));
  }, [mode, activeAnnotationTool]);

  /** Handle context bar action — route 'edit-text' to edit entry. */
  const handleTextContextAction = useCallback((actionId: TextContextActionId, target: TextParagraphTarget) => {
    if (actionId === 'edit-text') {
      handleEditEntry(target);
    }
    // Other actions (annotate, redact, copy, summarize, explain) are handled
    // by the action registry fire inside TextContextBar.
  }, [handleEditEntry]);

  /** Cancel inline editing — discard draft and exit edit mode. */
  const handleDraftCancel = useCallback(() => {
    setEditingTextTargetId(null);
    setTextDraft('');
  }, []);

  /**
   * Commit inline draft — Phase 4 real mutation path.
   */
  const handleDraftCommit = useCallback(async (committedText: string) => {
    if (!selectedTextTarget) return;

    const originalText = extractText(selectedTextTarget);

    // No-change: just close edit mode
    if (committedText === originalText) {
      setEditingTextTargetId(null);
      setTextDraft('');
      return;
    }

    const mutationSupport = getMutationSupport(selectedTextTarget);

    if (!mutationSupport.writable) {
      // Non-writable structure: exit edit mode without mutation.
      setEditingTextTargetId(null);
      setTextDraft('');
      return;
    }

    // Validate replacement before calling the backend
    const validation = validateReplacement(originalText, committedText, mutationSupport.constraints!);
    if (!validation.valid) {
      setAppErrors(prev => appendError(prev, makeTextMutationError(validation.message)));
      return; // Stay in edit mode — user can correct the replacement
    }

    // Attempt real PDF text mutation via Tauri backend
    try {
      const mutationEngine = getTauriTextMutationEngine();
      const result = await mutationEngine.replaceTextSpan({
        pageIndex,
        originalText,
        replacementText: committedText,
      });

      if (result.success && result.value.replaced) {
        markDirty();
        setDocumentEventLog(prev => appendEvent(prev, makeDocumentEvent(
          'page_mutated', authorName, pageIndex, selectedTextTarget?.id ?? '', `Tekst bewerkt: "${originalText}" → "${committedText}"`,
        )));
        setEditingTextTargetId(null);
        setTextDraft('');
      } else if (result.success && !result.value.replaced) {
        setAppErrors(prev => appendError(prev, makeTextMutationError(
          result.value.reason ?? 'Tekst niet gevonden in de PDF-inhoud.',
        )));
        setEditingTextTargetId(null);
        setTextDraft('');
      } else if (!result.success) {
        setAppErrors(prev => appendError(prev, makeTextMutationError(result.error.message)));
        setEditingTextTargetId(null);
        setTextDraft('');
      }
    } catch (e) {
      setAppErrors(prev => appendError(prev, makeTextMutationError(String(e))));
      setEditingTextTargetId(null);
      setTextDraft('');
    }
  }, [selectedTextTarget, pageIndex, markDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    selectedTextTargetId,
    selectedTextTarget,
    editingTextTargetId,
    textDraft,
    setTextDraft,
    handleTextTargetSelect,
    handleEditEntry,
    handleTextContextAction,
    handleDraftCancel,
    handleDraftCommit,
    pageTextStructure,
    textInteractionActive,
  };
}
