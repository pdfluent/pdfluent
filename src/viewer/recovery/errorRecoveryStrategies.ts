// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Error Recovery Strategies
//
// Maps common runtime error strings to structured recovery actions.
// Callers use these to decide how to surface failures to the user and
// whether an automatic retry is safe.
// ---------------------------------------------------------------------------

import i18n from '../../i18n';

export type RecoveryStrategy = 'retry' | 'fallback' | 'reset' | 'ignore';

export interface RecoveryAction {
  /** How the caller should respond to the failure. */
  strategy: RecoveryStrategy;
  /** Human-readable description of the suggested action (Dutch). */
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
 * Recovery strategy for document load failures.
 */
export function getDocumentLoadRecovery(error: string): RecoveryAction {
  const lower = error.toLowerCase();
  if (lower.includes('not found') || lower.includes('no such file')) {
    return {
      strategy: 'fallback',
      description: i18n.t('errors.fileNotFound'),
      canAutoRecover: false,
    };
  }
  if (lower.includes('permission')) {
    return {
      strategy: 'fallback',
      description: 'Geen toegang tot bestand — controleer de rechten',
      canAutoRecover: false,
    };
  }
  if (lower.includes('encrypted')) {
    return {
      strategy: 'fallback',
      description: 'Versleuteld bestand — voer het wachtwoord in',
      canAutoRecover: false,
    };
  }
  return {
    strategy: 'reset',
    description: i18n.t('errors.loadFailedRetry'),
    canAutoRecover: false,
  };
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
      description: `Tijdelijke fout bij '${command}' — wordt opnieuw geprobeerd`,
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
