// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { useEffect, useRef, memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextParagraphTarget } from '../text/textInteractionModel';
import { pdfRectToDom } from '../text/textInteractionModel';
import { toEditorTextSpan, getEditorFontFamily } from '../text/editorTextSpan';

/**
 * Normalize text read from the contenteditable editor.
 *
 * Writable inline targets are single-line PDF text runs. The contenteditable
 * can still accumulate structure the PDF cannot represent:
 *   - U+00A0 (nbsp) inserted by WebKit for visible spaces,
 *   - a phantom trailing <br> (reads as a trailing newline),
 *   - interior line breaks from pasted multiline content.
 * Interior breaks become a single space (never silently glued), trailing
 * breaks are dropped, and nbsp becomes a regular space — so every commit
 * path (checkmark, blur, Enter) produces identical, PDF-safe text.
 */
export function normalizeInlineEditorText(raw: string): string {
  return raw
    .replace(/\u00a0/g, ' ')
    .replace(/\n+$/, '')
    .replace(/[ \t]*\n+[ \t]*/g, ' ');
}

/**
 * Single source of truth for "what text is in the inline editor".
 * innerText preserves rendered line breaks (so they can be normalized
 * deliberately); textContent is the jsdom/test fallback.
 */
export function readInlineEditorText(el: HTMLElement): string {
  return normalizeInlineEditorText(el.innerText ?? el.textContent ?? '');
}

export interface TextInlineEditorProps {
  target: TextParagraphTarget;
  draft: string;
  onDraftChange: (text: string) => void;
  onCommit: (text: string) => void;
  onCancel: () => void;
  pageHeightPt: number;
  zoom: number;
  /** If provided, position the cursor at this client coordinate on mount. */
  cursorAtPoint?: { clientX: number; clientY: number } | null;
  /** Format commands forwarded from the format bar. */
  onFormatCommand?: (command: string, value?: string) => void;
  /** Ref to the contenteditable element (forwarded for format bar to call execCommand on). */
  editorRef?: React.RefObject<HTMLDivElement | null>;
  /** Maximum writable replacement length for this beta-safe edit target. */
  maxLength?: number | null;
}

