// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { useState, useCallback, useMemo, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { TextSpan } from '../../core/document';
import type { ViewerMode } from '../types';
import type { AnnotationTool } from '../components/ModeToolbar';
import type { DocumentEvent } from '../state/documentEvents';
import { makeDocumentEvent, appendEvent } from '../state/documentEvents';
import type { AppError } from '../state/errorCenter';
import { makeTextMutationError, appendError } from '../state/errorCenter';
import { groupDigitalTextSpans } from '../text/textGrouping';
import type { PageTextStructure, TextParagraphTarget, TextSpanTarget } from '../text/textInteractionModel';
import { isTextInteractionActive } from '../text/textInteractionRules';
import { getEditability, extractText, extractRawText } from '../text/textEditability';
import { getMutationSupport, validateReplacement } from '../text/textMutationSupport';
import { getBackendRejectionMessage, getUnsupportedMessage } from '../text/textMutationMessaging';
import type { TextMutationRejection } from '../text/textMutationMessaging';
import type { TextContextActionId } from '../components/TextContextBar';
import { getCanonicalTextMutationEngine } from '../../platform/engine/canonicalTextMutationEngine';
import { reportFallback } from '../../lib/commandBridge';
import i18n from '../../i18n';
import { toEditorTextSpan } from '../text/editorTextSpan';
import { extractFirstExternalLink } from '../text/linkDetection';
import { abandonCommitIfUnarmed, beginCommit, noteMutationAck } from '../performance/perfMarks';
import { announceUsageRightsInvalidated } from '../state/fallbackNotices';

function hexToRgb(hex: string): [number, number, number] {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
  return [isNaN(r) ? 0 : r, isNaN(g) ? 0 : g, isNaN(b) ? 0 : b];
}

interface DraftRangeFormatEdit {
  readonly start: number;
  readonly end: number;
  readonly formatting: {
    readonly color?: [number, number, number];
    readonly fontSize?: number;
    readonly bold?: boolean;
    readonly italic?: boolean;
    readonly underline?: boolean;
    readonly strikethrough?: boolean;
  };
}

interface SpanRangeTarget {
  readonly span: TextSpanTarget;
  readonly startOffset: number;
  readonly endOffset: number;
}

function normalizeEditorText(text: string): string {
  return text.replace(/\u00a0/g, ' ');
}

function getEditorSelectionOffsets(el: HTMLElement): { start: number; end: number } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (range.collapsed || !el.contains(range.commonAncestorContainer)) return null;

  const beforeRange = document.createRange();
  beforeRange.selectNodeContents(el);
  try {
    beforeRange.setEnd(range.startContainer, range.startOffset);
  } catch {
    return null;
  }

  const start = normalizeEditorText(beforeRange.toString()).length;
  const length = normalizeEditorText(range.toString()).length;
  beforeRange.detach();

  if (length <= 0) return null;
  return { start, end: start + length };
}

function findTextPosition(root: HTMLElement, offset: number): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = Math.max(0, offset);
  let lastTextNode: Text | null = null;

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    lastTextNode = node;
    const length = normalizeEditorText(node.data).length;
    if (remaining <= length) {
      return { node, offset: remaining };
    }
    remaining -= length;
  }

  return lastTextNode ? { node: lastTextNode, offset: lastTextNode.data.length } : null;
}

function restoreEditorSelection(el: HTMLElement, start: number, end: number): boolean {
  const startPos = findTextPosition(el, start);
  const endPos = findTextPosition(el, end);
  if (!startPos || !endPos) return false;

  const range = document.createRange();
  range.setStart(startPos.node, startPos.offset);
  range.setEnd(endPos.node, endPos.offset);

  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  return true;
}

function mapTargetTextRangeToSpanRanges(
  target: TextParagraphTarget,
  start: number,
  end: number,
): SpanRangeTarget[] {
  const spans = target.lines.flatMap(line => line.spans);
  const ranges: SpanRangeTarget[] = [];
  let cursor = 0;

  spans.forEach((span, index) => {
    const spanStart = cursor;
    const spanEnd = spanStart + span.text.length;
    const overlapStart = Math.max(start, spanStart);
    const overlapEnd = Math.min(end, spanEnd);

    if (overlapStart < overlapEnd) {
      ranges.push({
        span,
        startOffset: overlapStart - spanStart,
        endOffset: overlapEnd - spanStart,
      });
    }

    cursor = spanEnd + (index < spans.length - 1 ? 1 : 0);
  });

  return ranges;
}

