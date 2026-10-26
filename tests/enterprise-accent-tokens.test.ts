// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { enterpriseAccentTokens } from '../src/lib/enterpriseTheme';

describe('enterprise accent colour', () => {
  it('colours focus and selection tokens only', () => {
    const tokens = enterpriseAccentTokens('#0a66ff');
    const names = Object.keys(tokens);
    expect(names.length).toBeGreaterThan(5);
    for (const n of names) expect(n).toMatch(/^--(?:focus|selection|caret)/);
    // Never the primary-action, active-state or legacy accent tokens.
    for (const forbidden of ['--emphasis', '--on-emphasis', '--state-active-bg', '--accent', '--primary']) {
      expect(names).not.toContain(forbidden);
    }
  });

  it('ignores a colour that cannot be seen on both light and dark surfaces', () => {
    expect(enterpriseAccentTokens('#ffff00')).toEqual({}); // invisible on white
    expect(enterpriseAccentTokens('#101010')).toEqual({}); // invisible on dark
    expect(enterpriseAccentTokens('not-a-colour')).toEqual({});
    expect(enterpriseAccentTokens('#0a66')).toEqual({});
  });

  it('the legacy shell applies the helper and no longer sets --accent', () => {
    const app = readFileSync(new URL('../src/legacy/App.tsx', import.meta.url), 'utf8');
    expect(app).toContain('enterpriseAccentTokens(enterpriseSettings.branding.accentColor)');
    expect(app).not.toMatch(/setProperty\(\s*["']--accent/);
  });
});
