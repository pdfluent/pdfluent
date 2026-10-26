// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { memo, useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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
import { placeEditPill, clampPillIntoViewport } from '../text/editPillPlacement';

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

  const pillRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  // Where the pill goes inside .docarea (the portal target), or null until the
  // first layout pass and whenever there is no shell around us (unit tests).
  const [shellPos, setShellPos] = useState<{ top: number; left: number } | null>(null);
  const [shell, setShell] = useState<HTMLElement | null>(null);

  // The pill must not live inside .page: that box is overflow:hidden, and the
  // pill is clamped into the visible strip of the canvas, which is wider than
  // a small-window page. Anything past the page edge was clipped, so a click on
  // Save hit the canvas behind it (J-40 at 1028x729; elementFromPoint said
  // div.canvas). It is portalled into .docarea, above the canvas layer, and
  // placed from client coordinates so it follows the page when the canvas
  // scrolls or resizes.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const page = anchor?.parentElement ?? null;
    const docarea = page?.closest<HTMLElement>('.docarea') ?? null;
    const scroller = page?.closest<HTMLElement>('.canvas') ?? null;
    setShell(docarea);
    if (!page || !docarea || !scroller || !editingParagraphBounds) {
      setShellPos(null);
      return;
    }
    const para = pdfRectToDom(editingParagraphBounds, pageHeightPt, zoom);
    const update = () => {
      const pageBox = page.getBoundingClientRect();
      const areaBox = docarea.getBoundingClientRect();
      const view = scroller.getBoundingClientRect();
      const viewW = scroller.clientWidth;
      const viewH = scroller.clientHeight;
      // Place against the part of the canvas that is on screen, so "no room
      // above" also means "above is scrolled out of view" and the pill flips
      // below the paragraph instead of landing on the inline editor.
      const placed = placeEditPill(
        {
          left: pageBox.left + para.left - view.left,
          top: pageBox.top + para.top - view.top,
          width: para.width,
          height: para.height,
        },
        { width: PILL_WIDTH_PX, height: PILL_HEIGHT_PX },
        PILL_OFFSET_PX,
        null,
      );
      const left = clampPillIntoViewport(
        placed.left + view.left, PILL_WIDTH_PX, 0, { left: view.left, right: view.left + viewW },
      );
      const top = clampPillIntoViewport(
        placed.top + view.top, PILL_HEIGHT_PX, 0, { left: view.top, right: view.top + viewH },
      );
      const next = { top: top - areaBox.top, left: left - areaBox.left };
      setShellPos((prev) =>
        prev && Math.abs(prev.top - next.top) < 0.5 && Math.abs(prev.left - next.left) < 0.5 ? prev : next,
      );
    };
    update();
    scroller.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    // The side panels open and close without a window resize.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(scroller);
    observer?.observe(page);
    return () => {
      scroller.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      observer?.disconnect();
    };
  }, [editingParagraphBounds, pageHeightPt, zoom]);

  if (!editingParagraphBounds) return null;

  const domRect = pdfRectToDom(editingParagraphBounds, pageHeightPt, zoom);
  // Fallback when there is no shell to portal into: inside the page, above the
  // paragraph, or below it when there is no room above.
  const { top: pillTop, left: pillLeft } = placeEditPill(
    domRect,
    { width: PILL_WIDTH_PX, height: PILL_HEIGHT_PX },
    PILL_OFFSET_PX,
    null,
  );

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

  const pill = (
    <div
      ref={pillRef}
      data-testid="text-edit-floating-pill"
      style={{
        position: 'absolute',
        top: shellPos ? shellPos.top : pillTop,
        left: shellPos ? shellPos.left : pillLeft,
        height: PILL_HEIGHT_PX,
        width: PILL_WIDTH_PX,
        // Above the inline editor (z 60) and its help text (z 61): the pill's
        // buttons must stay clickable wherever the two end up.
        zIndex: 62,
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
          aria-label={t('common.cancel', { defaultValue: 'Cancel' })}
          data-testid="text-edit-cancel-btn"
          title={t('common.cancel', { defaultValue: 'Cancel' })}
          className="p-1.5 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200 cursor-pointer flex items-center justify-center hover:scale-105 active:scale-95"
        >
          <XIcon className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { e.stopPropagation(); onCommit(); }}
          aria-label={t('common.save', { defaultValue: 'Save' })}
          data-testid="text-edit-save-btn"
          title={t('common.save', { defaultValue: 'Save' })}
          className="p-1.5 rounded-full text-primary hover:text-primary-foreground hover:bg-primary transition-all duration-200 cursor-pointer flex items-center justify-center hover:scale-105 active:scale-95"
        >
          <CheckIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );

  return (
    <>
      <span ref={anchorRef} aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0 }} />
      {shell ? createPortal(pill, shell) : pill}
    </>
  );
});
