// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { FormCalcState } from '../state/formCalcState';

/**
 * Calm, form-focused bar shown when a document has fillable AcroForm fields.
 * Replaces the old open-time warning banner: it invites filling rather than
 * alarming. No security-theater wording — capability decisions (links etc.)
 * happen at the moment of use, not on open.
 */

interface FormBarProps {
  /** Number of fillable fields (logical fields). */
  fieldCount: number;
  /** Whether the Acrobat-style field highlight is on. */
  highlight: boolean;
  onToggleHighlight: () => void;
  /** Jump to and focus the first field in tab order. */
  onJumpToFirst: () => void;
  /**
   * When the user chose "always open links", this toggle stays visible so the
   * auto-open is transparent and reversible. Null = no auto-open preference.
   */
  autoOpenLinks: boolean | null;
  onToggleAutoOpenLinks: () => void;
  /** What the calculations in this form are doing; the bar says no more than that. */
  calc: FormCalcState;
}

export const FormBar = memo(function FormBar({
  fieldCount,
  highlight,
  onToggleHighlight,
  onJumpToFirst,
  autoOpenLinks,
  onToggleAutoOpenLinks,
  calc,
}: FormBarProps) {
  const { t } = useTranslation();
  return (
    <div className="v3-form-bar" data-testid="form-bar">
      <span className="form-bar-icon" aria-hidden="true">🖊️</span>
      <div className="form-bar-text">
        <strong>{t('formBar.title')}</strong>
        <span className="form-bar-sub">
          {t('formBar.fields', { count: fieldCount })} · {t('formBar.clickToFill')}
        </span>
        {calc.kind !== 'none' && (
          <span
            className={calc.kind === 'failed' ? 'form-bar-sub form-bar-calc is-failed' : 'form-bar-sub form-bar-calc'}
            data-testid="form-bar-calc"
            data-calc-state={calc.kind}
            role={calc.kind === 'failed' ? 'alert' : undefined}
          >
            {calc.kind === 'blocked' && t('formBar.noCalculations')}
            {calc.kind === 'unsupported' && t('formBar.calcUnsupported')}
            {calc.kind === 'running' && t('formBar.calcRunning')}
            {calc.kind === 'failed' && t('formBar.calcFailed', { count: calc.failedCount })}
          </span>
        )}
      </div>
      <div className="form-bar-actions">
        {autoOpenLinks && (
          <button
            type="button"
            className="form-bar-toggle is-on"
            data-testid="form-bar-autolinks-toggle"
            onClick={onToggleAutoOpenLinks}
            title={t('formBar.autoLinksTitle')}
          >
            {t('formBar.autoLinks')} ●
          </button>
        )}
        <button
          type="button"
          className={highlight ? 'form-bar-toggle is-on' : 'form-bar-toggle'}
          data-testid="form-bar-highlight-toggle"
          aria-pressed={highlight}
          onClick={onToggleHighlight}
        >
          {t('formBar.highlight')}
        </button>
        <button
          type="button"
          className="form-bar-action"
          data-testid="form-bar-jump-first"
          onClick={onJumpToFirst}
          disabled={fieldCount === 0}
        >
          {t('formBar.firstField')}
        </button>
      </div>
    </div>
  );
});
