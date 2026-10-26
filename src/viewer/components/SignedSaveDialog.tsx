// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Shown when a signed document cannot be saved over itself: a redaction has
// to remove content the signature covers, so keeping the signature valid and
// keeping the change are not both possible. The way out is a copy without the
// signature, and the user is told that before choosing it (J-19).

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface SignedSaveDialogProps {
  isOpen: boolean;
  onSaveCopy: () => void;
  onCancel: () => void;
}

export function SignedSaveDialog({ isOpen, onSaveCopy, onCancel }: SignedSaveDialogProps) {
  const { t } = useTranslation();
  const onCancelRef = useRef(onCancel);
  useEffect(() => { onCancelRef.current = onCancel; });

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
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onCancel} aria-hidden="true" />
      <div
        role="dialog"
        aria-labelledby="signed-save-dialog-title"
        aria-modal="true"
        data-testid="signed-save-dialog"
        className="fixed left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-background border border-border rounded-xl shadow-2xl z-50 overflow-hidden"
      >
        <div className="px-5 py-4">
          <h2 id="signed-save-dialog-title" className="text-sm font-semibold text-foreground">
            {t('signedSave.title')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('signedSave.message')}</p>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/20">
          <button
            onClick={onCancel}
            data-testid="signed-save-cancel-btn"
            className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
          >
            {t('signedSave.cancel')}
          </button>
          <button
            onClick={onSaveCopy}
            data-testid="signed-save-copy-btn"
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {t('signedSave.saveCopy')}
          </button>
        </div>
      </div>
    </>
  );
}
