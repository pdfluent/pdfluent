// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Form scripts run only with the user's permission: when the webview asks,
// what it remembers, and what a policy pins.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  decideConsent,
  effectiveFormScriptsMode,
  forgetScriptChoices,
  pinnedFormScriptsMode,
  recallScriptChoice,
  rememberScriptChoice,
  scriptCounts,
} from '../scriptConsent';
import {
  DEFAULT_APP_SETTINGS,
  SETTINGS_STORAGE_KEY,
  loadAppSettings,
  saveAppSettings,
  updateAppSetting,
} from '../appSettings';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  forgetScriptChoices();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: () => null,
    length: 0,
  } as Storage;
});

const ENTERPRISE_KEY = 'pdfluent:enterprise-settings';
const withScripts = (hash = 'h1') => ({ total: 3, contentHash: hash });

describe('the default is to ask', () => {
  it('a fresh install asks', () => {
    expect(DEFAULT_APP_SETTINGS.formScriptsMode).toBe('ask');
    expect(loadAppSettings().formScriptsMode).toBe('ask');
  });

  it('a settings blob from before this setting existed still asks', () => {
    store.set(SETTINGS_STORAGE_KEY, JSON.stringify({ autosaveEnabled: false }));
    expect(loadAppSettings().formScriptsMode).toBe('ask');
  });

  it('a damaged value falls back to ask and never to always', () => {
    store.set(SETTINGS_STORAGE_KEY, JSON.stringify({ formScriptsMode: 'yes please' }));
    expect(loadAppSettings().formScriptsMode).toBe('ask');
  });

  it('a document without scripts raises nothing, whatever the mode', () => {
    for (const mode of ['ask', 'always', 'never'] as const) {
      expect(decideConsent({ total: 0, contentHash: 'h' }, mode)).toBe('none');
    }
  });

  it('a document with scripts asks first', () => {
    expect(decideConsent(withScripts(), 'ask')).toBe('ask');
  });
});

describe('the stored choice', () => {
  it('Always is stored and read back', () => {
    updateAppSetting('formScriptsMode', 'always');
    expect(JSON.parse(store.get(SETTINGS_STORAGE_KEY) ?? '{}').formScriptsMode).toBe('always');
    expect(loadAppSettings().formScriptsMode).toBe('always');
    expect(decideConsent(withScripts(), loadAppSettings().formScriptsMode)).toBe('run');
  });

  it('Never blocks without asking', () => {
    saveAppSettings({ ...DEFAULT_APP_SETTINGS, formScriptsMode: 'never' });
    expect(decideConsent(withScripts(), loadAppSettings().formScriptsMode)).toBe('blocked');
  });
});

describe('the choice for one file', () => {
  it('is remembered by the file hash while the app runs', () => {
    rememberScriptChoice('h1', 'run');
    expect(decideConsent(withScripts('h1'), 'ask')).toBe('run');
    expect(decideConsent(withScripts('h2'), 'ask')).toBe('ask');
  });

  it('"Don\'t run" is remembered too, so the bar does not come back', () => {
    rememberScriptChoice('h1', 'skip');
    expect(decideConsent(withScripts('h1'), 'ask')).toBe('blocked');
  });

  it('is never written to disk', () => {
    rememberScriptChoice('h1', 'run');
    expect([...store.values()].join('')).not.toContain('h1');
    forgetScriptChoices();
    expect(recallScriptChoice('h1')).toBeUndefined();
  });

  it('does not override Never or Always', () => {
    rememberScriptChoice('h1', 'run');
    expect(decideConsent(withScripts('h1'), 'never')).toBe('blocked');
    rememberScriptChoice('h2', 'skip');
    expect(decideConsent(withScripts('h2'), 'always')).toBe('run');
  });
});

describe('an enterprise policy that pins the choice', () => {
  it('has no pin by default', () => {
    expect(pinnedFormScriptsMode()).toBeNull();
  });

  it('wins over the user setting', () => {
    expect(effectiveFormScriptsMode('always', 'never')).toBe('never');
    expect(effectiveFormScriptsMode('never', 'ask')).toBe('ask');
    expect(effectiveFormScriptsMode('ask', null)).toBe('ask');
  });

  it('reads the pin from the stored enterprise settings', () => {
    for (const pin of ['ask', 'always', 'never'] as const) {
      store.set(ENTERPRISE_KEY, JSON.stringify({ policies: { formScripts: pin } }));
      expect(pinnedFormScriptsMode()).toBe(pin);
    }
  });

  it('ignores a value that is not one of the three', () => {
    store.set(ENTERPRISE_KEY, JSON.stringify({ policies: { formScripts: 'sometimes' } }));
    expect(pinnedFormScriptsMode()).toBeNull();
    store.set(ENTERPRISE_KEY, '{not json');
    expect(pinnedFormScriptsMode()).toBeNull();
  });
});

describe('counts', () => {
  it('AcroForm actions are JavaScript for the user', () => {
    expect(scriptCounts({ javascript: 1, acroform: 2, formcalc: 4 })).toEqual({ javascript: 3, formcalc: 4 });
  });
});
