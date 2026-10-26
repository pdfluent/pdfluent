// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// useFormScriptConsent: the permission is asked for once per opened document,
// and the call that gives it is made only after an answer (or a stored choice).
// Calls the real hook in node.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactForHooks } from './hookHarness';

vi.mock('react', async (orig) => reactForHooks(await orig()));

const invoke = vi.fn();
vi.mock('../../../lib/commandBridge', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  invokeCommand: (cmd: string, args?: unknown) => invoke(cmd, args),
  reportCommandFailure: vi.fn(),
}));
vi.mock('../../../lib/tauri-detection', () => ({ isTauriRuntime: () => true }));

import { useFormScriptConsent } from '../useFormScriptConsent';
import { forgetScriptChoices, rememberScriptChoice, setOsFormScriptsPolicyForTest } from '../../state/scriptConsent';

const status = (over: Record<string, unknown> = {}) => ({
  javascript: 0, formcalc: 0, acroform: 3, total: 3, allowed: false, contentHash: 'hash-a', ...over,
});

const store = new Map<string, string>();
beforeEach(() => {
  setOsFormScriptsPolicyForTest(null);
  store.clear();
  forgetScriptChoices();
  invoke.mockReset();
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
});

function answer(scripts = status()) {
  invoke.mockImplementation(async (cmd: string, args?: { allowed?: boolean }) => {
    if (cmd === 'get_form_scripts_policy') return null;
    if (cmd === 'get_form_scripts') return scripts;
    if (cmd === 'set_form_scripts_allowed') {
      return { status: { ...scripts, allowed: args?.allowed === true }, report: { ran: true, fieldsChanged: 1 } };
    }
    throw new Error(`unexpected command ${cmd}`);
  });
}

const flush = () => new Promise(r => setTimeout(r, 0));
const allowCalls = () => invoke.mock.calls.filter(([cmd]) => cmd === 'set_form_scripts_allowed');

function mount(mode: 'ask' | 'always' | 'never', id: string | null = 'doc-1') {
  const onRan = vi.fn();
  const onSetting = vi.fn();
  // The hook harness (hookHarness.ts) runs hooks outside React; a helper that mounts one per case is the point.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const h = useFormScriptConsent(id, { formScriptsMode: mode }, onSetting, onRan);
  return { h, onRan, onSetting };
}

describe('useFormScriptConsent', () => {
  it('on Ask, a document with scripts runs nothing until the user answers', async () => {
    answer();
    mount('ask');
    await flush();
    expect(invoke).toHaveBeenCalledWith('get_form_scripts', undefined);
    expect(allowCalls()).toHaveLength(0);
  });

  it('on Always, permission is given on open and the views are told', async () => {
    answer();
    const { onRan } = mount('always');
    await flush();
    expect(allowCalls()).toHaveLength(1);
    expect(allowCalls()[0][1]).toEqual({ allowed: true });
    expect(onRan).toHaveBeenCalledWith(1);
  });

  it('on Never, permission is never given and nobody is asked', async () => {
    answer();
    const { onRan } = mount('never');
    await flush();
    expect(allowCalls()).toHaveLength(0);
    expect(onRan).not.toHaveBeenCalled();
  });

  it('a document without scripts is left alone in every mode', async () => {
    answer(status({ total: 0, acroform: 0 }));
    for (const mode of ['ask', 'always', 'never'] as const) mount(mode);
    await flush();
    expect(allowCalls()).toHaveLength(0);
  });

  it('a file the user already allowed this session runs again without asking', async () => {
    answer();
    rememberScriptChoice('hash-a', 'run');
    mount('ask');
    await flush();
    expect(allowCalls()).toHaveLength(1);
  });

  it('a file the user declined this session stays blocked', async () => {
    answer();
    rememberScriptChoice('hash-a', 'skip');
    mount('ask');
    await flush();
    expect(allowCalls()).toHaveLength(0);
  });

  it('a document that is already allowed is not allowed twice', async () => {
    answer(status({ allowed: true }));
    mount('always');
    await flush();
    expect(allowCalls()).toHaveLength(0);
  });

  it('nothing is read when no document is open', async () => {
    answer();
    mount('always', null);
    await flush();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('an enterprise pin to Never beats the user setting Always', async () => {
    store.set('pdfluent:enterprise-settings', JSON.stringify({ policies: { formScripts: 'never' } }));
    answer();
    mount('always');
    await flush();
    expect(allowCalls()).toHaveLength(0);
  });

  it('a pin to Ask withholds "Always run scripts"', () => {
    store.set('pdfluent:enterprise-settings', JSON.stringify({ policies: { formScripts: 'ask' } }));
    answer();
    expect(mount('always').h.alwaysAvailable).toBe(false);
    store.clear();
    expect(mount('ask').h.alwaysAvailable).toBe(true);
  });

  it('an OS-managed policy of Never beats the user setting Always and a localStorage pin', async () => {
    setOsFormScriptsPolicyForTest('never');
    store.set('pdfluent:enterprise-settings', JSON.stringify({ policies: { formScripts: 'always' } }));
    answer();
    mount('always');
    await flush();
    expect(allowCalls()).toHaveLength(0);
  });

  it('an OS-managed policy of Always runs the scripts and offers no choice', async () => {
    setOsFormScriptsPolicyForTest('always');
    answer();
    const { h } = mount('never');
    await flush();
    expect(allowCalls()).toHaveLength(1);
    expect(h.alwaysAvailable).toBe(false);
  });
});
