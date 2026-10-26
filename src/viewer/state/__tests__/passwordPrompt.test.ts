// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-18: a protected PDF asks for its password, asks again after a wrong one,
// and Cancel abandons the open. Driven through the real open path of the Tauri
// engine with the backend mocked at the IPC boundary.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MockedFunction } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import { invoke } from '@tauri-apps/api/core';
import { TauriDocumentEngine } from '../../../platform/engine/tauri/TauriDocumentEngine';
import { openWithPasswordPrompt, OPEN_CANCELLED, setPasswordPrompter, type PasswordRequest } from '../passwordPrompt';
import { subscribeCommandFailures } from '../../../lib/commandBridge';

const mockedInvoke = invoke as MockedFunction<typeof invoke>;

const INFO = {
  page_count: 1,
  pages: [{ index: 0, width_pt: 595, height_pt: 842 }],
  title: null,
  author: null,
  form_type: 'None',
  xfa_detected: false,
  xfa_notice: null,
  access: { encrypted: true, owner: false, can_print: true, read_only: false },
};

describe('openWithPasswordPrompt', () => {
  it('asks once for a required password and opens with it', async () => {
    const prompt = vi.fn(() => Promise.resolve('open-sesame'));
    const open = vi.fn((password?: string) =>
      password === 'open-sesame' ? Promise.resolve('opened') : Promise.reject(new Error('password-required: protected')));
    await expect(openWithPasswordPrompt(open, 'a.pdf', prompt)).resolves.toBe('opened');
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(prompt).toHaveBeenCalledWith({ fileName: 'a.pdf', retry: false });
  });

  it('asks again, saying so, after a wrong password', async () => {
    const requests: PasswordRequest[] = [];
    const answers = ['wrong', 'right'];
    const prompt = (r: PasswordRequest) => { requests.push(r); return Promise.resolve(answers.shift() ?? null); };
    const open = (password?: string) => {
      if (password === undefined) return Promise.reject('password-required: protected');
      if (password === 'right') return Promise.resolve('opened');
      return Promise.reject('password-incorrect: no');
    };
    await expect(openWithPasswordPrompt(open, 'a.pdf', prompt)).resolves.toBe('opened');
    expect(requests.map(r => r.retry)).toEqual([false, true]);
  });

  it('Cancel abandons the open', async () => {
    const open = vi.fn(() => Promise.reject(new Error('password-required: protected')));
    await expect(openWithPasswordPrompt(open, 'a.pdf', () => Promise.resolve(null))).resolves.toBe(OPEN_CANCELLED);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('does not prompt for a failure that is not about the password', async () => {
    const prompt = vi.fn();
    const open = () => Promise.reject(new Error('Failed to parse PDF: broken xref'));
    await expect(openWithPasswordPrompt(open, 'a.pdf', prompt)).rejects.toThrow('broken xref');
    expect(prompt).not.toHaveBeenCalled();
  });
});

describe('TauriDocumentEngine.loadDocument with a protected PDF', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('retries open_pdf with the password the prompt returned, without an error banner', async () => {
    const shown: string[] = [];
    const stop = subscribeCommandFailures((e) => { shown.push(e.message); });
    const unregister = setPasswordPrompter(() => Promise.resolve('open-sesame'));
    mockedInvoke
      .mockRejectedValueOnce('password-required: this PDF is protected with a password.')
      .mockResolvedValueOnce(INFO);

    const result = await new TauriDocumentEngine().loadDocument('/docs/protected.pdf');

    unregister(); stop();
    expect(result.success).toBe(true);
    expect(mockedInvoke).toHaveBeenNthCalledWith(1, 'open_pdf', { path: '/docs/protected.pdf' });
    expect(mockedInvoke).toHaveBeenNthCalledWith(2, 'open_pdf', { path: '/docs/protected.pdf', password: 'open-sesame' });
    expect(shown).toEqual([]);
  });

  it('reports a cancelled prompt as cancelled, not as a failure to open', async () => {
    const unregister = setPasswordPrompter(() => Promise.resolve(null));
    mockedInvoke.mockRejectedValueOnce('password-required: this PDF is protected with a password.');
    const result = await new TauriDocumentEngine().loadDocument('/docs/protected.pdf');
    unregister();
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('cancelled');
  });

  it('warns when the document opened read-only', async () => {
    const shown: string[] = [];
    const stop = subscribeCommandFailures((e) => { shown.push(e.code ?? ''); });
    mockedInvoke.mockResolvedValueOnce({ ...INFO, access: { ...INFO.access, read_only: true } });
    const result = await new TauriDocumentEngine().loadDocument('/docs/owner-only.pdf');
    stop();
    expect(result.success).toBe(true);
    expect(shown).toContain('DOCUMENT_READ_ONLY');
  });
});
