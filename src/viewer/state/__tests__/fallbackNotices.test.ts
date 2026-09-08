// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * A fallback that says nothing is indistinguishable from a feature that worked.
 *
 * Each notice has to reach the error stack with a code, a severity that matches
 * what actually happened, and text a person can read. Turn any of these three
 * into a no-op -- which is what they replaced -- and this file goes red.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  announceOcrUnavailable,
  announceXfaStaticWrite,
  announceFeatureUnavailable,
} from '../fallbackNotices';
import { subscribeCommandFailures } from '../../../lib/commandBridge';
import type { AppError } from '../errorCenter';

function published(run: () => void): AppError[] {
  const seen: AppError[] = [];
  const stop = subscribeCommandFailures(e => { seen.push(e); });
  try { run(); } finally { stop(); }
  return seen;
}

describe('announceOcrUnavailable', () => {
  it('reaches the error stack with what is missing', () => {
    const seen = published(() => announceOcrUnavailable('Install paddleocr in the Python on PATH.'));
    expect(seen).toHaveLength(1);
    expect(seen[0]!.code).toBe('OCR_RUNTIME_UNAVAILABLE');
    expect(seen[0]!.source).toBe('ocr');
    expect(seen[0]!.message).toContain('paddleocr');
  });

  it('is an error, because the user asked for OCR and gets none', () => {
    expect(published(() => announceOcrUnavailable('x'))[0]!.severity).toBe('error');
  });
});

describe('announceXfaStaticWrite', () => {
  it('says the value landed but the scripts did not run', () => {
    const seen = published(() => announceXfaStaticWrite());
    expect(seen).toHaveLength(1);
    expect(seen[0]!.code).toBe('XFA_PHASE1_STATIC_WRITE');
    // A warning: the document did change, just not the way a Phase 2 commit would.
    expect(seen[0]!.severity).toBe('warning');
    expect(seen[0]!.message.toLowerCase()).toContain('script');
  });
});

describe('announceFeatureUnavailable', () => {
  it('names the feature the build does not carry', () => {
    const seen = published(() => announceFeatureUnavailable('convert_to_pdfa', 'not compiled'));
    expect(seen[0]!.title).toContain('convert_to_pdfa');
    expect(seen[0]!.code).toBe('FEATURE_NOT_IN_BUILD');
  });
});

describe('the notices are wired to the code paths that degrade', () => {
  it('OCR without the Python bridge announces instead of returning', () => {
    const source = readFileSync(new URL('../../hooks/useAnnotations.ts', import.meta.url), 'utf8');
    const guard = source.slice(source.indexOf('if (!ocrStatus.available)'));
    expect(guard.slice(0, guard.indexOf('return;'))).toContain('announceOcrUnavailable');
  });

  it('an XFA commit that did not run scripts announces once per document', () => {
    const source = readFileSync(new URL('../../hooks/useXfaFormModel.ts', import.meta.url), 'utf8');
    expect(source).toContain('if (!result.interactive && !staticWriteAnnouncedRef.current)');
    expect(source).toContain('announceXfaStaticWrite()');
    // Reset per document, or a second form opened in the same session says nothing.
    expect(source).toContain('staticWriteAnnouncedRef.current = false;');
  });

  it('the toast tells a warning apart from an error', () => {
    const viewerApp = readFileSync(new URL('../../ViewerApp.tsx', import.meta.url), 'utf8');
    const toast = viewerApp.slice(viewerApp.indexOf('data-testid="app-error-toast"'));
    expect(toast.slice(0, 1200)).toContain("error.severity === 'error'");
    expect(toast.slice(0, 1200)).toContain('data-severity={error.severity}');
  });

  it('every string these notices print exists in the English locale', () => {
    const en = JSON.parse(readFileSync(new URL('../../../i18n/locales/en.json', import.meta.url), 'utf8'));
    for (const key of ['ocrUnavailableTitle', 'ocrUnavailableMessage', 'xfaStaticTitle', 'xfaStaticMessage', 'featureUnavailableTitle']) {
      expect(en.fallbacks[key], key).toBeTruthy();
    }
    expect(en.errors.commandFailedTitle).toBeTruthy();
  });
});
