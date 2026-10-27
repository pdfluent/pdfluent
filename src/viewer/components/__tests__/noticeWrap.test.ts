// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// A notice must show all its words. An owner screenshot (26-10) showed the form
// action notice cut off at the window's right edge: the notice kept its own
// 520px width inside a 360px stack, and its text could not wrap. node has no
// layout engine, so this pins the three rules that make that impossible; the
// real measurement is the textOverflow step in journey J-B2.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/styles/viewer-v3.css', 'utf8');
const app = readFileSync('src/viewer/ViewerApp.tsx', 'utf8');

function rule(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  expect(start, `${selector} has a rule`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('}', start));
}

describe('notices wrap inside the window', () => {
  it('the paragraphs wrap, even a long word', () => {
    const r = rule('.pf-notice p');
    expect(r).toContain('overflow-wrap: anywhere');
    expect(r).toContain('white-space: normal');
  });
  it('a notice never exceeds the window and counts its padding', () => {
    const r = rule('.pfv3 .pf-notice,\n.pf-notice');
    expect(r).toContain('box-sizing: border-box');
    expect(r).toContain('max-width: calc(100vw - 2rem)');
  });
  it('inside the error stack a notice is as wide as the stack, not 520px', () => {
    expect(rule('.pf-notice-stack .pf-notice')).toContain('width: 100%');
    expect(app).toMatch(/data-testid="app-error-stack"\s+className="pf-notice-stack /);
  });
  it('no locale string for a notice is so long that wrapping cannot hold it', () => {
    // 360px at 12px is about 50 characters a line; a notice may run to a paragraph, not a page.
    for (const code of ['nl', 'de', 'fr', 'fi', 'hu', 'el']) {
      const tree = JSON.parse(readFileSync(`src/i18n/locales/${code}.json`, 'utf8')) as Record<string, Record<string, string>>;
      for (const [key, value] of Object.entries(tree.fallbacks ?? {})) {
        expect(value.length, `${code} fallbacks.${key}`).toBeLessThan(400);
      }
    }
  });
});
