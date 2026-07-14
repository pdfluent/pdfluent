// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { BoldIcon, ItalicIcon, UnderlineIcon, SaveIcon, XIcon, LockIcon } from 'lucide-react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TextEditFormatBarProps {
  /** Whether the bold command is currently active (from selectionchange). */
  isBold: boolean;
  /** Whether the italic command is currently active. */
  isItalic: boolean;
  /** Whether the underline command is currently active. */
  isUnderline: boolean;
  /** Current font size in points (read-only until SDK ready). */
  fontSize: number;
  /** Called when Bold button is clicked. */
  onBold: () => void;
  onItalic: () => void;
  onUnderline: () => void;
  /** Called when the user clicks Save (commits the draft). */
  onCommit: () => void;
  /** Called when the user clicks Cancel. */
  onCancel: () => void;
  /** Whether SDK formatting writes are available. */
  canFormatText: boolean;
  /** Whether SDK font style writes are available. */
  canSetFontStyle: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function Divider() {
  return <div className="w-px h-5 bg-border mx-2 shrink-0" />;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TextEditFormatBar = memo(function TextEditFormatBar({
  isBold,
  isItalic,
  isUnderline,
  fontSize,
  onBold,
  onItalic,
  onUnderline,
  onCommit,
  onCancel,
  canFormatText,
  canSetFontStyle,
}: TextEditFormatBarProps) {
  const { t } = useTranslation();
  const notSavedTitle = t('textEdit.notSavedTitle');
  const sdkGatedTitle = t('textEdit.sdkGatedTitle');

  return (
    <div className="flex items-center gap-1" data-testid="text-edit-format-bar">
      {/* Label */}
      <span className="text-xs italic text-muted-foreground select-none mr-1">
        {t('textEdit.label')}
      </span>

      <Divider />

      {/* Bold / Italic / Underline — always clickable (cosmetic execCommand) */}
      <div className="flex items-center gap-0.5">
        <button
          data-testid="format-bold-btn"
          onClick={onBold}
          title={canSetFontStyle ? t('textEdit.bold') : notSavedTitle}
          aria-label={t('textEdit.bold')}
          aria-pressed={isBold}
          className={`p-1.5 rounded-lg transition-all duration-100 cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring ${
            isBold
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          <BoldIcon className="w-4 h-4" />
        </button>
        <button
          data-testid="format-italic-btn"
          onClick={onItalic}
          title={canSetFontStyle ? t('textEdit.italic') : notSavedTitle}
          aria-label={t('textEdit.italic')}
          aria-pressed={isItalic}
          className={`p-1.5 rounded-lg transition-all duration-100 cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring ${
            isItalic
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          <ItalicIcon className="w-4 h-4" />
        </button>
        <button
          data-testid="format-underline-btn"
          onClick={onUnderline}
          title={canSetFontStyle ? t('textEdit.underline') : notSavedTitle}
          aria-label={t('textEdit.underline')}
          aria-pressed={isUnderline}
          className={`p-1.5 rounded-lg transition-all duration-100 cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring ${
            isUnderline
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          <UnderlineIcon className="w-4 h-4" />
        </button>
        {/* Honesty marker when font style writes are not persisted */}
        {!canSetFontStyle && (
          <span
            className="flex items-center gap-0.5 text-xs text-muted-foreground/60 ml-1 select-none"
            title={notSavedTitle}
          >
            <LockIcon className="w-3 h-3" />
            <span className="hidden sm:inline">{t('textEdit.notSavedMarker')}</span>
          </span>
        )}
      </div>

      <Divider />

      {/* Font size display — read-only until SDK delivers sdkTextFormatWrites */}
      <div className="flex items-center gap-1">
        <span
          data-testid="format-font-size-display"
          data-sdk-gated={!canFormatText}
          title={canFormatText ? t('textEdit.fontSize') : sdkGatedTitle}
          className={`text-xs font-medium tabular-nums px-2 py-1 rounded select-none min-w-10 text-center ${
            canFormatText
              ? 'text-foreground bg-muted/50 cursor-default'
              : 'text-muted-foreground/50 bg-muted/30 cursor-not-allowed'
          }`}
        >
          {Math.round(fontSize)}pt
        </span>
      </div>

      <Divider />

      {/* Save and Cancel */}
      <div className="flex items-center gap-1">
        <button
          data-testid="format-save-btn"
          onClick={onCommit}
          title={t('textEdit.saveChanges')}
          aria-label={t('textEdit.saveChanges')}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-100 cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <SaveIcon className="w-3.5 h-3.5" />
          <span>{t('common.save')}</span>
        </button>
        <button
          data-testid="format-cancel-btn"
          onClick={onCancel}
          title={t('textEdit.cancelEditing')}
          aria-label={t('textEdit.cancelEditing')}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-100 cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <XIcon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{t('common.cancel')}</span>
        </button>
      </div>
    </div>
  );
});
