// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Settings -> "Delete my crash reports" and "Delete my feedback reports": the controls exist in the panel, asks
// for nothing until pressed, and every string it shows is a translated key.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const panel = read('src/viewer/components/SettingsPanel.tsx');
const component = read('src/components/telemetry/SentCrashReports.tsx');
const en = JSON.parse(read('src/i18n/locales/en.json')) as { telemetry: Record<string, string> };

describe('Settings crash report deletion', () => {
  it('is mounted in the crash report section of the settings panel', () => {
    expect(panel).toContain("import { SentCrashReports } from '../../components/telemetry/SentCrashReports'");
    expect(panel).toContain('<SentCrashReports />');
  });

  it('deletes only when the button is pressed, through the user-requested path', () => {
    expect(component).toContain('data-testid={`${testId}-delete-btn`}');
    expect(component).toContain('testId="settings-crash"');
    expect(component).toContain('testId="settings-feedback"');
    expect(component).toContain('onClick={() => void remove()}');
    expect(component).toContain('removeAllCrashReports({ userRequested: true })');
    expect(component).toContain('removeAllFeedback({ userRequested: true })');
    // Nothing is requested while rendering or mounting.
    expect(component).not.toMatch(/useEffect/);
  });

  it('shows no hard-coded text: every string is a telemetry key present in en.json', () => {
    const keys = [...component.matchAll(/'(telemetry\.[A-Za-z]+)'/g)].map((m) => (m[1] as string).replace('telemetry.', ''));
    expect([...new Set(keys)].sort()).toEqual([
      'settingsDeleteFailed', 'settingsDeleteFeedback', 'settingsDeleteReports', 'settingsDeleted', 'settingsDeleting',
      'settingsFeedbackDeleteFailed', 'settingsFeedbackDeleted', 'settingsSentFeedback', 'settingsSentReports',
    ]);
    for (const key of keys) expect(en.telemetry[key], key).toBeTruthy();
  });

  it('fills both placeholders the sent-reports sentence has', () => {
    expect(en.telemetry.settingsSentReports).toContain('{{count}}');
    expect(en.telemetry.settingsSentReports).toContain('{{days}}');
    expect(en.telemetry.settingsSentFeedback).toContain('{{count}}');
    expect(en.telemetry.settingsSentFeedback).toContain('{{days}}');
    expect(component).toContain('t(keys.sent, { count, days })');
  });
});
