// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-17: a file that does not open gets a message the user can act on, in
// their language, and never the engine's own text.
//
// The codes come from src-tauri/src/open_error.rs, read here from the source,
// so a code added on the Rust side without a message fails this file rather
// than reaching the screen as the generic text. The open path is driven
// through the real TauriDocumentEngine with the backend mocked at the IPC
// boundary. Runs in every vitest job (quality-gates-fast, macOS, Windows).

import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import type { MockedFunction } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import { invoke } from '@tauri-apps/api/core';
import i18n from '../../../i18n';
import en from '../../../i18n/locales/en.json';
import nl from '../../../i18n/locales/nl.json';
import {
  OPEN_ERROR_CODES,
  OPEN_ERROR_FEEDBACK_KEY,
  openErrorAction,
  openErrorKeys,
  openErrorText,
  openFailureFromRejection,
} from '../openError';
import { openWithPasswordPrompt, setPasswordPrompter } from '../passwordPrompt';
import { TauriDocumentEngine } from '../../../platform/engine/tauri/TauriDocumentEngine';
import { subscribeCommandFailures } from '../../../lib/commandBridge';
import { OpenErrorPanel } from '../../components/OpenErrorPanel';
import { FEEDBACK_EVENT, requestFeedback, type FeedbackRequest } from '../../../lib/feedback/requestFeedback';

const mockedInvoke = invoke as MockedFunction<typeof invoke>;

