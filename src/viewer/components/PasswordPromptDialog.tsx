// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The password prompt for opening a protected PDF (J-18). Driven by
// viewer/state/passwordPrompt.ts: Open retries the open with what was typed,
// Cancel abandons it. The value lives in this component's state until it is
// handed over, and is cleared on every close.

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PasswordRequest } from '../state/passwordPrompt';

interface PasswordPromptDialogProps {
  request: PasswordRequest;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}

export function PasswordPromptDialog({ request, onSubmit, onCancel }: PasswordPromptDialogProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const onCancelRef = useRef(onCancel);
  useEffect(() => { onCancelRef.current = onCancel; });

  useEffect(() => {
    setValue('');
    inputRef.current?.focus();
  }, [request]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onCancelRef.current();
    }
    window.addEventListener('keydown', handleKey);
    return () => { window.removeEventListener('keydown', handleKey); };
  }, []);

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" aria-hidden="true" />
      <form
        role="dialog"
        aria-labelledby="password-prompt-title"
        aria-modal="true"
        data-testid="password-prompt-dialog"
        className="fixed left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-background border border-border rounded-xl shadow-2xl z-50 overflow-hidden"
        onSubmit={(e) => {
          e.preventDefault();
          if (value) onSubmit(value);
        }}
      >
        <div className="px-5 py-4">
          <h2 id="password-prompt-title" className="text-sm font-semibold text-foreground">
            {t('passwordPrompt.title')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('passwordPrompt.message', { name: request.fileName })}
          </p>
          {request.retry && (
            <p role="alert" data-testid="password-prompt-retry" className="mt-2 text-sm text-destructive">
              {t('passwordPrompt.incorrect')}
            </p>
          )}
          <label className="mt-3 block text-xs text-muted-foreground" htmlFor="password-prompt-input">
            {t('passwordPrompt.label')}
          </label>
          <input
            ref={inputRef}
            id="password-prompt-input"
            data-testid="password-prompt-input"
            type="password"
            autoComplete="off"
            value={value}
            onChange={(e) => { setValue(e.target.value); }}
            className="mt-1 w-full px-2 py-1.5 text-sm border border-border rounded-md bg-background"
          />
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/20">
          <button
            type="button"
            onClick={onCancel}
            data-testid="password-prompt-cancel-btn"
            className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
          >
            {t('passwordPrompt.cancel')}
          </button>
          <button
            type="submit"
            disabled={!value}
            data-testid="password-prompt-open-btn"
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
          >
            {t('passwordPrompt.open')}
          </button>
        </div>
      </form>
    </>
  );
}
