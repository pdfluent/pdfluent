// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// RecoveryDialog
//
// Shown on app launch when an autosave recovery file is detected.
// Lets the user restore the recovered document or discard it.
// ---------------------------------------------------------------------------

import { useTranslation } from 'react-i18next';

interface RecoveryDialogProps {
  /** Whether the dialog is visible. */
  isOpen: boolean;
  /** Full path of the autosave recovery file. */
  recoveryPath: string;
  /** Human-readable name of the original document (file name only). */
  originalFileName: string;
  /** ISO-formatted timestamp of when the autosave was written. */
  timestamp: string;
  /** Called when the user chooses to restore the recovered file. */
  onRecover: () => void;
  /** Called when the user discards the recovery file. */
  onDiscard: () => void;
  /** Called when the dialog is dismissed without a decision. */
  onClose: () => void;
}

/** Modal dialog offering document recovery after a crash or unclean shutdown. */
export function RecoveryDialog({
  isOpen,
  recoveryPath,
  originalFileName,
  timestamp,
  onRecover,
  onDiscard,
  onClose,
}: RecoveryDialogProps) {
  const { t } = useTranslation();
  if (!isOpen) return null;

  return (
    <div
      data-testid="recovery-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-background border border-border rounded-xl shadow-xl w-[420px] p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t('recover.title')}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('recover.message')}
            </p>
          </div>
          <button
            data-testid="recovery-close-btn"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors ml-4"
            aria-label={t('recover.closeAriaLabel')}
          >
            ✕
          </button>
        </div>

        {/* Document info */}
        <div className="bg-muted/40 rounded-lg p-3 mb-5 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-20 shrink-0">{t('recover.documentLabel')}</span>
            <span data-testid="recovery-document-name" className="text-xs font-medium text-foreground truncate">
              {originalFileName}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-20 shrink-0">{t('recover.savedLabel')}</span>
            <span data-testid="recovery-timestamp" className="text-xs text-foreground">
              {timestamp}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-20 shrink-0">{t('recover.recoveryPath')}</span>
            <span className="text-xs text-muted-foreground truncate" title={recoveryPath}>
              {recoveryPath}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button
            data-testid="recovery-discard-btn"
            onClick={onDiscard}
            className="text-xs px-3 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            {t('common.discard')}
          </button>
          <button
            data-testid="recovery-recover-btn"
            onClick={onRecover}
            className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
          >
            {t('recover.restore')}
          </button>
        </div>
      </div>
    </div>
  );
}
