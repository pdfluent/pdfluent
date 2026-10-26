// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * The PDFluent mark (rounded square with a "P") follows the primary-action
 * tokens: dark square + light P in light mode, light square + dark P in dark
 * mode. A hard-coded fill makes the square vanish on the near-black dark
 * surface, so every mark selector must paint with --emphasis / --on-emphasis.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const STYLES = join(__dirname, '..', 'src', 'styles');
const read = (rel: string): string => readFileSync(join(STYLES, rel), 'utf8');

const MARK_SELECTORS = [
  '.toolbar-logo-mark',
  '.viewer-placeholder-mark',
  '.welcome-card-mark',
  '.pfv3 .brand-mark',
  '.pfv3 .welcome-mark',
];

function ruleBody(css: string, selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`).exec(css);
  if (!m) throw new Error(`rule not found: ${selector}`);
  return m[1];
}

const all = [
  read('global.css'),
  read('viewer-v3.css'),
  ...readdirSync(join(STYLES, 'viewer')).filter((f) => f.endsWith('.css')).map((f) => read(`viewer/${f}`)),
].join('\n');

describe('brand mark follows the theme tokens', () => {
  it.each(MARK_SELECTORS)('%s paints with --emphasis / --on-emphasis', (selector) => {
    const body = ruleBody(all, selector);
    expect(body).toMatch(/background:\s*var\(--emphasis\)/);
    expect(body).toMatch(/color:\s*var\(--on-emphasis\)/);
    expect(body).not.toMatch(/background:\s*#/);
  });

  it('the P glyph of the toolbar and first-run marks is a ::before using the same tokens', () => {
    expect(all).toMatch(/\.toolbar-logo-mark::before\s*\{[^}]*content:\s*"P"/);
    expect(ruleBody(all, '.first-run-dialog::before')).toMatch(/background:\s*var\(--emphasis\)/);
  });

  it('no stale brand-mark colour tokens remain', () => {
    expect(all).not.toMatch(/--brand-mark-(fill|on)/);
  });

  it('dark theme flips the tokens: near-white emphasis, dark on-emphasis', () => {
    const tokens = read('tokens.css');
    const dark = /:root\.theme-dark,[^{]*\{([^}]*)\}/.exec(tokens);
    expect(dark).not.toBeNull();
    expect(dark![1]).toMatch(/--emphasis:\s*#f2f2f2/);
    expect(dark![1]).toMatch(/--on-emphasis:\s*#0e0e12/);
    expect(tokens).toMatch(/--emphasis:\s*#1a1a1a/);
    expect(tokens).toMatch(/--on-emphasis:\s*#ffffff/);
  });
});
