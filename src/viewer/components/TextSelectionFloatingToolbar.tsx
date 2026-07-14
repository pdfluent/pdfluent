// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { memo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MessageSquareIcon,
  HighlighterIcon,
  StrikethroughIcon,
  UnderlineIcon,
  CopyIcon,
  PencilIcon,
} from 'lucide-react';
import type { ViewerMode } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TextSelectionInfo {
  /** Selected text content. */
  text: string;
  /** PDF-space rects of the selection. */
  pdfRects: Array<{ x: number; y: number; width: number; height: number }>;
  /** Top position relative to the page canvas container (DOM px). */
  anchorTop: number;
  /** Bottom position relative to the page canvas container (DOM px). */
  anchorBottom: number;
  /** Left position relative to the page canvas container (DOM px). */
  anchorLeft: number;
  /** Width of the selection bounding box (DOM px). */
  anchorWidth: number;
}

interface TextSelectionFloatingToolbarProps {
  selection: TextSelectionInfo;
  onHighlight: (pdfRects: TextSelectionInfo['pdfRects']) => void;
  onUnderline: (pdfRects: TextSelectionInfo['pdfRects']) => void;
  onStrikethrough: (pdfRects: TextSelectionInfo['pdfRects']) => void;
  onAddComment: () => void;
  onCopy: (text: string) => void;
  onDismiss: () => void;
  onEditText?: () => void;
  mode?: ViewerMode;
}

// ---------------------------------------------------------------------------
// Toolbar actions
// ---------------------------------------------------------------------------

const TOOLBAR_GAP = 8;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TextSelectionFloatingToolbar = memo(function TextSelectionFloatingToolbar({
  selection,
  onHighlight,
  onUnderline,
  onStrikethrough,
  onAddComment,
  onCopy,
  onDismiss,
  onEditText,
  mode,
}: TextSelectionFloatingToolbarProps) {
  const { t } = useTranslation();
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Dismiss on click outside
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    }
    // Use setTimeout so the current mouseup doesn't immediately dismiss
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleMouseDown);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [onDismiss]);

  // Dismiss on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onDismiss();
    }
    window.addEventListener('keydown', handleKey);
    return () => { window.removeEventListener('keydown', handleKey); };
  }, [onDismiss]);

  const isEditMode = mode === 'edit';

  // Calculate dynamic toolbar height to prevent overlap
  let estimatedHeight = 0;
  if (isEditMode) {
    estimatedHeight = onEditText ? 80 : 52;
  } else {
    // Normal mode: icon row (36px) + Copy button (28px) + paddings/borders
    estimatedHeight = 88;
  }

  // Position above the selection, centered. If there's not enough room
  // above, position below instead to avoid overlapping the selected text.
  const fitsAbove = selection.anchorTop >= estimatedHeight + TOOLBAR_GAP;
  const top = fitsAbove
    ? selection.anchorTop - estimatedHeight - TOOLBAR_GAP
    : selection.anchorBottom + TOOLBAR_GAP;
  const left = Math.max(0, selection.anchorLeft + selection.anchorWidth / 2 - 100);

  const iconBtnClass =
    'p-1.5 rounded-md text-foreground hover:bg-muted transition-colors cursor-pointer';

  return (
    <div
      ref={toolbarRef}
      data-testid="text-selection-toolbar"
      style={{
        position: 'absolute',
        top,
        left,
        zIndex: 55,
      }}
      className="bg-popover border border-border rounded-lg shadow-lg py-1.5 px-2 select-none"
    >
      {/* Icon row - hide when in edit mode */}
      {!isEditMode && (
        <div className="flex items-center gap-0.5 pb-1.5 border-b border-border">
          <button
            data-testid="sel-toolbar-comment"
            onClick={(e) => { e.stopPropagation(); onAddComment(); }}
            title={t('selToolbar.addComment')}
            aria-label={t('selToolbar.addComment')}
            className={iconBtnClass}
          >
            <MessageSquareIcon className="w-4 h-4" />
          </button>
          <button
            data-testid="sel-toolbar-highlight"
            onClick={(e) => { e.stopPropagation(); onHighlight(selection.pdfRects); }}
            title={t('selToolbar.highlight')}
            aria-label={t('selToolbar.highlight')}
            className={iconBtnClass}
          >
            <HighlighterIcon className="w-4 h-4" />
          </button>
          <button
            data-testid="sel-toolbar-strikethrough"
            onClick={(e) => { e.stopPropagation(); onStrikethrough(selection.pdfRects); }}
            title={t('selToolbar.strikethrough')}
            aria-label={t('selToolbar.strikethrough')}
            className={iconBtnClass}
          >
            <StrikethroughIcon className="w-4 h-4" />
          </button>
          <button
            data-testid="sel-toolbar-underline"
            onClick={(e) => { e.stopPropagation(); onUnderline(selection.pdfRects); }}
            title={t('selToolbar.underline')}
            aria-label={t('selToolbar.underline')}
            className={iconBtnClass}
          >
            <UnderlineIcon className="w-4 h-4" />
          </button>
        </div>
      )}
      {/* Text actions */}
      <div className="pt-1.5 space-y-0.5">
        {isEditMode && onEditText && (
          <button
            data-testid="sel-toolbar-edit"
            onClick={(e) => { e.stopPropagation(); onEditText(); }}
            className="flex items-center gap-2 w-full px-2 py-1 text-xs text-foreground hover:bg-muted rounded-md transition-colors cursor-pointer"
          >
            <PencilIcon className="w-3.5 h-3.5 text-muted-foreground" />
            {t('textContext.editText') || 'Bewerk tekst'}
          </button>
        )}
        <button
          data-testid="sel-toolbar-copy"
          onClick={(e) => { e.stopPropagation(); onCopy(selection.text); }}
          className="flex items-center gap-2 w-full px-2 py-1 text-xs text-foreground hover:bg-muted rounded-md transition-colors cursor-pointer"
        >
          <CopyIcon className="w-3.5 h-3.5 text-muted-foreground" />
          {t('selToolbar.copyText')}
        </button>
      </div>
    </div>
  );
});