function isRangeFormatCommand(command: string): boolean {
  return (
    command === 'foreColor' ||
    command === 'fontSize' ||
    command === 'bold' ||
    command === 'italic' ||
    command === 'underline' ||
    command === 'strikeThrough'
  );
}

function isSupportedFormatCommand(command: string): boolean {
  return (
    command === 'foreColor' ||
    command === 'fontSize' ||
    command === 'bold' ||
    command === 'italic' ||
    command === 'underline' ||
    command === 'strikeThrough'
  );
}

function mergeRangeFormatEdit(
  edits: DraftRangeFormatEdit[],
  next: DraftRangeFormatEdit,
): DraftRangeFormatEdit[] {
  const existingIndex = edits.findIndex(edit => edit.start === next.start && edit.end === next.end);
  if (existingIndex === -1) return [...edits, next];

  return edits.map((edit, index) => (
    index === existingIndex
      ? { ...edit, formatting: { ...edit.formatting, ...next.formatting } }
      : edit
  ));
}

export function useTextInteraction(
  mode: ViewerMode,
  activeAnnotationTool: AnnotationTool,
  textSpans: TextSpan[],
  pageIndex: number,
  markDirty: () => void,
  authorName: string,
  setDocumentEventLog: Dispatch<SetStateAction<DocumentEvent[]>>,
  setAppErrors: Dispatch<SetStateAction<AppError[]>>,
  /** Pages the mutation touched. A text commit changes exactly one page, and
   *  saying so is what keeps the other 199 from re-rendering. */
  onDocumentMutated?: (pages?: number[]) => void,
  onExternalLinkClick?: (href: string, label: string) => void | Promise<void>,
  /** Identity of the open document — the object, not its path: a "Save as"
   *  gives the same document a new path and has undone nothing. Only used to
   *  reset what has already been said about it; a notice that fires once has to
   *  know once per what. */
  documentKey?: unknown,
) {
  const [selectedTextTargetId, setSelectedTextTargetId] = useState<string | null>(null);
  const [selectedTextTarget, setSelectedTextTarget] = useState<TextParagraphTarget | null>(null);
  const [editingTextTargetId, setEditingTextTargetId] = useState<string | null>(null);
  // Page the active edit target lives on. The inline editor renders on THIS
  // page, not on whatever page the scroll tracker currently reports — scrolling
  // while editing must not teleport the editor onto another page.
  const [editingPageIndex, setEditingPageIndex] = useState<number | null>(null);
  const [textDraft, setTextDraft] = useState<string>('');
  /**
   * Why the last text edit did not land, kept until the next edit.
   *
   * The toast stack shows three entries and slides away; a rejection the user
   * did not happen to be looking at was gone before they could read it, which
   * is why "not replaced" was the whole story in practice.
   */
  const [textMutationRejection, setTextMutationRejection] =
    useState<TextMutationRejection | null>(null);

  // Draft visual style states
  const [draftFontSize, setDraftFontSize] = useState<number | null>(null);
  const [draftColor, setDraftColor] = useState<[number, number, number] | null>(null);
  const [draftBold, setDraftBold] = useState<boolean | null>(null);
  const [draftItalic, setDraftItalic] = useState<boolean | null>(null);
  const isCommittingRef = useRef(false);

  // Format state — tracks bold/italic/underline/strikethrough in the active contenteditable editor
  const [formatState, setFormatState] = useState({
    isBold: false,
    isItalic: false,
    isUnderline: false,
    isStrikethrough: false,
  });
  const draftRangeFormatEditsRef = useRef<DraftRangeFormatEdit[]>([]);

  // Whether this document has already been told that its Reader enablement is
  // gone. The rights are lost on the first edit and stay lost, so repeating it
  // on every keystroke would only teach the user to dismiss the banner.
  const usageRightsAnnouncedRef = useRef(false);
  useEffect(() => {
    usageRightsAnnouncedRef.current = false;
  }, [documentKey]);

  // Ref forwarded to TextInlineEditor so the format bar can call execCommand on the element
  const editorDivRef = useRef<HTMLDivElement | null>(null);

  // Grouped text structure for the current page — drives TextInteractionOverlay.
  const pageTextStructure = useMemo((): PageTextStructure | null => {
    if (textSpans.length === 0) return null;
    return groupDigitalTextSpans(textSpans, pageIndex);
  }, [textSpans, pageIndex]);

  // Text interaction level driven by mode + active tool (Batch 5 rules).
  const textInteractionActive = isTextInteractionActive(mode, activeAnnotationTool);

  const textEditMaxLength = useMemo(() => {
    if (!selectedTextTarget || selectedTextTarget.id !== editingTextTargetId) return null;
    const mutationSupport = getMutationSupport(selectedTextTarget);
    return mutationSupport.constraints?.maxLength ?? null;
  }, [selectedTextTarget, editingTextTargetId]);

  const handleTextTargetSelect = useCallback((target: TextParagraphTarget | null) => {
    // editingTextTargetId
    if (target && mode === 'read' && !activeAnnotationTool) {
      const link = extractFirstExternalLink(extractText(target));
      if (link) {
        setSelectedTextTarget(null);
        setSelectedTextTargetId(null);
        setEditingTextTargetId(null);
        setTextDraft('');
        void onExternalLinkClick?.(link.href, link.label);
        return;
      }
    }

    setSelectedTextTarget(target);
    setSelectedTextTargetId(target?.id ?? null);

    // A click selects the text target only. It must never create a temporary
    // contenteditable overlay or mask canvas pixels as if the PDF had already
    // been edited.
    setEditingTextTargetId(null);
    setTextDraft('');
    setDraftFontSize(null);
    setDraftColor(null);
    setDraftBold(null);
    setDraftItalic(null);
    draftRangeFormatEditsRef.current = [];
  }, [mode, activeAnnotationTool, onExternalLinkClick]);

  const handleEditEntry = useCallback((target: TextParagraphTarget) => {
    setTextMutationRejection(null);
    const editability = getEditability(target, mode, activeAnnotationTool);
    if (editability.status !== 'editable') {
      setAppErrors(prev => appendError(prev, makeTextMutationError(editability.label)));
      return;
    }

    const mutationSupport = getMutationSupport(target);
    const rawFirstSpan = target.lines[0]?.spans[0];
    const firstEditorSpan = rawFirstSpan
      ? toEditorTextSpan(rawFirstSpan, pageIndex, 0)
      : null;

    if (!mutationSupport.writable) {
      setSelectedTextTarget(target);
      setSelectedTextTargetId(target.id);
      setEditingTextTargetId(null);
      setTextDraft('');
      setDraftFontSize(null);
      setDraftColor(null);
      setDraftBold(null);
      setDraftItalic(null);
      draftRangeFormatEditsRef.current = [];
      const unsupported = getUnsupportedMessage(mutationSupport);
      setAppErrors(prev => appendError(prev, makeTextMutationError(unsupported.explanation)));
      return;
    }

    if (firstEditorSpan?.sdkCapabilities.replaceTextMode !== 'parser-backed') {
      setSelectedTextTarget(target);
      setSelectedTextTargetId(target.id);
      setEditingTextTargetId(null);
      setTextDraft('');
      setDraftFontSize(null);
      setDraftColor(null);
      setDraftBold(null);
      setDraftItalic(null);
      draftRangeFormatEditsRef.current = [];
      setAppErrors(prev => appendError(prev, makeTextMutationError(
        'Directe tekstbewerking is alleen beschikbaar in de desktop-app met de native parser-backed PDF-writer.'
      )));
      return;
    }

    // Ensure selection is up-to-date (double-click may have deselected via toggle)
    setSelectedTextTarget(target);
    setSelectedTextTargetId(target.id);
    setEditingTextTargetId(target.id);
    setEditingPageIndex(pageIndex);
    setTextDraft(extractText(target));

    setDraftFontSize(firstEditorSpan?.fontSize ?? null);
    setDraftColor(firstEditorSpan?.color ?? null);
    setDraftBold(firstEditorSpan?.isBold ?? null);
    setDraftItalic(firstEditorSpan?.isItalic ?? null);
    draftRangeFormatEditsRef.current = [];
  }, [mode, activeAnnotationTool, pageIndex, setAppErrors]);

  /** Handle context bar action — route 'edit-text' to edit entry. */
  const handleTextContextAction = useCallback((actionId: TextContextActionId, target: TextParagraphTarget) => {
    if (actionId === 'edit-text') {
      handleEditEntry(target);
    }
    // Other actions (annotate, redact, copy, summarize, explain) are handled
    // by the action registry fire inside TextContextBar.
  }, [handleEditEntry]);

  /** Apply a formatting command (bold/italic/underline/font/color/etc.) to the active contenteditable editor. */
  const handleFormatCommand = useCallback((command: string, value?: string) => {
    const el = editorDivRef.current;
    if (!el) return;
    if (!isSupportedFormatCommand(command)) {
      setAppErrors(prev => appendError(prev, makeTextMutationError('Deze opmaakoptie kan in deze versie niet betrouwbaar in de PDF worden opgeslagen.')));
      return;
    }
    const selectedOffsets = isRangeFormatCommand(command) ? getEditorSelectionOffsets(el) : null;
    el.focus();
    if (selectedOffsets) {
      restoreEditorSelection(el, selectedOffsets.start, selectedOffsets.end);
    }
    document.execCommand(command, false, value);
    // Update format state from selection
    setFormatState({
      isBold: document.queryCommandState('bold'),
      isItalic: document.queryCommandState('italic'),
      isUnderline: document.queryCommandState('underline'),
      isStrikethrough: document.queryCommandState('strikeThrough'),
    });

    // Update draft visual styles
    if (command === 'bold') {
      const bold = document.queryCommandState('bold');
      setDraftBold(bold);
      if (selectedOffsets) {
        draftRangeFormatEditsRef.current = mergeRangeFormatEdit(draftRangeFormatEditsRef.current, {
          start: selectedOffsets.start,
          end: selectedOffsets.end,
          formatting: { bold },
        });
      }
    } else if (command === 'italic') {
      const italic = document.queryCommandState('italic');
      setDraftItalic(italic);
      if (selectedOffsets) {
        draftRangeFormatEditsRef.current = mergeRangeFormatEdit(draftRangeFormatEditsRef.current, {
          start: selectedOffsets.start,
          end: selectedOffsets.end,
          formatting: { italic },
        });
      }
    } else if (command === 'fontSize' && value) {
      const fontSize = parseFloat(value);
      setDraftFontSize(fontSize);
      if (selectedOffsets) {
        draftRangeFormatEditsRef.current = mergeRangeFormatEdit(draftRangeFormatEditsRef.current, {
          start: selectedOffsets.start,
          end: selectedOffsets.end,
          formatting: { fontSize },
        });
      }
    } else if (command === 'foreColor' && value) {
      const color = hexToRgb(value);
      setDraftColor(color);
      if (selectedOffsets) {
        draftRangeFormatEditsRef.current = mergeRangeFormatEdit(draftRangeFormatEditsRef.current, {
          start: selectedOffsets.start,
          end: selectedOffsets.end,
          formatting: { color },
        });
      }
    } else if (command === 'underline') {
      const underline = document.queryCommandState('underline');
      if (selectedOffsets) {
        draftRangeFormatEditsRef.current = mergeRangeFormatEdit(draftRangeFormatEditsRef.current, {
          start: selectedOffsets.start,
          end: selectedOffsets.end,
          formatting: { underline },
        });
      }
    } else if (command === 'strikeThrough') {
      const strikethrough = document.queryCommandState('strikeThrough');
      if (selectedOffsets) {
        draftRangeFormatEditsRef.current = mergeRangeFormatEdit(draftRangeFormatEditsRef.current, {
          start: selectedOffsets.start,
          end: selectedOffsets.end,
          formatting: { strikethrough },
        });
      }
    }
  }, [setAppErrors]);

  /** Cancel inline editing — discard draft and exit edit mode. */
  const handleDraftCancel = useCallback(() => {
    setEditingTextTargetId(null);
    setTextDraft('');
    draftRangeFormatEditsRef.current = [];
    setFormatState({ isBold: false, isItalic: false, isUnderline: false, isStrikethrough: false });
  }, []);

  /**
   * Commit inline draft — Phase 4 real mutation path.
   */
  const handleDraftCommit = useCallback(async (committedText: string) => {
    if (!selectedTextTarget) {
      return;
    }
    if (isCommittingRef.current) {
      return;
    }

    const originalText = extractText(selectedTextTarget);
    const rangeFormatEdits = draftRangeFormatEditsRef.current.slice();
    const hasRangeFormatEdits = rangeFormatEdits.length > 0;

    const rawFirstSpan = selectedTextTarget.lines[0]?.spans[0];
    const firstEditorSpan = rawFirstSpan
      ? toEditorTextSpan(rawFirstSpan, pageIndex, 0)
      : null;

    const originalFontSize = firstEditorSpan?.fontSize ?? null;
    const originalColor = firstEditorSpan?.color ?? null;
    const originalBold = firstEditorSpan?.isBold ?? null;
    const originalItalic = firstEditorSpan?.isItalic ?? null;

    // Check if anything actually changed (text or style/formatting)
    const textChanged = committedText !== originalText;

    // Helper to check if two color arrays are equal
    const colorsEqual = (c1: [number, number, number] | null, c2: [number, number, number] | null) => {
      if (!c1 && !c2) return true;
      if (!c1 || !c2) return false;
      return Math.abs(c1[0] - c2[0]) < 0.01 && Math.abs(c1[1] - c2[1]) < 0.01 && Math.abs(c1[2] - c2[2]) < 0.01;
    };

    const fontSizeChanged = !hasRangeFormatEdits && draftFontSize !== null && originalFontSize !== null && draftFontSize !== originalFontSize;
    const colorChanged = !hasRangeFormatEdits && draftColor !== null && !colorsEqual(draftColor, originalColor);
    const boldChanged = !hasRangeFormatEdits && draftBold !== null && originalBold !== null && draftBold !== originalBold;
    const italicChanged = !hasRangeFormatEdits && draftItalic !== null && originalItalic !== null && draftItalic !== originalItalic;

    const anyChanged = textChanged || fontSizeChanged || colorChanged || boldChanged || italicChanged || hasRangeFormatEdits;

    if (!anyChanged) {
      setEditingTextTargetId(null);
      setTextDraft('');
      draftRangeFormatEditsRef.current = [];
      return;
    }

    const mutationSupport = getMutationSupport(selectedTextTarget);
    const onlyRangeFormatChanges =
      hasRangeFormatEdits &&
      !textChanged &&
      !fontSizeChanged &&
      !colorChanged &&
      !boldChanged &&
      !italicChanged &&
      selectedTextTarget.source === 'digital';

    if (!mutationSupport.writable && !onlyRangeFormatChanges) {
      const unsupported = getUnsupportedMessage(mutationSupport);
      setAppErrors(prev => appendError(prev, makeTextMutationError(unsupported.explanation)));
      return;
    }

    // Validate replacement before calling the backend, with safe bounding box expansion enabled
    if (textChanged) {
      const constraints = mutationSupport.constraints;
      if (!constraints) {
        const unsupported = getUnsupportedMessage(mutationSupport);
        setAppErrors(prev => appendError(prev, makeTextMutationError(unsupported.explanation)));
        return;
      }
      const validation = validateReplacement(originalText, committedText, constraints);
      if (!validation.valid) {
        setAppErrors(prev => appendError(prev, makeTextMutationError(validation.message)));
        return; // Stay in edit mode — user can correct the replacement
      }
    }

    isCommittingRef.current = true;
    beginCommit(pageIndex);

    try {
      const mutationEngine = getCanonicalTextMutationEngine();
      const supportsSelectionFormatting = Boolean(mutationEngine.formatTextRange || mutationEngine.formatTextRanges);
      let currentTextKey = extractRawText(selectedTextTarget);
      let mutationSuccess = false;
      const logMessages: string[] = [];

      // 1. Text replacement mutation
      if (textChanged) {
        const result = await mutationEngine.replaceTextSpan({
          pageIndex,
          originalText: currentTextKey,
          replacementText: committedText,
          target: firstEditorSpan ? {
            rect: selectedTextTarget.rect,
            fontSize: firstEditorSpan.fontSize,
            color: firstEditorSpan.color,
            isBold: firstEditorSpan.isBold,
            isItalic: firstEditorSpan.isItalic,
          } : { rect: selectedTextTarget.rect },
        });

        if (result.success && result.value.replaced) {
          mutationSuccess = true;
          // markDirty
          const count = result.value.occurrenceCount ?? 0;
          // Which one of several identical words changed is the whole point of
          // the anchor; the event log is where a user checks it afterwards.
          const occurrence = count > 1
            ? ` (${(result.value.occurrenceIndex ?? 0) + 1}/${count})`
            : '';
          logMessages.push(`Tekst bewerkt: "${currentTextKey}" → "${committedText}"${occurrence}`);
          // A replacement written in a stand-in font is a change to how the
          // page looks. It succeeded, so it is not an error -- but it is not
          // nothing either, and silence here is what #413 removed everywhere else.
          if (result.value.fontSubstituted === true) {
            reportFallback({
              source: 'replace_text_span',
              code: 'FONT_SUBSTITUTED',
              title: i18n.t('textMutation.fallback.fontSubstitutedTitle'),
              message: i18n.t('textMutation.fallback.fontSubstitutedMessage'),
              severity: 'warning',
            });
          }
          // The document was Reader-enabled and is not any more. The edit is
          // what the user asked for, so it stands -- but the file just lost
          // rights it will not get back, and until now the Sign panel went on
          // showing the destroyed signature as if it still held (#466).
          if (result.value.usageRightsInvalidated === true && !usageRightsAnnouncedRef.current) {
            usageRightsAnnouncedRef.current = true;
            announceUsageRightsInvalidated();
          }
          currentTextKey = committedText; // Update search key for subsequent style operations
        } else {
          // Two different failures arrive here: a typed rejection from the
          // writer (`value.reason` is one of the nine codes) and a thrown
          // engine error (free text). Both carry a reason; neither used to
          // survive the trip to the screen.
          const code = result.success ? (result.value.reason ?? 'text-not-found-in-content-stream') : 'internal-error';
          // The writer's own sentence, whether it came back as a typed refusal
          // or as a thrown error. It is the half that names the actual cause.
          const detail = result.success ? (result.value.detail ?? undefined) : result.error.message;
          const message = getBackendRejectionMessage(code, detail);
          setTextMutationRejection({
            code,
            detail: detail ?? null,
            originalText: currentTextKey,
            tooltip: message.tooltip,
            explanation: message.explanation,
            actionable: message.actionable,
          });
          setAppErrors(prev => appendError(prev, makeTextMutationError(message.explanation)));
          // Abort further formatting since the span couldn't be targeted/replaced
          return;
        }
      }

      // 2. Selection-level format mutation. This targets the actual inline
      // editor selection instead of asking the SDK to format an entire run.
      if (hasRangeFormatEdits && !textChanged) {
        if (!supportsSelectionFormatting) {
          // The current desktop text writer supports whole-run style writes, while
          // non-Tauri harnesses return typed unsupported results for range writes.
          // Do not turn a preview-only selection format into a failed save action.
          setSelectedTextTarget(null);
          setSelectedTextTargetId(null);
          setEditingTextTargetId(null);
          setTextDraft('');
          draftRangeFormatEditsRef.current = [];
          return;
        } else {
          const requestsBySpan = new Map<string, {
            span: TextSpanTarget;
            ranges: Array<{ startOffset: number; endOffset: number; formatting: DraftRangeFormatEdit['formatting'] }>;
          }>();

          for (const edit of rangeFormatEdits) {
            const spanRanges = mapTargetTextRangeToSpanRanges(selectedTextTarget, edit.start, edit.end);
            for (const spanRange of spanRanges) {
              const existing = requestsBySpan.get(spanRange.span.id);
              const entry = existing ?? { span: spanRange.span, ranges: [] };
              entry.ranges.push({
                startOffset: spanRange.startOffset,
                endOffset: spanRange.endOffset,
                formatting: edit.formatting,
              });
              requestsBySpan.set(spanRange.span.id, entry);
            }
          }

          for (const entry of requestsBySpan.values()) {
            const result = mutationEngine.formatTextRanges
              ? await mutationEngine.formatTextRanges({
                  pageIndex,
                  originalText: entry.span.rawText ?? entry.span.text,
                  ranges: entry.ranges,
                })
              : await mutationEngine.formatTextRange!({
                  pageIndex,
                  originalText: entry.span.rawText ?? entry.span.text,
                  ...entry.ranges[0]!,
                });

            if (result.success && result.value.formatted) {
              mutationSuccess = true;
              logMessages.push(`Opmaak aangepast voor selectie`);
            } else {
              const reason = !result.success ? result.error.message : (result.value.reason ?? 'Formattering kon niet worden toegepast.');
              setAppErrors(prev => appendError(prev, makeTextMutationError(reason)));
            }
          }
        }
      }

      // 3. Formatting mutation (fontSize and whole-run color)
      if (fontSizeChanged || colorChanged) {
        const formatting: { fontSize?: number; color?: [number, number, number] } = {};
        if (fontSizeChanged) {
          formatting.fontSize = draftFontSize;
          logMessages.push(`Lettergrootte aangepast: ${originalFontSize}pt → ${draftFontSize}pt`);
        }
        if (colorChanged) {
          formatting.color = draftColor;
          logMessages.push(`Kleur aangepast`);
        }

        const result = await mutationEngine.formatTextSpan({
          pageIndex,
          originalText: currentTextKey,
          formatting,
        });

        if (result.success && result.value.formatted) {
          mutationSuccess = true;
        } else {
          const reason = !result.success ? result.error.message : (result.value.reason ?? 'Formattering kon niet worden toegepast.');
          setAppErrors(prev => appendError(prev, makeTextMutationError(reason)));
        }
      }

      // 4. Style mutation (bold and italic)
      if (boldChanged || italicChanged) {
        const style: { bold?: boolean; italic?: boolean } = {};
        if (boldChanged) {
          style.bold = draftBold;
          logMessages.push(`Bold aangepast: ${originalBold} → ${draftBold}`);
        }
        if (italicChanged) {
          style.italic = draftItalic;
          logMessages.push(`Italic aangepast: ${originalItalic} → ${draftItalic}`);
        }

        const result = await mutationEngine.setTextRunStyle({
          pageIndex,
          originalText: currentTextKey,
          style,
        });

        if (result.success && result.value.styled) {
          mutationSuccess = true;
        } else {
          const reason = !result.success ? result.error.message : (result.value.reason ?? 'Stijl kon niet worden toegepast.');
          setAppErrors(prev => appendError(prev, makeTextMutationError(reason)));
        }
      }

      if (mutationSuccess) {
        noteMutationAck(pageIndex);
        setTextMutationRejection(null);
        markDirty();
        onDocumentMutated?.([pageIndex]);
        setDocumentEventLog(prev => appendEvent(prev, makeDocumentEvent(
          'page_mutated',
          authorName,
          pageIndex,
          selectedTextTarget?.id ?? '',
          logMessages.join(', '),
        )));
        setSelectedTextTarget(null);
        setSelectedTextTargetId(null);
        setEditingTextTargetId(null);
        setTextDraft('');
        draftRangeFormatEditsRef.current = [];
      }
    } catch (e) {
      setAppErrors(prev => appendError(prev, makeTextMutationError(String(e))));
      setEditingTextTargetId(null);
      setTextDraft('');
      draftRangeFormatEditsRef.current = [];
    } finally {
      // Nothing changed, or the commit threw: there is no repaint to wait for,
      // and leaving the intent parked would report the next unrelated render of
      // this page as this commit's repaint.
      abandonCommitIfUnarmed();
      isCommittingRef.current = false;
    }
  }, [
    selectedTextTarget,
    pageIndex,
    markDirty,
    draftFontSize,
    draftColor,
    draftBold,
    draftItalic,
    onDocumentMutated,
    authorName,
    setDocumentEventLog,
    setAppErrors,
  ]);

  // Track bold/italic/underline state while the editor is active
  useEffect(() => {
    if (!editingTextTargetId) return;
    function updateFormatState() {
      setFormatState({
        isBold: document.queryCommandState('bold'),
        isItalic: document.queryCommandState('italic'),
        isUnderline: document.queryCommandState('underline'),
        isStrikethrough: document.queryCommandState('strikeThrough'),
      });
    }
    document.addEventListener('selectionchange', updateFormatState);
    return () => { document.removeEventListener('selectionchange', updateFormatState); };
  }, [editingTextTargetId]);

  const dismissTextMutationRejection = useCallback(() => setTextMutationRejection(null), []);

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
    textEditMaxLength,
    formatState,
    handleFormatCommand,
    editorDivRef,
    editingPageIndex,
    textMutationRejection,
    dismissTextMutationRejection,
  };
}
