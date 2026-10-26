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
import { describeError, reportCommandFailure, reportFallback } from '../../lib/commandBridge';
import type { AppError } from './errorCenter';
import type { XfaScriptErrorDto } from '../../lib/tauri-api';

/**
 * OCR cannot start: the Tesseract component cannot be installed in this
 * build, on this platform, or is not published yet (viewer/hooks/useOcr.ts).
 *
 * An error and not a warning: the user asked for text recognition and is
 * getting none, and `remediation` names why.
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

/**
 * The form carries scripts the sandboxed runtime does not run: FormCalc, and
 * any script with no declared language (XFA reads that as FormCalc).
 *
 * The value the person typed lands and persists. What a FormCalc script would
 * have done with it -- a total, a field that appears -- does not happen here,
 * and Adobe Reader will recompute it on open. Saying so beats a stale total
 * that looks like a result. A warning: the document changed as asked.
 */
export function announceXfaScriptsNotRun(count: number): AppError {
  return reportFallback({
    source: 'xfa',
    title: i18n.t('fallbacks.xfaScriptsNotRunTitle'),
    message: i18n.t('fallbacks.xfaScriptsNotRunMessage', { count }),
    code: 'XFA_SCRIPTS_NOT_RUN',
  });
}

/** The field a script id belongs to: `<field>:<activity>#<n>` -> `<field>`. */
function scriptField(scriptId: string): string {
  return scriptId.split(':')[0] || scriptId;
}

const MAX_NAMED_SCRIPTS = 5;

/**
 * Scripts of the form ran and failed: one threw, ran out of time, or was
 * refused by the sandbox. The typed value is saved; what the script would have
 * set may be missing. Names each field with what happened to its script, once
 * per document (the caller holds the once). A warning, not an error.
 */
export function announceXfaScriptsFailed(errors: XfaScriptErrorDto[]): AppError {
  const seen = new Set<string>();
  const named: string[] = [];
  for (const error of errors) {
    const entry = `${scriptField(error.scriptId)} (${i18n.t(`fallbacks.xfaScriptKind_${error.kind}`)})`;
    if (seen.has(entry)) continue;
    seen.add(entry);
    named.push(entry);
  }
  const shown = named.slice(0, MAX_NAMED_SCRIPTS).join(', ');
  const details = named.length > MAX_NAMED_SCRIPTS ? `${shown}, …` : shown;
  return reportFallback({
    source: 'xfa',
    title: i18n.t('fallbacks.xfaScriptsFailedTitle'),
    message: i18n.t('fallbacks.xfaScriptsFailedMessage', { details }),
    code: 'XFA_SCRIPTS_FAILED',
  });
}

/** A write the engine refused, as the backend codes it (`XFA_FIELD_*`). */
export interface XfaRefusal {
  code: 'XFA_FIELD_READ_ONLY' | 'XFA_FIELD_REJECTED' | 'XFA_FIELD_NOT_FOUND';
  field: string;
  /** The engine's reason, for a rejected value only. */
  reason: string;
}

/** Read a coded refusal out of whatever a rejected `commit_xfa_field_value` carries. */
export function parseXfaRefusal(error: unknown): XfaRefusal | null {
  const match = /^(XFA_FIELD_(?:READ_ONLY|REJECTED|NOT_FOUND)):\s*([^:]*)(?::\s*([\s\S]*))?$/.exec(
    describeError(error),
  );
  if (!match) return null;
  return {
    code: match[1] as XfaRefusal['code'],
    field: (match[2] ?? '').trim(),
    reason: (match[3] ?? '').trim(),
  };
}

const REFUSAL_KEYS: Record<XfaRefusal['code'], string> = {
  XFA_FIELD_READ_ONLY: 'fallbacks.xfaFieldReadOnly',
  XFA_FIELD_REJECTED: 'fallbacks.xfaFieldRejected',
  XFA_FIELD_NOT_FOUND: 'fallbacks.xfaFieldNotFound',
};

/**
 * A value the form would not take. An error, because the document does not
 * carry what the person typed; the message names the field and why.
 * Anything that is not a coded refusal goes the ordinary command-failure way.
 */
export function reportXfaCommitFailure(error: unknown): AppError {
  const refusal = parseXfaRefusal(error);
  if (!refusal) return reportCommandFailure('commit_xfa_field_value', error);
  return reportFallback({
    source: 'xfa',
    title: i18n.t('fallbacks.xfaFieldRefusedTitle'),
    message: i18n.t(REFUSAL_KEYS[refusal.code], { field: refusal.field, reason: refusal.reason }),
    code: refusal.code,
    severity: 'error',
  });
}

/**
 * The edit landed and took the document's Reader enablement with it.
 *
 * A `/Perms /UR3` signature grants features to whoever opens the file — filling
 * in and saving a form, commenting — rather than attesting to its content, so
 * the writer edits over it on purpose; refusing would make every Reader-enabled
 * form read-only. What it cannot do is keep it: the edit moves bytes the
 * signature's `/ByteRange` covers. Acrobat warns and proceeds, and so do we.
 *
 * A warning, not an error: the change the user asked for is in the document.
 * Once per document, because the rights are only there to lose once.
 */
export function announceUsageRightsInvalidated(): AppError {
  return reportFallback({
    source: 'replace_text_span',
    title: i18n.t('fallbacks.usageRightsInvalidatedTitle'),
    message: i18n.t('fallbacks.usageRightsInvalidatedMessage'),
    code: 'USAGE_RIGHTS_INVALIDATED',
    taxonomy: 'validation_failure.signature_invalid',
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
