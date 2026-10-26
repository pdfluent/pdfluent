// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The consent bar and the Settings → Security control: what they say and show.

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import i18n from '../../../i18n';
import en from '../../../i18n/locales/en.json';
import { ScriptConsentBar } from '../ScriptConsentBar';
import { SettingsPanel } from '../SettingsPanel';
import { DEFAULT_APP_SETTINGS } from '../../state/appSettings';

const noop = () => {};
const bar = (over: Partial<Parameters<typeof ScriptConsentBar>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(ScriptConsentBar, {
      status: { total: 5, javascript: 2, acroform: 1, formcalc: 2 },
      busy: false,
      alwaysAvailable: true,
      onRunOnce: noop,
      onRunAlways: noop,
      onDontRun: noop,
      ...over,
    }),
  );

// The wording is asserted in English; a machine set to Dutch would render Dutch.
beforeAll(async () => { await i18n.changeLanguage('en'); });

describe('ScriptConsentBar', () => {
  it('asks the question and offers the three answers', () => {
    const html = bar();
    expect(html).toContain('This form contains scripts (for example calculations). Run them?');
    expect(html).toContain('data-testid="script-consent-run-once"');
    expect(html).toContain('Run for this document');
    expect(html).toContain('Always run scripts');
    expect(html).toContain('Don&#x27;t run');
  });

  it('shows the number and the type where they are known', () => {
    const html = bar();
    expect(html).toContain('Scripts found: 5.');
    expect(html).toContain('JavaScript 3');
    expect(html).toContain('FormCalc 2');
  });

  it('names only the types that are there', () => {
    const html = bar({ status: { total: 1, javascript: 0, acroform: 0, formcalc: 1 } });
    expect(html).toContain('FormCalc 1');
    expect(html).not.toContain('JavaScript');
  });

  it('leaves out "Always" when a policy pins the choice', () => {
    expect(bar({ alwaysAvailable: false })).not.toContain('script-consent-run-always');
  });

  it('disables the answers while the scripts run', () => {
    expect(bar({ busy: true }).match(/disabled/g)?.length).toBe(3);
  });

  it('is in the locale file, in English', () => {
    expect(en.formScripts.runOnce).toBe('Run for this document');
    expect(en.settings.formScriptsLabel).toBe('Form scripts');
  });
});

describe('Settings → Security', () => {
  const panel = (formScriptsMode: 'ask' | 'always' | 'never') =>
    renderToStaticMarkup(
      createElement(SettingsPanel, {
        isOpen: true,
        onClose: noop,
        settings: { ...DEFAULT_APP_SETTINGS, formScriptsMode },
        onSettingsChange: noop,
      }),
    );

  it('has a Security section with Ask, Always and Never, Ask by default', async () => {
    await i18n.changeLanguage('en');
    const html = panel(DEFAULT_APP_SETTINGS.formScriptsMode);
    expect(html).toContain('data-testid="settings-security"');
    expect(html).toContain('>Security<');
    expect(html).toContain('data-testid="settings-form-scripts"');
    for (const label of ['Ask', 'Always', 'Never']) expect(html).toContain(`>${label}</option>`);
    expect(html).toMatch(/<option value="ask" selected/);
  });

  it('shows the stored choice', async () => {
    await i18n.changeLanguage('en');
    expect(panel('always')).toMatch(/<option value="always" selected/);
    expect(panel('never')).toMatch(/<option value="never" selected/);
  });
});
