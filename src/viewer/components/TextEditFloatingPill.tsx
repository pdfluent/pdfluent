// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { memo, useState, useEffect } from 'react';
import {
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  StrikethroughIcon,
  CheckIcon,
  XIcon,
  Scissors,
  Copy,
  Clipboard,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { pdfRectToDom, type TextRect } from '../text/textInteractionModel';

export interface TextEditFloatingPillProps {
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  isStrikethrough: boolean;
  fontSize: number;
  onBold: () => void;
  onItalic: () => void;
  onUnderline: () => void;
  onStrikethrough: () => void;
  onCommit: () => void;
  onCancel: () => void;
  editingParagraphBounds: TextRect | null;
  pageHeightPt: number;
  zoom: number;
}

const PILL_OFFSET_PX = 12;
const PILL_HEIGHT_PX = 40;
const PILL_WIDTH_PX = 450;

export const TextEditFloatingPill = memo(function TextEditFloatingPill({
  isBold,
  isItalic,
  isUnderline,
  isStrikethrough,
  fontSize,
  onBold,
  onItalic,
  onUnderline,
  onStrikethrough,
  onCommit,
  onCancel,
  editingParagraphBounds,
  pageHeightPt,
  zoom,
}: TextEditFloatingPillProps) {
  const { t } = useTranslation();
  const [canPaste, setCanPaste] = useState(false);

  // Check if clipboard is readable
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      setCanPaste(true);
    }
  }, []);

  if (!editingParagraphBounds) return null;

  const domRect = pdfRectToDom(editingParagraphBounds, pageHeightPt, zoom);
  // Position pill above the paragraph bounding box, clamped to at least 0
  const pillTop = Math.max(0, domRect.top - PILL_HEIGHT_PX - PILL_OFFSET_PX);
  const pillLeft = Math.max(0, domRect.left + (domRect.width - PILL_WIDTH_PX) / 2); // centering

  const handleCut = (e: React.MouseEvent) => {
    e.stopPropagation();
    document.execCommand('cut');
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    document.execCommand('copy');
  };

  const handlePaste = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        document.execCommand('insertText', false, text);
      }
    } catch {
      document.execCommand('paste');
    }
  };

  const handleSelectAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    document.execCommand('selectAll');
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    document.execCommand('delete');
  };

  return (
    <div
      data-testid="text-edit-floating-pill"
      style={{
        position: 'absolute',
        top: pillTop,
        left: pillLeft,
        height: PILL_HEIGHT_PX,
        width: PILL_WIDTH_PX,
        zIndex: 50,
        pointerEvents: 'auto',
        userSelect: 'none',
      }}
      className="flex items-center gap-1.5 px-3.5 bg-background/70 dark:bg-zinc-900/70 backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-[0_10px_35px_-5px_rgba(0,0,0,0.15)] rounded-full transition-all duration-300 animate-in fade-in zoom-in-95 duration-150"
    >
      {/* ── Styling group ── */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { e.stopPropagation(); onBold(); }}
          aria-pressed={isBold}
          data-testid="text-edit-bold-btn"
          title={t('toolbar.bold', { defaultValue: 'Vetgedrukt' })}
          className={`p-1.5 rounded-full transition-all duration-200 cursor-pointer flex items-center justify-center hover:scale-105 active:scale-95 hover:bg-black/5 dark:hover:bg-white/10 ${
            isBold ? 'text-primary bg-primary/10' : 'text-muted-foreground'
          }`}
        >
          <BoldIcon className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { e.stopPropagation(); onItalic(); }}
          aria-pressed={isItalic}
          data-testid="text-edit-italic-btn"
          title={t('toolbar.italic', { defaultValue: 'Cursief' })}
          className={`p-1.5 rounded-full transition-all duration-200 cursor-pointer flex items-center justify-center hover:scale-105 active:scale-95 hover:bg-black/5 dark:hover:bg-white/10 ${
            isItalic ? 'text-primary bg-primary/10' : 'text-muted-foreground'
          }`}
        >
          <ItalicIcon className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { e.stopPropagation(); onUnderline(); }}
          aria-pressed={isUnderline}
          data-testid="text-edit-underline-btn"
          title={t('toolbar.underline', { defaultValue: 'Onderstreept' })}
          className={`p-1.5 rounded-full transition-all duration-200 cursor-pointer flex items-center justify-center hover:scale-105 active:scale-95 hover:bg-black/5 dark:hover:bg-white/10 ${
            isUnderline ? 'text-primary bg-primary/10' : 'text-muted-foreground'
          }`}
        >
          <UnderlineIcon className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { e.stopPropagation(); onStrikethrough(); }}
          aria-pressed={isStrikethrough}
          data-testid="text-edit-strike-btn"
          title={t('toolbar.strikethrough', { defaultValue: 'Doorgehaald' })}
          className={`p-1.5 rounded-full transition-all duration-200 cursor-pointer flex items-center justify-center hover:scale-105 active:scale-95 hover:bg-black/5 dark:hover:bg-white/10 ${
            isStrikethrough ? 'text-primary bg-primary/10' : 'text-muted-foreground'
          }`}
        >
          <StrikethroughIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="w-px h-4 bg-border/60 mx-0.5" />

      {/* ── Clipboard group ── */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleCut}
          title={t('toolbar.cut', { defaultValue: 'Knippen' })}
          className="p-1.5 rounded-full text-muted-foreground transition-all duration-200 cursor-pointer flex items-center justify-center hover:scale-105 active:scale-95 hover:bg-black/5 dark:hover:bg-white/10"
        >
          <Scissors className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleCopy}
          title={t('toolbar.copy', { defaultValue: 'Kopiëren' })}
          className="p-1.5 rounded-full text-muted-foreground transition-all duration-200 cursor-pointer flex items-center justify-center hover:scale-105 active:scale-95 hover:bg-black/5 dark:hover:bg-white/10"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handlePaste}
          disabled={!canPaste}
          title={t('toolbar.paste', { defaultValue: 'Plakken' })}
          className="p-1.5 rounded-full text-muted-foreground transition-all duration-200 cursor-pointer flex items-center justify-center hover:scale-105 active:scale-95 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none"
        >
          <Clipboard className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="w-px h-4 bg-border/60 mx-0.5" />

      {/* ── Text Actions ── */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleSelectAll}
          title={t('toolbar.selectAll', { defaultValue: 'Alles Selecteren' })}
          className="px-2 py-1 rounded-full text-[10px] font-semibold text-muted-foreground transition-all duration-200 cursor-pointer flex items-center justify-center hover:scale-105 active:scale-95 hover:bg-black/5 dark:hover:bg-white/10"
        >
          {t('toolbar.all', { defaultValue: 'ALL' })}
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleDelete}
          title={t('toolbar.delete', { defaultValue: 'Wissen' })}
          className="p-1.5 rounded-full text-muted-foreground transition-all duration-200 cursor-pointer flex items-center justify-center hover:scale-105 active:scale-95 hover:bg-destructive hover:text-destructive-foreground"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="w-px h-4 bg-border/60 mx-0.5" />

      {/* Font size indicator */}
      <span className="text-[10px] font-bold px-1.5 text-muted-foreground/80 select-none flex items-center shrink-0">
        {Math.round(fontSize)} pt
      </span>

      <div className="w-px h-4 bg-border/60 mx-0.5" />

      {/* ── Control group ── */}
      <div className="flex items-center gap-0.5 ml-auto">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { e.stopPropagation(); onCancel(); }}
          aria-label={t('common.cancel', { defaultValue: 'Annuleren' })}
          data-testid="text-edit-cancel-btn"
          title={t('common.cancel', { defaultValue: 'Annuleren' })}
          className="p-1.5 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200 cursor-pointer flex items-center justify-center hover:scale-105 active:scale-95"
        >
          <XIcon className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { e.stopPropagation(); onCommit(); }}
          aria-label={t('common.save', { defaultValue: 'Opslaan' })}
          data-testid="text-edit-save-btn"
          title={t('common.save', { defaultValue: 'Opslaan' })}
          className="p-1.5 rounded-full text-primary hover:text-primary-foreground hover:bg-primary transition-all duration-200 cursor-pointer flex items-center justify-center hover:scale-105 active:scale-95"
        >
          <CheckIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
});
