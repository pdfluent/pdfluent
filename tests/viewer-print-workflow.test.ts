// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const toolbarSource = readFileSync(
  new URL('../src/viewer/components/ModeToolbar.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// Print buttons in read mode
// ---------------------------------------------------------------------------

describe('ModeToolbar — print-all-btn', () => {
  it('renders print-all-btn', () => {
    expect(toolbarSource).toContain('data-testid="print-all-btn"');
  });

  it('print-all-btn calls window.print()', () => {
    const btnPos = toolbarSource.indexOf('print-all-btn');
    const btnStart = toolbarSource.lastIndexOf('<button', btnPos);
    const btnEnd = toolbarSource.indexOf('</button>', btnStart) + 9;
    const btnBlock = toolbarSource.slice(btnStart, btnEnd);
    expect(btnBlock).toContain('window.print()');
  });

  it('print-all-btn has a title', () => {
    const btnPos = toolbarSource.indexOf('print-all-btn');
    const btnStart = toolbarSource.lastIndexOf('<button', btnPos);
    const btnEnd = toolbarSource.indexOf('</button>', btnStart) + 9;
    const btnBlock = toolbarSource.slice(btnStart, btnEnd);
    expect(btnBlock).toContain('title=');
  });

  it('print-all-btn has an aria-label', () => {
    const btnPos = toolbarSource.indexOf('print-all-btn');
    const btnStart = toolbarSource.lastIndexOf('<button', btnPos);
    const btnEnd = toolbarSource.indexOf('</button>', btnStart) + 9;
    const btnBlock = toolbarSource.slice(btnStart, btnEnd);
    expect(btnBlock).toContain('aria-label=');
  });
});

describe('ModeToolbar — print-current-btn', () => {
  it('renders print-current-btn', () => {
    expect(toolbarSource).toContain('data-testid="print-current-btn"');
  });

  it('print-current-btn calls window.print()', () => {
    const btnPos = toolbarSource.indexOf('print-current-btn');
    const btnStart = toolbarSource.lastIndexOf('<button', btnPos);
    const btnEnd = toolbarSource.indexOf('</button>', btnStart) + 9;
    const btnBlock = toolbarSource.slice(btnStart, btnEnd);
    expect(btnBlock).toContain('window.print()');
  });
});

describe('ModeToolbar — print-range-btn', () => {
  it('renders print-range-btn', () => {
    expect(toolbarSource).toContain('data-testid="print-range-btn"');
  });

  it('print-range-btn calls window.print()', () => {
    const btnPos = toolbarSource.indexOf('print-range-btn');
    const btnStart = toolbarSource.lastIndexOf('<button', btnPos);
    const btnEnd = toolbarSource.indexOf('</button>', btnStart) + 9;
    const btnBlock = toolbarSource.slice(btnStart, btnEnd);
    expect(btnBlock).toContain('window.print()');
  });
});

describe('ModeToolbar — print buttons placement', () => {
  it('print buttons are in read mode section', () => {
    const readModeStart = toolbarSource.indexOf("mode === 'read'");
    expect(readModeStart).toBeGreaterThan(-1);
    const printAllPos = toolbarSource.indexOf('print-all-btn');
    expect(printAllPos).toBeGreaterThan(readModeStart);
  });

  it('print buttons are only shown when pageCount > 0', () => {
    const printAllPos = toolbarSource.indexOf('print-all-btn');
    const pageCountGuard = toolbarSource.lastIndexOf('pageCount > 0', printAllPos);
    expect(pageCountGuard).toBeGreaterThan(-1);
    expect(printAllPos - pageCountGuard).toBeLessThan(1600);
  });

  it('uses PrinterIcon from lucide-react', () => {
    expect(toolbarSource).toContain('PrinterIcon');
    expect(toolbarSource).toContain('lucide-react');
  });
});

// ---------------------------------------------------------------------------
// No regressions
// ---------------------------------------------------------------------------

describe('ModeToolbar — print workflow: no regressions', () => {
  it('toolbar-zoom-display testid still present', () => {
    expect(toolbarSource).toContain('data-testid="toolbar-zoom-display"');
  });

  it('field-nav testid still present', () => {
    expect(toolbarSource).toContain('data-testid="field-nav"');
  });

  it('comment-nav testid still present', () => {
    expect(toolbarSource).toContain('data-testid="comment-nav"');
  });

  it('add-comment-btn still present', () => {
    expect(toolbarSource).toContain('data-testid="add-comment-btn"');
  });
});