export const TextInlineEditor = memo(function TextInlineEditor({
  target,
  draft,
  onDraftChange,
  onCommit,
  onCancel,
  pageHeightPt,
  zoom,
  cursorAtPoint,
  editorRef: externalRef,
  maxLength,
}: TextInlineEditorProps) {
  const { t } = useTranslation();
  const internalRef = useRef<HTMLDivElement>(null);
  const editorRef = externalRef ?? internalRef;
  const committedRef = useRef(false);
  const domRect = pdfRectToDom(target.rect, pageHeightPt, zoom);
  const fontSize = Math.max(10, (target.lines[0]?.spans[0]?.fontSize ?? 12) * zoom);

  // Convert the first span to an EditorTextSpan for font metadata
  const rawFirstSpan = target.lines[0]?.spans[0];
  const firstEditorSpan = rawFirstSpan
    ? toEditorTextSpan(rawFirstSpan, 0, 0)
    : null;

  const spanColor = firstEditorSpan?.color;
  const textColorCss = spanColor
    ? `rgb(${Math.round(spanColor[0] * 255)}, ${Math.round(spanColor[1] * 255)}, ${Math.round(spanColor[2] * 255)})`
    : 'inherit';
  const isSingleLineTarget = target.lines.length === 1;
  const editorHeight = Math.max(domRect.height, fontSize * Math.max(1, domRect.height / fontSize));
  const calculatedLineHeight = target.lines.length > 0 ? (domRect.height / target.lines.length) / fontSize : 1.15;
  const effectiveMaxLength = typeof maxLength === 'number' && Number.isFinite(maxLength)
    ? Math.max(0, Math.floor(maxLength))
    : null;
  const helpId = `text-inline-editor-help-${target.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const helpTop = domRect.top + (isSingleLineTarget ? editorHeight : Math.max(domRect.height, fontSize * calculatedLineHeight)) + 6;
  const shouldShowLimitHelp = effectiveMaxLength !== null && draft.length >= Math.max(0, effectiveMaxLength - 4);

  function readEditorText(): string {
    const el = editorRef.current;
    return el ? readInlineEditorText(el) : '';
  }

  function setEditorText(text: string): void {
    const el = editorRef.current;
    if (!el) return;
    el.textContent = text;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  }

  function getSelectionLength(): number {
    const el = editorRef.current;
    const selection = window.getSelection();
    if (!el || !selection || selection.rangeCount === 0) return 0;
    const range = selection.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return 0;
    return range.toString().replace(/\u00a0/g, ' ').length;
  }

  function remainingWritableChars(): number | null {
    if (effectiveMaxLength === null) return null;
    return Math.max(0, effectiveMaxLength - (readEditorText().length - getSelectionLength()));
  }

  function clampText(text: string): string {
    return effectiveMaxLength === null ? text : text.slice(0, effectiveMaxLength);
  }

  // Set initial content, focus, and place cursor on mount
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const initialText = clampText(draft);
    el.textContent = initialText;
    if (initialText !== draft) {
      onDraftChange(initialText);
    }
    el.focus();

    // Position cursor at double-click point if provided
    if (cursorAtPoint) {
      const { clientX, clientY } = cursorAtPoint;

      // The double-click coordinates may be stale by the time the editor
      // mounts (e.g. the edit side panel opening shifts the layout). Only
      // apply a caret position that actually falls INSIDE this editor —
      // otherwise the selection (and keyboard focus) would silently move to
      // whatever element now sits at those coordinates.

      // Try standards-based caretPositionFromPoint
      if ('caretPositionFromPoint' in document) {
        const pos = (document as Document & {
          caretPositionFromPoint: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
        }).caretPositionFromPoint(clientX, clientY);
        if (pos && el.contains(pos.offsetNode)) {
          const sel = window.getSelection();
          const range = document.createRange();
          range.setStart(pos.offsetNode, pos.offset);
          range.collapse(true);
          sel?.removeAllRanges();
          sel?.addRange(range);
          return;
        }
      }

      // Fallback: caretRangeFromPoint (WebKit/Safari)
      if ('caretRangeFromPoint' in document) {
        const range = (document as Document & {
          caretRangeFromPoint: (x: number, y: number) => Range | null;
        }).caretRangeFromPoint(clientX, clientY);
        if (range && el.contains(range.startContainer)) {
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
          return;
        }
      }

      // Last fallback: cursor at end
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
      return;
    }

    // Default: cursor at end of content
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleBeforeInput(e: React.FormEvent<HTMLDivElement>): void {
    if (effectiveMaxLength === null) return;
    const nativeEvent = e.nativeEvent as InputEvent;
    if ((nativeEvent.inputType ?? '').startsWith('delete')) return;
    const insertedText = nativeEvent.data ?? '';
    if (insertedText.length === 0) return;
    const remaining = remainingWritableChars();
    if (remaining !== null && insertedText.length > remaining) {
      e.preventDefault();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>): void {
    if (effectiveMaxLength === null) return;
    const pastedText = e.clipboardData.getData('text/plain');
    const remaining = remainingWritableChars();
    if (remaining === null || pastedText.length <= remaining) return;
    e.preventDefault();
    const allowedText = pastedText.slice(0, remaining);
    if (allowedText.length > 0) {
      document.execCommand('insertText', false, allowedText);
    }
    onDraftChange(readEditorText());
  }

  function handleInput(): void {
    const currentText = readEditorText();
    const clampedText = clampText(currentText);
    if (clampedText !== currentText) {
      setEditorText(clampedText);
    }
    onDraftChange(clampedText);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      committedRef.current = true;
      onCancel();
      return;
    }
    if (e.key === 'Enter') {
      // Plain Enter and Cmd/Ctrl+Enter both commit. Writable inline targets
      // are single-line PDF text runs, so Enter must never insert a
      // contenteditable line break — an inserted <br>/<div> would be
      // invisible in the committed text and silently glue words together.
      e.preventDefault();
      e.stopPropagation();
      committedRef.current = true;
      onCommit(readEditorText() || draft);
    }
  }

  function handleBlur(e: React.FocusEvent<HTMLDivElement>): void {
    if (committedRef.current) return;

    // Voorkom sluiten als focus naar floating toolbar of rechter properties panel verhuist
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (relatedTarget) {
      if (
        relatedTarget.closest('[data-testid="text-edit-floating-pill"]') ||
        relatedTarget.closest('[data-testid="text-properties-panel"]')
      ) {
        return;
      }
    }

    committedRef.current = true;
    onCommit(readEditorText() || draft);
  }

  return (
    <>
      <div
        ref={editorRef as React.RefObject<HTMLDivElement>}
        data-testid="text-inline-editor"
        data-max-length={effectiveMaxLength ?? undefined}
        contentEditable
        role="textbox"
        aria-multiline={!isSingleLineTarget}
        aria-describedby={shouldShowLimitHelp ? helpId : undefined}
        suppressContentEditableWarning
        onBeforeInput={handleBeforeInput}
        onPaste={handlePaste}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        style={{
          position: 'absolute',
          top: domRect.top,
          left: domRect.left,
          width: Math.max(domRect.width, 60),
          height: isSingleLineTarget ? editorHeight : undefined,
          minHeight: isSingleLineTarget ? undefined : Math.max(domRect.height, fontSize * calculatedLineHeight),
          zIndex: 60,
          fontSize,
          fontFamily: getEditorFontFamily(firstEditorSpan),
          fontWeight: firstEditorSpan?.isBold ? 'bold' : 'normal',
          fontStyle: firstEditorSpan?.isItalic ? 'italic' : 'normal',
          lineHeight: calculatedLineHeight,
          // Transparent so the rendered page background shows through. The
          // original glyphs are hidden via visibility:hidden (TextLayer), not
          // painted over, so the live page colour remains beneath the editor —
          // the typed text then sits on the real background in its real colour.
          // A hardcoded white background made white-on-dark text (e.g. Canva
          // designs) invisible while editing. The blue caretColor keeps the
          // caret visible on any background.
          background: 'transparent',
          color: textColorCss,
          caretColor: 'rgb(37, 99, 235)',
          outline: 'none',
          border: 'none',
          boxShadow: 'none',
          borderRadius: '2px',
          whiteSpace: isSingleLineTarget ? 'pre' : 'pre-wrap',
          wordBreak: isSingleLineTarget ? 'normal' : 'break-word',
          cursor: 'text',
          padding: '0px',
          margin: '0px',
          resize: 'none',
          overflow: isSingleLineTarget ? 'hidden' : 'visible',
          letterSpacing: 0,
          textRendering: 'geometricPrecision',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          fontKerning: 'normal',
          fontVariantLigatures: 'none',
        }}
      />
      {shouldShowLimitHelp && (
        <div
          id={helpId}
          data-testid="text-inline-editor-help"
          aria-live="polite"
          style={{
            position: 'absolute',
            top: helpTop,
            left: domRect.left,
            width: Math.min(300, Math.max(220, domRect.width)),
            zIndex: 61,
            pointerEvents: 'none',
            padding: '5px 7px',
            borderRadius: '5px',
            border: '1px solid rgba(180, 83, 9, 0.22)',
            background: 'rgba(255, 251, 235, 0.94)',
            color: 'rgb(120, 53, 15)',
            boxShadow: '0 6px 18px rgba(15, 23, 42, 0.08)',
            fontSize: 10,
            lineHeight: 1.3,
            letterSpacing: 0,
          }}
        >
          {t('textEdit.betaLimitHelp')}
        </div>
      )}
    </>
  );
});
