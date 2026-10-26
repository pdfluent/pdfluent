// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { ShieldCheckIcon, XIcon } from 'lucide-react';
import i18n from '../../i18n';
import type { AppError } from '../state/errorCenter';
import type { TextMutationRejection } from '../text/textMutationMessaging';

/**
 * Document notices that sit over or above the page. They live here, not inline
 * in ViewerApp, so the contrast gallery (tests/e2e/notice-contrast.spec.ts) can
 * mount the very component the product renders in each theme. Colours come from
 * the notice tokens in src/styles/tokens.css; nothing here picks a colour.
 */

interface XfaBannerProps {
  fillExperimental: boolean;
  flattenError: string | null;
  busy: boolean;
  onConvert: () => void;
  onDismiss: () => void;
}

export function XfaBanner({ fillExperimental, flattenError, busy, onConvert, onDismiss }: XfaBannerProps) {
  return (
    <div className="v3-warning" data-testid="xfa-banner">
      <span className="badge" data-testid="xfa-experimental-badge">XFA</span>
      <div>
        <strong>{i18n.t('xfa.bannerTitle')}</strong>
        <p>{fillExperimental ? i18n.t('xfa.bannerBodyExperimental') : i18n.t('xfa.bannerBody')}</p>
        {flattenError && <p data-testid="xfa-flatten-status" className="warning-error">{flattenError}</p>}
      </div>
      <div className="warning-actions">
        <button
          type="button"
          className="warning-action"
          data-testid="xfa-flatten-btn"
          onClick={onConvert}
          disabled={busy}
        >
          {busy ? i18n.t('common.busy') : i18n.t('xfa.convertToStandard')}
        </button>
        <button type="button" className="warning-secondary" onClick={onDismiss}>
          {i18n.t('common.close')}
        </button>
      </div>
    </div>
  );
}

interface TextEditRejectionNoticeProps {
  rejection: TextMutationRejection;
  /** Extra class; the product floats it, the contrast gallery lays it out in flow. */
  className?: string;
  onDismiss: () => void;
}

/**
 * Why the last text edit did not land. Sits above the toast stack and stays
 * until the next edit: a rejection that scrolls away is the same as "not
 * replaced", which is what this replaces.
 */
export function TextEditRejectionNotice({ rejection, className = 'pf-notice-floating', onDismiss }: TextEditRejectionNoticeProps) {
  return (
    <div data-testid="text-edit-rejection" role="status" className={`pf-notice pf-notice-rejection ${className}`}>
      <div className="pf-notice-row">
        <div className="pf-notice-body">
          <p className="pf-notice-title">{i18n.t('textMutation.rejection.bannerTitle')}</p>
          <p className="pf-notice-text">{rejection.tooltip}</p>
          <p className="pf-notice-sub">{rejection.explanation}</p>
          <p className="pf-notice-code" data-testid="text-edit-rejection-code">{rejection.code}</p>
        </div>
        <button
          type="button"
          data-testid="text-edit-rejection-dismiss"
          onClick={onDismiss}
          className="pf-notice-dismiss"
          aria-label={i18n.t('textMutation.rejection.bannerDismiss')}
        >
          <XIcon aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

interface AppErrorToastProps {
  error: AppError;
  onDismiss: () => void;
}

/**
 * One entry of the error stack. A visible fallback is a warning: the action
 * did something, just less than its label promised. Painting it the same red
 * as a failed command tells the user the wrong thing about a document that did
 * change.
 */
export function AppErrorToast({ error, onDismiss }: AppErrorToastProps) {
  return (
    <div
      data-testid="app-error-toast"
      data-severity={error.severity}
      // What the test harness reads (tests/lib/fault-watch.js): which command
      // failed, without parsing a translated title.
      data-error-source={error.source}
      data-error-code={error.code}
      className={`pf-notice ${error.severity === 'error' ? 'pf-notice-error' : 'pf-notice-warn'}`}
    >
      <div className="pf-notice-row">
        <div className="pf-notice-body">
          <p className="pf-notice-title">{error.title}</p>
          <p className="pf-notice-text">{error.message}</p>
        </div>
        <button
          type="button"
          data-testid="app-error-dismiss"
          onClick={onDismiss}
          className="pf-notice-dismiss"
          aria-label={i18n.t('common.dismissNotification')}
        >
          <XIcon aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** The confirmation pill at the bottom of the shell ("Saved", "Copied"). */
export function ShellToast({ message, className = '' }: { message: string; className?: string }) {
  return (
    <div className={`toast-wrap ${className}`.trim()}>
      <div className="toast show">
        <ShieldCheckIcon className="ok" aria-hidden="true" />
        <span>{message}</span>
      </div>
    </div>
  );
}
