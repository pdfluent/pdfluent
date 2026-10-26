// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { FormScriptsStatus } from '../../lib/tauri-api';
import { scriptCounts } from '../state/scriptConsent';

/**
 * The bar under the toolbar that asks before a form's scripts run. The form
 * is open and fillable behind it; nothing is calculated until the user answers.
 */
interface ScriptConsentBarProps {
  status: Pick<FormScriptsStatus, 'total' | 'javascript' | 'acroform' | 'formcalc'>;
  busy: boolean;
  /** An enterprise policy pins the choice to "ask": no way to say "always". */
  alwaysAvailable: boolean;
  onRunOnce: () => void;
  onRunAlways: () => void;
  onDontRun: () => void;
}

export const ScriptConsentBar = memo(function ScriptConsentBar({
  status,
  busy,
  alwaysAvailable,
  onRunOnce,
  onRunAlways,
  onDontRun,
}: ScriptConsentBarProps) {
  const { t } = useTranslation();
  const { javascript, formcalc } = scriptCounts(status);
  const kinds = [
    javascript > 0 ? `JavaScript ${javascript}` : null,
    formcalc > 0 ? `FormCalc ${formcalc}` : null,
  ].filter((k): k is string => k !== null);

  return (
    <div className="v3-script-bar" data-testid="script-consent-bar" role="region" aria-label={t('formScripts.barLabel')}>
      <div className="script-bar-text">
        <strong>{t('formScripts.barMessage')}</strong>
        <span className="script-bar-sub" data-testid="script-consent-detail">
          {t('formScripts.barDetail', { count: status.total })}
          {kinds.length > 0 ? ` ${kinds.join(', ')}` : ''}
        </span>
      </div>
      <div className="script-bar-actions">
        <button
          type="button"
          className="script-bar-primary"
          data-testid="script-consent-run-once"
          onClick={onRunOnce}
          disabled={busy}
        >
          {t('formScripts.runOnce')}
        </button>
        {alwaysAvailable && (
          <button
            type="button"
            className="script-bar-secondary"
            data-testid="script-consent-run-always"
            onClick={onRunAlways}
            disabled={busy}
          >
            {t('formScripts.runAlways')}
          </button>
        )}
        <button
          type="button"
          className="script-bar-secondary"
          data-testid="script-consent-dont-run"
          onClick={onDontRun}
          disabled={busy}
        >
          {t('formScripts.dontRun')}
        </button>
      </div>
    </div>
  );
});
