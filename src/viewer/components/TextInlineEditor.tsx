// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * TextInlineEditor
 *
 * Inline draft editing shell anchored over a selected text paragraph.
 *
 * Design contract:
 * - Appears at the paragraph's DOM position (above/overlapping the target).
 * - Pre-fills with the paragraph's current text as a draft.
 * - Escape cancels without saving.
 * - Cmd/Ctrl+Enter commits the draft.
 * - Blur does NOT auto-commit — the user must explicitly commit or cancel.
 * - z-index sits above TextInteractionOverlay (z=15) and TextContextBar (z=50).
 *
 * This shell operates on the **draft text** only. Actual PDF mutation is
 * handled by the textDraftPipeline (Batch 6). This component only manages
 * the editing UX layer.
 */

import { useEffect, useRef, memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextParagraphTarget } from '../text/textInteractionModel';
import { pdfRectToDom } from '../text/textInteractionModel';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TextInlineEditorProps {
  /** The paragraph being edited. */
  target: TextParagraphTarget;
  /** Current draft text (controlled — owned by ViewerApp). */
  draft: string;
  /** Called on every keystroke to update the draft. */
  onDraftChange: (text: string) => void;
  /** Called when the user commits the draft (Cmd/Ctrl+Enter). */
  onCommit: (text: string) => void;
  /** Called when the user cancels editing (Escape or explicit cancel). */
  onCancel: () => void;
  pageHeightPt: number;
  zoom: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TextInlineEditor = memo(function TextInlineEditor({
  target,
  draft,
  onDraftChange,
  onCommit,
  onCancel,
  pageHeightPt,
  zoom,
}: TextInlineEditorProps) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const domRect = pdfRectToDom(target.rect, pageHeightPt, zoom);

  // Auto-focus and place cursor at end on mount
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
      return;
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      e.stopPropagation();
      onCommit(draft);
    }
  }

  return (
    <div
      data-testid="text-inline-editor"
      style={{
        position: 'absolute',
        top: domRect.top,
        left: domRect.left,
        width: Math.max(domRect.width, 120),
        zIndex: 60,
        boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
        borderRadius: 6,
        background: 'var(--background, #fff)',
        border: '2px solid var(--primary, #2563eb)',
        overflow: 'hidden',
      }}
    >
      <textarea
        ref={textareaRef}
        data-testid="text-inline-editor-textarea"
        value={draft}
        onChange={e => onDraftChange(e.target.value)}
        onKeyDown={handleKeyDown}
        style={{
          display: 'block',
          width: '100%',
          minHeight: Math.max(domRect.height, 40),
          padding: '6px 8px',
          fontSize: Math.max(10, (target.lines[0]?.spans[0]?.fontSize ?? 12) * zoom),
          lineHeight: 1.5,
          fontFamily: 'inherit',
          border: 'none',
          outline: 'none',
          resize: 'vertical',
          background: 'transparent',
          color: 'var(--foreground, #1a1a1a)',
          boxSizing: 'border-box',
        }}
        // Blur does NOT auto-commit — explicit commit/cancel required
        onBlur={() => { /* intentionally no-op */ }}
      />
      <div
        data-testid="text-inline-editor-actions"
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 4,
          padding: '2px 6px 4px',
          borderTop: '1px solid var(--border, #e2e8f0)',
        }}
      >
        <button
          data-testid="text-inline-editor-cancel"
          onClick={() => onCancel()}
          style={{
            fontSize: 11,
            padding: '2px 8px',
            border: '1px solid var(--border, #e2e8f0)',
            borderRadius: 4,
            background: 'transparent',
            cursor: 'pointer',
            color: 'var(--muted-foreground, #64748b)',
          }}
        >
          {t('common.cancel')}
        </button>
        <button
          data-testid="text-inline-editor-commit"
          onClick={() => onCommit(draft)}
          style={{
            fontSize: 11,
            padding: '2px 8px',
            border: 'none',
            borderRadius: 4,
            background: 'var(--primary, #2563eb)',
            color: '#fff',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          {t('common.save')}
        </button>
      </div>
    </div>
  );
});