const RUST_SOURCE = readFileSync(new URL('../../../../src-tauri/src/open_error.rs', import.meta.url), 'utf8');
const RUST_CODES = [...RUST_SOURCE.matchAll(/#\[serde\(rename = "(open\.[a-z_]+)"\)\]/g)].map((m) => m[1]);

/**
 * What the engine and the open path say when a file does not open: every
 * message literal in open_error.rs, up to its first placeholder, plus the
 * engine's own wording. A translation that repeats one of these is the raw
 * text in disguise.
 */
const RAW_ENGINE_FRAGMENTS = [
  ...[...RUST_SOURCE.matchAll(/(?:format!\(|OpenError::new\([^,]+,\s*)"([^"{]{8,})/g)].map((m) => m[1]!.trim()),
  'Failed to parse PDF',
  'invalid PDF',
  'PDF is encrypted',
  'password-required',
  'password-incorrect',
  'PasswordProtected',
  'UnsupportedAlgorithm',
];

type Tree = { [key: string]: string | Tree };
function lookup(tree: Tree, dotted: string): string | undefined {
  let node: string | Tree | undefined = tree;
  for (const part of dotted.split('.')) {
    if (node === undefined || typeof node === 'string') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

function openErrorValues(tree: Tree): string[] {
  const out: string[] = [];
  const walk = (node: string | Tree): void => {
    if (typeof node === 'string') out.push(node);
    else Object.values(node).forEach(walk);
  };
  walk((tree as { openError: Tree }).openError);
  return out;
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('the codes', () => {
  it('are the ones the backend answers, in its order', () => {
    expect(RUST_CODES.length).toBeGreaterThanOrEqual(11);
    expect([...OPEN_ERROR_CODES]).toEqual(RUST_CODES);
  });

  it.each(OPEN_ERROR_CODES)('%s has a title, a body and an action in English and Dutch', (code) => {
    const keys = openErrorKeys(code);
    for (const locale of [en, nl] as Tree[]) {
      for (const key of [keys.title, keys.body, keys.action]) {
        expect(lookup(locale, key), `${key}`).toMatch(/\S/);
      }
    }
    expect(lookup(nl as Tree, keys.body)).not.toBe(lookup(en as Tree, keys.body));
  });

  it('every one offers feedback', () => {
    expect(lookup(en as Tree, OPEN_ERROR_FEEDBACK_KEY)).toBe('Help us improve PDFluent');
    expect(lookup(nl as Tree, OPEN_ERROR_FEEDBACK_KEY)).toMatch(/\S/);
  });

  it('the password codes retry, so the prompt comes back; a damaged file offers another file', () => {
    expect(openErrorAction('open.encrypted_needs_password')).toBe('retry');
    expect(openErrorAction('open.wrong_password')).toBe('retry');
    expect(openErrorAction('open.corrupt')).toBe('open-another');
    expect(openErrorAction('open.not_pdf')).toBe('open-another');
  });
});

describe('no raw engine text', () => {
  it('found the open path\'s own messages to compare against', () => {
    expect(RAW_ENGINE_FRAGMENTS).toContain('Failed to read file:');
    expect(RAW_ENGINE_FRAGMENTS.length).toBeGreaterThan(10);
  });

  it('no openError translation repeats what the engine says', () => {
    for (const value of [...openErrorValues(en as Tree), ...openErrorValues(nl as Tree)]) {
      for (const fragment of RAW_ENGINE_FRAGMENTS) {
        expect(value.toLowerCase(), `"${value}" repeats "${fragment}"`).not.toContain(fragment.toLowerCase());
      }
    }
  });

  it('an unknown code gets the generic message, not its own name', () => {
    const failure = openFailureFromRejection({ code: 'open.martian_format', detail: 'Failed to parse PDF: x' });
    expect(failure.code).toBe('open.unknown');
    const text = openErrorText(failure.code);
    expect(text.title).toBe(en.openError.unknown.title);
    expect(Object.values(text).join(' ')).not.toMatch(/martian|Failed to parse/);
    expect(openErrorText('open.martian_format')).toEqual(text);
  });

  it('a bare engine string is unknown, and its text stays in the detail', () => {
    const failure = openFailureFromRejection('Failed to parse PDF: invalid PDF: Invalid');
    expect(failure).toEqual({ code: 'open.unknown', detail: 'Failed to parse PDF: invalid PDF: Invalid' });
    expect(Object.values(openErrorText(failure.code)).join(' ')).not.toContain('Failed to parse PDF');
  });

  it('the panel shows the code\'s message and buttons, and not the detail', () => {
    const html = renderToStaticMarkup(
      createElement(OpenErrorPanel, { code: 'open.corrupt', onOpenAnother: () => {}, onRetry: () => {} }),
    );
    expect(html).toContain(en.openError.corrupt.title);
    expect(html).toContain(en.openError.corrupt.action);
    expect(html).toContain('data-testid="open-error-feedback"');
    expect(html).toContain('Help us improve PDFluent');
    expect(html).toContain('data-action="open-another"');
    expect(html).not.toContain('Failed to parse');
  });

  it('the panel for a wrong password retries', () => {
    const html = renderToStaticMarkup(
      createElement(OpenErrorPanel, { code: 'open.wrong_password', onOpenAnother: () => {}, onRetry: () => {} }),
    );
    expect(html).toContain('data-action="retry"');
    expect(html).toContain(en.openError.wrong_password.action);
  });

  it('the panel speaks Dutch when the app does', async () => {
    await i18n.changeLanguage('nl');
    try {
      const html = renderToStaticMarkup(
        createElement(OpenErrorPanel, { code: 'open.not_pdf', onOpenAnother: () => {}, onRetry: () => {} }),
      );
      expect(html).toContain(nl.openError.not_pdf.title);
      expect(html).not.toContain(en.openError.not_pdf.title);
    } finally {
      await i18n.changeLanguage('en');
    }
  });
});

describe('TauriDocumentEngine.loadDocument when open_pdf refuses', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('carries the code, keeps the detail out of the message, and puts no toast on screen', async () => {
    const shown: string[] = [];
    const stop = subscribeCommandFailures((e) => { shown.push(e.message); });
    mockedInvoke.mockRejectedValueOnce({ code: 'open.corrupt', detail: 'Failed to parse PDF: invalid PDF: Invalid' });

    const result = await new TauriDocumentEngine().loadDocument('/docs/broken.pdf');

    stop();
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.openFailure).toEqual({ code: 'open.corrupt', detail: 'Failed to parse PDF: invalid PDF: Invalid' });
    expect(result.error.message).toBe('open.corrupt');
    expect(shown).toEqual([]);
  });

  it('asks for the password on the structured answer, and opens with it', async () => {
    const unregister = setPasswordPrompter(() => Promise.resolve('open-sesame'));
    mockedInvoke
      .mockRejectedValueOnce({ code: 'open.encrypted_needs_password', detail: 'Failed to parse PDF: PDF is encrypted: PasswordProtected' })
      .mockResolvedValueOnce({
        page_count: 1,
        pages: [{ index: 0, width_pt: 595, height_pt: 842 }],
        title: null,
        author: null,
        form_type: 'None',
        xfa_detected: false,
        xfa_notice: null,
      });

    const result = await new TauriDocumentEngine().loadDocument('/docs/protected.pdf');

    unregister();
    expect(result.success).toBe(true);
    expect(mockedInvoke).toHaveBeenNthCalledWith(2, 'open_pdf', { path: '/docs/protected.pdf', password: 'open-sesame' });
  });

  it('asks again, saying so, after the structured wrong-password answer', async () => {
    const retries: boolean[] = [];
    const answers = ['wrong', 'right'];
    const open = (password?: string) => {
      if (password === undefined) return Promise.reject({ code: 'open.encrypted_needs_password', detail: '' });
      if (password === 'right') return Promise.resolve('opened');
      return Promise.reject({ code: 'open.wrong_password', detail: '' });
    };
    const prompt = (r: { retry: boolean }) => { retries.push(r.retry); return Promise.resolve(answers.shift() ?? null); };
    await expect(openWithPasswordPrompt(open, 'a.pdf', prompt)).resolves.toBe('opened');
    expect(retries).toEqual([false, true]);
  });
});

describe('requestFeedback', () => {
  it('asks the feedback form to open, with the action and the code', () => {
    const target = new EventTarget();
    vi.stubGlobal('window', target);
    try {
      const seen: FeedbackRequest[] = [];
      target.addEventListener(FEEDBACK_EVENT, (e) => { seen.push((e as CustomEvent<FeedbackRequest>).detail); });
      requestFeedback({ action: 'open', errorCode: 'open.corrupt' });
      expect(FEEDBACK_EVENT).toBe('pdfluent:open-feedback');
      expect(seen).toEqual([{ action: 'open', errorCode: 'open.corrupt' }]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
