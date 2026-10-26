// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Form scripts run only with the user's permission.
//
// The native side keeps the permission on the open document and refuses every
// script call without it (src-tauri/src/script_consent.rs). This file decides
// when the webview asks, and what it remembers:
//
//   * the Settings → Security choice ("Form scripts": ask / always / never),
//     stored with the other app settings;
//   * an enterprise policy that pins that choice (EnterprisePolicies.formScripts);
//   * the answer for one file, remembered by its SHA-256 for as long as the app
//     runs and never written to disk -- "Always" is the only stored answer.
// ---------------------------------------------------------------------------

import { getFormScriptsPolicy } from '../../lib/tauri-api';
import type { FormScriptsStatus } from '../../lib/tauri-api';
import { isTauriRuntime } from '../../lib/tauri-detection';
import { loadEnterpriseSettings } from '../../lib/enterprise';
import type { FormScriptsMode } from './appSettings';

export type { FormScriptsMode };

/** The answer to the bar for one document. */
export type DocumentScriptChoice = 'run' | 'skip';

const choices = new Map<string, DocumentScriptChoice>();

export function rememberScriptChoice(contentHash: string, choice: DocumentScriptChoice): void {
  choices.set(contentHash, choice);
}

export function recallScriptChoice(contentHash: string): DocumentScriptChoice | undefined {
  return choices.get(contentHash);
}

/** For tests: the memory belongs to the running app, so a test starts empty. */
export function forgetScriptChoices(): void {
  choices.clear();
}

let osPolicy: FormScriptsMode | null = null;
let osPolicyLoad: Promise<void> | null = null;

/**
 * Read the OS-managed policy (MDM profile / HKLM) once. It is the only pin the
 * user cannot change from the app's own storage, so it beats the enterprise
 * settings below. Resolves whatever happens: no answer is no policy.
 */
export function loadOsFormScriptsPolicy(): Promise<void> {
  osPolicyLoad ??= (isTauriRuntime() ? getFormScriptsPolicy() : Promise.resolve(null))
    .then(p => { osPolicy = p === 'ask' || p === 'always' || p === 'never' ? p : null; })
    .catch(err => { console.error('[PDFluent] form scripts policy unreadable', err); });
  return osPolicyLoad;
}

/** For tests. */
export function setOsFormScriptsPolicyForTest(p: FormScriptsMode | null): void {
  osPolicy = p;
  osPolicyLoad = Promise.resolve();
}

/** The policy's pin on the choice, or null when there is none. OS policy first. */
export function pinnedFormScriptsMode(): FormScriptsMode | null {
  if (osPolicy) return osPolicy;
  // loadEnterpriseSettings falls back to its defaults (no pin) on unreadable storage.
  const pin: unknown = loadEnterpriseSettings().policies.formScripts;
  return pin === 'ask' || pin === 'always' || pin === 'never' ? pin : null;
}

/** The user's setting unless a policy pins it. */
export function effectiveFormScriptsMode(
  userMode: FormScriptsMode,
  pin: FormScriptsMode | null,
): FormScriptsMode {
  return pin ?? userMode;
}

/**
 * What to do when a document opens.
 *   none    -- it has no scripts; say nothing
 *   run     -- permission is already there (Always, or "Run for this document" earlier)
 *   blocked -- do not run and do not ask (Never, or "Don't run" earlier)
 *   ask     -- show the bar
 */
export type ConsentDecision = 'none' | 'run' | 'blocked' | 'ask';

export function decideConsent(
  status: Pick<FormScriptsStatus, 'total' | 'contentHash'>,
  mode: FormScriptsMode,
): ConsentDecision {
  if (status.total === 0) return 'none';
  if (mode === 'never') return 'blocked';
  if (mode === 'always') return 'run';
  const remembered = recallScriptChoice(status.contentHash);
  if (remembered === 'run') return 'run';
  if (remembered === 'skip') return 'blocked';
  return 'ask';
}

/** JavaScript as the user knows it: XFA scripts plus the AcroForm actions (also JavaScript). */
export function scriptCounts(status: Pick<FormScriptsStatus, 'javascript' | 'acroform' | 'formcalc'>): {
  javascript: number;
  formcalc: number;
} {
  return { javascript: status.javascript + status.acroform, formcalc: status.formcalc };
}
