// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface UnsavedChangesDialogProps {
  isOpen: boolean;
  canSave: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export function UnsavedChangesDialog({ isOpen, canSave, onSave, onDiscard, onCancel }: UnsavedChangesDialogProps) {
  const { t } = useTranslation();
  // Stable ref so the Escape listener always calls the latest onCancel
  const onCancelRef = useRef(onCancel);
  useEffect(() => { onCancelRef.current = onCancel; });

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onCancelRef.current();
    }
    window.addEventListener('keydown', handleKey);
    return () => { window.removeEventListener('keydown', handleKey); };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-labelledby="unsaved-dialog-title"
        aria-modal="true"
        data-testid="unsaved-changes-dialog"
        className="fixed left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-background border border-border rounded-xl shadow-2xl z-50 overflow-hidden"
      >
        <div className="px-5 py-4">
          <h2
            id="unsaved-dialog-title"
            className="text-sm font-semibold text-foreground"
          >
            {t('unsavedChanges.title')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('unsavedChanges.message')}
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/20">
          <button
            onClick={onCancel}
            data-testid="unsaved-cancel-btn"
            className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
          >
            {t('unsavedChanges.cancel')}
          </button>
          <button
            onClick={onDiscard}
            data-testid="unsaved-discard-btn"
            className="px-3 py-1.5 text-sm font-medium text-foreground border border-border rounded-md hover:bg-muted transition-colors"
          >
            {t('unsavedChanges.discard')}
          </button>
          <button
            onClick={onSave}
            disabled={!canSave}
            data-testid="unsaved-save-btn"
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('unsavedChanges.save')}
          </button>
        </div>
      </div>
    </>
  );
}
