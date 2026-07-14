// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Canonical Text Mutation Engine Selector
//
// Single call-site for obtaining the active text mutation engine. PDF mutation
// is native-only in the desktop product: the implementation is Tauri IPC into
// the Rust backend.
//
// Resolution order:
//   Tauri desktop      → TauriTextMutationEngine (Tauri IPC, live G3/G5/G6)
//   Browser/dev tests  → typed-unsupported fallback; no browser mutation path.
// ---------------------------------------------------------------------------

import { isTauriEnvironment } from '../../core';
import type {
  ReplaceTextSpanRequest,
  ReplaceTextSpanResult,
  TextMutationEngineWithFormatting,
  FormatTextSpanRequest,
  FormatTextSpanResult,
  SetTextRunStyleRequest,
  SetTextRunStyleResult,
} from '../../core/engine/TextMutationEngine';
import type { AsyncEngineResult } from '../../core/engine/types';
import { getTauriTextMutationEngine } from './tauri/TauriTextMutationEngine';

// Stable reason string matched by test assertions.
const REASON_DESKTOP_REQUIRED = 'desktop-native-runtime-required';
const E_ENV_UNSUPPORTED = 'E-ENV-DESKTOP-NATIVE-REQUIRED';

class DesktopRequiredTextMutationEngine implements TextMutationEngineWithFormatting {
  async replaceTextSpan(_request: ReplaceTextSpanRequest): AsyncEngineResult<ReplaceTextSpanResult> {
    return { success: true, value: { replaced: false, reason: REASON_DESKTOP_REQUIRED } };
  }

  async formatTextSpan(_request: FormatTextSpanRequest): AsyncEngineResult<FormatTextSpanResult> {
    return { success: true, value: { formatted: false, reason: REASON_DESKTOP_REQUIRED, code: E_ENV_UNSUPPORTED } };
  }

  async setTextRunStyle(_request: SetTextRunStyleRequest): AsyncEngineResult<SetTextRunStyleResult> {
    return { success: true, value: { styled: false, reason: REASON_DESKTOP_REQUIRED, code: E_ENV_UNSUPPORTED } };
  }
}

let _desktopRequiredEngine: DesktopRequiredTextMutationEngine | null = null;

/**
 * Return the canonical TextMutationEngine for the current runtime.
 *
 * Callers must not branch on `isTauriEnvironment()` themselves — use this
 * selector so the UI layer remains runtime-agnostic.
 *
 * Browser/dev callers receive a typed unsupported result. They must not attempt
 * to mutate PDF bytes without the Tauri runtime.
 */
export function getCanonicalTextMutationEngine(): TextMutationEngineWithFormatting {
  if (isTauriEnvironment()) {
    return getTauriTextMutationEngine();
  }

  if (!_desktopRequiredEngine) {
    _desktopRequiredEngine = new DesktopRequiredTextMutationEngine();
  }
  return _desktopRequiredEngine;
}
