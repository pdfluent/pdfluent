// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import type { FormScriptsRunReport, FormScriptsStatus } from '../../lib/tauri-api';

/**
 * What the form bar may say about calculations, from what the build really did
 * (GOV-003, GOV-011). Never stronger than the facts:
 *
 *  - `none`        the form carries no scripts, so there is nothing to say
 *  - `blocked`     it has scripts and they are not allowed, so none ran
 *  - `unsupported` allowed, but this build ran none of them
 *  - `running`     allowed, ran, and nothing failed
 *  - `failed`      allowed, ran, and `failedCount` of them failed: the totals
 *                  may be wrong
 */
export type FormCalcState =
  | { kind: 'none' }
  | { kind: 'blocked' }
  | { kind: 'unsupported' }
  | { kind: 'running' }
  | { kind: 'failed'; failedCount: number };

export function formCalcState(
  status: FormScriptsStatus | null,
  lastRun: FormScriptsRunReport | null,
  /** Calculation failures seen while the person filled the form in. */
  editFailures = 0,
): FormCalcState {
  if (!status || status.total === 0) return { kind: 'none' };
  if (!status.allowed) return { kind: 'blocked' };
  const failedCount = (lastRun?.failed.length ?? 0) + editFailures;
  if (failedCount > 0) return { kind: 'failed', failedCount };
  if (lastRun && !lastRun.ran) return { kind: 'unsupported' };
  return { kind: 'running' };
}
