// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// The three places the editor does less than its buttons promise.
//
// Each one used to be a `return` with a console line: OCR without the Python
// bridge, an XFA write without the Phase 2 commit loop, a command the build
// does not carry. From the user's side all three look identical to success --
// the spinner stops and the document appears unchanged, which for a form that
// should have recalculated a total is worse than an error.
//
// They live here rather than inline in the hooks so there is one list of what
// the app degrades to, and so a test can hold each one to publishing something.
// ---------------------------------------------------------------------------

import i18n from '../../i18n';
import { reportFallback } from '../../lib/commandBridge';
import type { AppError } from './errorCenter';

/**
 * OCR cannot start: no Python, no `paddleocr`, no bridge script.
 *
 * An error and not a warning: the user asked for text recognition and is
 * getting none, and `remediation` from `get_ocr_status` names what is missing.
 */
export function announceOcrUnavailable(remediation: string): AppError {
  return reportFallback({
    source: 'ocr',
    title: i18n.t('fallbacks.ocrUnavailableTitle'),
    message: i18n.t('fallbacks.ocrUnavailableMessage', { reason: remediation }),
    code: 'OCR_RUNTIME_UNAVAILABLE',
    taxonomy: 'environment_failure.ocr_model_missing',
    severity: 'error',
  });
}

/**
 * An XFA value was written statically because the `xfa-interactive` commit
 * loop is not compiled into this build.
 *
 * The value lands and persists; what does not happen is the change/click and
 * calculate scripts, so a total stays stale and a subform that should appear
 * on this answer does not. A warning: the document did change.
 */
export function announceXfaStaticWrite(): AppError {
  return reportFallback({
    source: 'xfa',
    title: i18n.t('fallbacks.xfaStaticTitle'),
    message: i18n.t('fallbacks.xfaStaticMessage'),
    code: 'XFA_PHASE1_STATIC_WRITE',
  });
}

/** A capability this build was compiled without, named rather than implied. */
export function announceFeatureUnavailable(feature: string, detail: string): AppError {
  return reportFallback({
    source: feature,
    title: i18n.t('fallbacks.featureUnavailableTitle', { feature }),
    message: detail,
    code: 'FEATURE_NOT_IN_BUILD',
  });
}
