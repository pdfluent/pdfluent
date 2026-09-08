// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * A refused text edit says why, in a place the user can still read a moment later.
 *
 * `replace_text_span` has always returned a reason -- nine typed codes plus a
 * thrown message -- and the shell turned all of it into "not replaced". The
 * message function is tested behaviourally here; the banner that renders it is
 * checked by name, because the vitest environment is node and this shell has no
 * render tests.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { getBackendRejectionMessage } from '../src/viewer/text/textMutationMessaging';

const BACKEND_CODES = [
  'replacement-too-long',
  'text-not-found-in-content-stream',
  'no-content-stream',
  'empty-original-text',
  'page-not-found',
  'encoding-not-supported',
  'font-encoding-unsafe',
  'glyph-risk-detected',
  'internal-error',
];

describe('every reason the writer can give', () => {
  it.each(BACKEND_CODES)('%s reads as a sentence, not a code', (code) => {
    const message = getBackendRejectionMessage(code);
    expect(message.tooltip.length).toBeGreaterThan(3);
    expect(message.explanation.length).toBeGreaterThan(30);
    // A missing translation makes i18next echo the key back.
    expect(message.tooltip).not.toContain('textMutation.rejection');
    expect(message.explanation).not.toContain('textMutation.rejection');
  });

  it('is translated, not left as Dutch source strings', () => {
    const en = JSON.parse(readFileSync(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8'));
    for (const code of BACKEND_CODES) {
      expect(en.textMutation.rejection[`${code}.tooltip`], code).toBeTruthy();
      expect(en.textMutation.rejection[`${code}.explanation`], code).toBeTruthy();
    }
  });
});

describe('the rejection reaches the screen', () => {
  const viewerApp = readFileSync(new URL('../src/viewer/ViewerApp.tsx', import.meta.url), 'utf8');
  const hook = readFileSync(new URL('../src/viewer/hooks/useTextInteraction.ts', import.meta.url), 'utf8');

  it('the hook hands the rejection out and offers a way to dismiss it', () => {
    expect(hook).toContain('textMutationRejection,');
    expect(hook).toContain('dismissTextMutationRejection,');
  });

  it('the hook clears it on the next edit and on a successful one', () => {
    const editEntry = hook.slice(hook.indexOf('const handleEditEntry'));
    expect(editEntry.slice(0, 200)).toContain('setTextMutationRejection(null)');
    const success = hook.slice(hook.indexOf('if (mutationSuccess) {'));
    expect(success.slice(0, 200)).toContain('setTextMutationRejection(null)');
  });

  it('the shell renders it with the engine code beside the explanation', () => {
    expect(viewerApp).toContain('data-testid="text-edit-rejection"');
    expect(viewerApp).toContain('data-testid="text-edit-rejection-code"');
    expect(viewerApp).toContain('data-testid="text-edit-rejection-dismiss"');
    expect(viewerApp).toContain('textMutationRejection.explanation');
  });
});
