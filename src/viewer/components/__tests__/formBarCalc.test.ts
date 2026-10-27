// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// GOV-003 and GOV-011: the form bar says what the calculations really did. It
// used to say "calculations are not run" on every form, before and after the
// person allowed scripts, and a run in which every calculation failed was
// reported as a success. One working and one failing form, and each state.

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import i18n from '../../../i18n';
import { FormBar } from '../FormBar';
import { formCalcState } from '../../state/formCalcState';
import type { FormScriptsRunReport, FormScriptsStatus } from '../../../lib/tauri-api';

const status = (over: Partial<FormScriptsStatus> = {}): FormScriptsStatus => ({
  javascript: 0, formcalc: 0, acroform: 2, total: 2, allowed: false, contentHash: 'h', ...over,
});
const worked: FormScriptsRunReport = { ran: true, fieldsChanged: 1, failed: [] };
const failedRun: FormScriptsRunReport = {
  ran: true,
  fieldsChanged: 0,
  failed: [{ name: 'total', message: 'missing field' }, { name: '1.1.2', message: 'event.target is undefined' }],
};

const noop = () => {};
const bar = (calc: ReturnType<typeof formCalcState>) =>
  renderToStaticMarkup(
    createElement(FormBar, {
      fieldCount: 3, highlight: true, onToggleHighlight: noop, onJumpToFirst: noop,
      autoOpenLinks: null, onToggleAutoOpenLinks: noop, calc,
    }),
  );

beforeAll(async () => { await i18n.changeLanguage('en'); });

describe('formCalcState', () => {
  it('a form without scripts has nothing to say', () => {
    expect(formCalcState(null, null)).toEqual({ kind: 'none' });
    expect(formCalcState(status({ total: 0, acroform: 0 }), null)).toEqual({ kind: 'none' });
  });
  it('scripts that are not allowed are not run', () => {
    expect(formCalcState(status(), null)).toEqual({ kind: 'blocked' });
  });
  it('allowed and run without failures is running', () => {
    expect(formCalcState(status({ allowed: true }), worked)).toEqual({ kind: 'running' });
  });
  it('a run in which calculations failed is failed, with the count, not running', () => {
    expect(formCalcState(status({ allowed: true }), failedRun)).toEqual({ kind: 'failed', failedCount: 2 });
  });
  it('a failure while filling in counts too', () => {
    expect(formCalcState(status({ allowed: true }), worked, 1)).toEqual({ kind: 'failed', failedCount: 1 });
  });
  it('allowed, but nothing this build can run, is unsupported', () => {
    expect(formCalcState(status({ allowed: true }), { ran: false, fieldsChanged: 0, failed: [] })).toEqual({ kind: 'unsupported' });
  });
});

describe('FormBar calculation line', () => {
  it('says nothing about calculations when the form has none', () => {
    const html = bar({ kind: 'none' });
    expect(html).not.toContain('data-testid="form-bar-calc"');
    expect(html).not.toContain('not run');
  });
  it('blocked: says they are not run', () => {
    const html = bar(formCalcState(status(), null));
    expect(html).toContain('data-calc-state="blocked"');
    expect(html).toContain('Automatic calculations from Adobe forms are not run.');
  });
  it('working: says they run, and no longer says they do not', () => {
    const html = bar(formCalcState(status({ allowed: true }), worked));
    expect(html).toContain('data-calc-state="running"');
    expect(html).toContain('Calculations in this form are running.');
    expect(html).not.toContain('are not run.');
  });
  it('failing: names the number, is an alert, and does not claim success', () => {
    const html = bar(formCalcState(status({ allowed: true }), failedRun));
    expect(html).toContain('data-calc-state="failed"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('Calculations failed: 2.');
    expect(html).not.toContain('are running');
  });
  it('unsupported: says the scripts are not run', () => {
    const html = bar(formCalcState(status({ allowed: true }), { ran: false, fieldsChanged: 0, failed: [] }));
    expect(html).toContain('data-calc-state="unsupported"');
    expect(html).toContain('not supported here');
  });
});
