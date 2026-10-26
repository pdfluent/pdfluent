// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// #565: a caret after the document name reads as "document menu". The crumb has
// none, so it must not draw one; if a menu is added, this test is the place to
// say so (the caret then needs a button with a handler).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('top bar breadcrumb (#565)', () => {
  const shell = readFileSync(new URL('../src/viewer/v3/EditorV3Shell.tsx', import.meta.url), 'utf8');
  const start = shell.indexOf('<div className="crumb">');
  const crumb = shell.slice(start, shell.indexOf('</div>', start));

  it('exists', () => { expect(start).toBeGreaterThan(-1); });

  it('draws no chevron that opens nothing', () => {
    expect(crumb).not.toContain('ChevronDownIcon');
    expect(crumb).not.toContain('className="chev"');
  });
});
