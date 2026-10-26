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
  announceXfaScriptsNotRun,
  announceXfaScriptsFailed,
  announceFeatureUnavailable,
  parseXfaRefusal,
  reportXfaCommitFailure,
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

describe('announceXfaScriptsNotRun', () => {
  it('says how many scripts did not run and that the value is kept', () => {
    const seen = published(() => announceXfaScriptsNotRun(3));
    expect(seen).toHaveLength(1);
    expect(seen[0]!.code).toBe('XFA_SCRIPTS_NOT_RUN');
    expect(seen[0]!.severity).toBe('warning');
    expect(seen[0]!.message).toContain('3');
    expect(seen[0]!.message).toContain('FormCalc');
  });
});

describe('announceXfaScriptsFailed', () => {
  it('names each field with what happened to its script', () => {
    const seen = published(() => announceXfaScriptsFailed([
      { scriptId: 'quantity:change#1', kind: 'threw' },
      { scriptId: 'total:calculate#0', kind: 'timeout' },
      { scriptId: 'note:change#0', kind: 'refused' },
    ]));
    expect(seen).toHaveLength(1);
    expect(seen[0]!.code).toBe('XFA_SCRIPTS_FAILED');
    expect(seen[0]!.severity).toBe('warning');
    const text = seen[0]!.message;
    expect(text).toContain('quantity (hit an error)');
    expect(text).toContain('total (ran out of time)');
    expect(text).toContain('note (was refused by the sandbox)');
  });

  it('lists a field once per kind and stops after five', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ scriptId: `f${i}:change#0`, kind: 'threw' as const }));
    const twice = published(() => announceXfaScriptsFailed([
      { scriptId: 'a:change#0', kind: 'threw' },
      { scriptId: 'a:change#1', kind: 'threw' },
    ]));
    expect(twice[0]!.message.match(/a \(hit an error\)/g)).toHaveLength(1);
    const cut = published(() => announceXfaScriptsFailed(many));
    expect(cut[0]!.message).toContain('f4 (hit an error)');
    expect(cut[0]!.message).not.toContain('f5');
    expect(cut[0]!.message).toContain('…');
  });
});

describe('XFA refusals', () => {
  it('reads the three codes the backend sends, and nothing else', () => {
    expect(parseXfaRefusal('XFA_FIELD_READ_ONLY: order.lines.internal_ref')).toEqual({
      code: 'XFA_FIELD_READ_ONLY',
      field: 'order.lines.internal_ref',
      reason: '',
    });
    expect(parseXfaRefusal(new Error('XFA_FIELD_REJECTED: a.b: Checkbox fields are not fillable'))).toEqual({
      code: 'XFA_FIELD_REJECTED',
      field: 'a.b',
      reason: 'Checkbox fields are not fillable',
    });
    expect(parseXfaRefusal('XFA_FIELD_NOT_FOUND: gone')?.code).toBe('XFA_FIELD_NOT_FOUND');
    expect(parseXfaRefusal('Could not commit XFA field x')).toBeNull();
    expect(parseXfaRefusal('XFA_FIELD_UNKNOWN: x')).toBeNull();
  });

  it('a read-only refusal names the field and is an error', () => {
    const seen = published(() => reportXfaCommitFailure('XFA_FIELD_READ_ONLY: order.lines.internal_ref'));
    expect(seen).toHaveLength(1);
    expect(seen[0]!.code).toBe('XFA_FIELD_READ_ONLY');
    expect(seen[0]!.severity).toBe('error');
    expect(seen[0]!.message).toContain('order.lines.internal_ref');
    expect(seen[0]!.message).toContain('read-only');
  });

  it('a rejected value carries the engine reason', () => {
    const seen = published(() => reportXfaCommitFailure('XFA_FIELD_REJECTED: qty: not a number'));
    expect(seen[0]!.code).toBe('XFA_FIELD_REJECTED');
    expect(seen[0]!.message).toContain('not a number');
  });

  it('anything else is the ordinary command failure, not swallowed', () => {
    const seen = published(() => reportXfaCommitFailure('disk full'));
    expect(seen).toHaveLength(1);
    expect(seen[0]!.code).toBe('COMMAND_FAILED');
    expect(seen[0]!.message).toContain('disk full');
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
  it('OCR that cannot be offered announces instead of returning', () => {
    const source = readFileSync(new URL('../../hooks/useOcr.ts', import.meta.url), 'utf8');
    const tail = source.slice(source.indexOf("if (readiness.kind === 'ready')"));
    const guard = tail.slice(tail.indexOf('return;'), tail.indexOf('}, ['));
    expect(guard).toContain('announceOcrUnavailable(');
  });

  it('an XFA commit that did not run scripts announces once per document', () => {
    const source = readFileSync(new URL('../../hooks/useXfaFormModel.ts', import.meta.url), 'utf8');
    expect(source).toContain('if (!result.interactive && !staticWriteAnnouncedRef.current)');
    expect(source).toContain('announceXfaStaticWrite()');
    // Reset per document, or a second form opened in the same session says nothing.
    expect(source).toContain('staticWriteAnnouncedRef.current = false;');
  });

  it('the toast tells a warning apart from an error', () => {
    // The toast is a component (components/Notices.tsx) the contrast gallery also mounts.
    const notices = readFileSync(new URL('../../components/Notices.tsx', import.meta.url), 'utf8');
    const toast = notices.slice(notices.indexOf('data-testid="app-error-toast"'));
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
