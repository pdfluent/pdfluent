// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Error Recovery Strategies
//
// Maps common runtime error strings to structured recovery actions.
// Callers use these to decide how to surface failures to the user and
// whether an automatic retry is safe.
//
// A failed open is not here: it is answered with a code by the backend and
// explained by viewer/state/openError.ts. The string-matching version that
// lived here carried hard-coded Dutch and was imported by nothing.
// ---------------------------------------------------------------------------

import i18n from '../../i18n';

export type RecoveryStrategy = 'retry' | 'fallback' | 'reset' | 'ignore';

export interface RecoveryAction {
  /** How the caller should respond to the failure. */
  strategy: RecoveryStrategy;
  /** What to tell the user, in their language (always from i18n). */
  description: string;
  /** True when the recovery can be attempted without user interaction. */
  canAutoRecover: boolean;
}

/**
 * Return true when the error string indicates a transient, retryable condition.
 */
export function isRetryableError(error: string): boolean {
  const lower = error.toLowerCase();
  return lower.includes('timeout') || lower.includes('network') || lower.includes('connection');
}

/**
 * Recovery strategy for annotation load failures.
 * Always falls back to an empty annotation list (non-destructive).
 */
export function getAnnotationLoadRecovery(_error: string): RecoveryAction {
  return {
    strategy: 'fallback',
    description: i18n.t('events.annotationLoadFailed'),
    canAutoRecover: true,
  };
}

/**
 * Recovery strategy for Tauri invoke failures.
 */
export function getTauriInvokeRecovery(command: string, error: string): RecoveryAction {
  if (isRetryableError(error)) {
    return {
      strategy: 'retry',
      description: i18n.t('errors.commandRetrying', { command }),
      canAutoRecover: true,
    };
  }
  return {
    strategy: 'reset',
    description: i18n.t('errors.commandFailed', { command }),
    canAutoRecover: false,
  };
}

/**
 * Recovery strategy for AI API request failures.
 * Always ignored (AI is an optional enhancement, not a core requirement).
 */
export function getAiRequestRecovery(_error: string): RecoveryAction {
  return {
    strategy: 'ignore',
    description: i18n.t('errors.aiFailed'),
    canAutoRecover: false,
  };
}
