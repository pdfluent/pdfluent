// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GoToPageDialogProps {
  isOpen: boolean;
  pageCount: number;
  onNavigate: (pageIndex: number) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GoToPageDialog({ isOpen, pageCount, onNavigate, onClose }: GoToPageDialogProps) {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Stable ref so the Escape listener always calls the latest onClose
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  // Reset input and auto-focus when the dialog opens
  useEffect(() => {
    if (!isOpen) return;
    setInputValue('');
    requestAnimationFrame(() => { inputRef.current?.focus(); });
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onCloseRef.current();
    }
    window.addEventListener('keydown', handleKey);
    return () => { window.removeEventListener('keydown', handleKey); };
  }, [isOpen]);

  if (!isOpen) return null;

  function submit(): void {
    const parsed = parseInt(inputValue, 10);
    if (isNaN(parsed)) { onClose(); return; }
    const clamped = Math.min(pageCount, Math.max(1, parsed));
    onNavigate(clamped - 1);
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-labelledby="goto-page-title"
        data-testid="goto-page-dialog"
        className="fixed left-1/2 top-[30vh] -translate-x-1/2 w-full max-w-xs bg-background border border-border rounded-xl shadow-2xl z-50 p-4"
      >
        <h2
          id="goto-page-title"
          className="text-sm font-semibold text-foreground mb-3"
        >
          {t('goToPage.title')}
        </h2>

        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="number"
            min={1}
            max={pageCount}
            value={inputValue}
            onChange={(e) => { setInputValue(e.target.value); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
            placeholder={t('goToPage.placeholder')}
            data-testid="goto-page-input"
            className="flex-1 text-sm bg-card border border-border rounded-md px-3 py-1.5 text-foreground focus:ring-1 focus:ring-primary outline-none"
          />
          <span className="text-sm text-muted-foreground shrink-0">{t('goToPage.of', { count: pageCount })}</span>
        </div>

        <div className="flex justify-end gap-2 mt-3">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={submit}
            data-testid="goto-page-submit"
            className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
          >
            {t('goToPage.goTo')}
          </button>
        </div>
      </div>
    </>
  );
}
