// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const railSource = readFileSync(
  new URL('../src/viewer/components/LeftNavRail.tsx', import.meta.url),
  'utf8'
);

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// LeftNavRailProps — new navigation props
// ---------------------------------------------------------------------------

describe('LeftNavRail — navigation props', () => {
  it('declares onNextPage prop', () => {
    const ifaceStart = railSource.indexOf('interface LeftNavRailProps');
    const ifaceEnd = railSource.indexOf('\n}', ifaceStart) + 2;
    const iface = railSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('onNextPage: () => void');
  });

  it('declares onPrevPage prop', () => {
    const ifaceStart = railSource.indexOf('interface LeftNavRailProps');
    const ifaceEnd = railSource.indexOf('\n}', ifaceStart) + 2;
    const iface = railSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('onPrevPage: () => void');
  });

  it('destructures onNextPage and onPrevPage in LeftNavRail', () => {
    expect(railSource).toContain('onNextPage');
    expect(railSource).toContain('onPrevPage');
  });
});

// ---------------------------------------------------------------------------
// Navigation bar UI
// ---------------------------------------------------------------------------

describe('LeftNavRail — nav-prev-page-btn', () => {
  it('renders nav-prev-page-btn', () => {
    expect(railSource).toContain('data-testid="nav-prev-page-btn"');
  });

  it('nav-prev-page-btn calls onPrevPage on click', () => {
    const btnPos = railSource.indexOf('nav-prev-page-btn');
    const btnStart = railSource.lastIndexOf('<button', btnPos);
    const btnEnd = railSource.indexOf('</button>', btnStart) + 9;
    const btnBlock = railSource.slice(btnStart, btnEnd);
    expect(btnBlock).toContain('onPrevPage');
    expect(btnBlock).toContain('onClick');
  });

  it('nav-prev-page-btn is disabled when on first page', () => {
    const btnPos = railSource.indexOf('nav-prev-page-btn');
    const btnStart = railSource.lastIndexOf('<button', btnPos);
    const btnEnd = railSource.indexOf('</button>', btnStart) + 9;
    const btnBlock = railSource.slice(btnStart, btnEnd);
    expect(btnBlock).toContain('currentPage === 0');
  });

  it('nav-prev-page-btn has aria-label', () => {
    const btnPos = railSource.indexOf('nav-prev-page-btn');
    const btnStart = railSource.lastIndexOf('<button', btnPos);
    const btnEnd = railSource.indexOf('</button>', btnStart) + 9;
    const btnBlock = railSource.slice(btnStart, btnEnd);
    expect(btnBlock).toContain('aria-label=');
  });
});

describe('LeftNavRail — nav-next-page-btn', () => {
  it('renders nav-next-page-btn', () => {
    expect(railSource).toContain('data-testid="nav-next-page-btn"');
  });

  it('nav-next-page-btn calls onNextPage on click', () => {
    const btnPos = railSource.indexOf('nav-next-page-btn');
    const btnStart = railSource.lastIndexOf('<button', btnPos);
    const btnEnd = railSource.indexOf('</button>', btnStart) + 9;
    const btnBlock = railSource.slice(btnStart, btnEnd);
    expect(btnBlock).toContain('onNextPage');
    expect(btnBlock).toContain('onClick');
  });

  it('nav-next-page-btn is disabled when on last page', () => {
    const btnPos = railSource.indexOf('nav-next-page-btn');
    const btnStart = railSource.lastIndexOf('<button', btnPos);
    const btnEnd = railSource.indexOf('</button>', btnStart) + 9;
    const btnBlock = railSource.slice(btnStart, btnEnd);
    expect(btnBlock).toContain('currentPage === pageCount - 1');
  });

  it('nav-next-page-btn has aria-label', () => {
    const btnPos = railSource.indexOf('nav-next-page-btn');
    const btnStart = railSource.lastIndexOf('<button', btnPos);
    const btnEnd = railSource.indexOf('</button>', btnStart) + 9;
    const btnBlock = railSource.slice(btnStart, btnEnd);
    expect(btnBlock).toContain('aria-label=');
  });
});

describe('LeftNavRail — nav-go-to-page-input', () => {
  it('renders nav-go-to-page-input', () => {
    expect(railSource).toContain('data-testid="nav-go-to-page-input"');
  });

  it('go-to-page input is type number', () => {
    const inputPos = railSource.indexOf('nav-go-to-page-input');
    const inputStart = railSource.lastIndexOf('<input', inputPos);
    const inputEnd = railSource.indexOf('/>', inputStart) + 2;
    const inputBlock = railSource.slice(inputStart, inputEnd);
    expect(inputBlock).toContain('type="number"');
  });

  it('go-to-page input uses currentPage + 1 as value', () => {
    expect(railSource).toContain('currentPage + 1');
  });

  it('go-to-page input navigates via onPageSelect', () => {
    expect(railSource).toContain('onPageSelect(v - 1)');
  });

  it('go-to-page input only navigates for valid values', () => {
    // The onChange handler must guard against NaN and out-of-range values
    expect(railSource).toContain('isNaN(v)');
    expect(railSource).toContain('v >= 1 && v <= pageCount');
  });

  it('go-to-page input has aria-label', () => {
    const inputPos = railSource.indexOf('nav-go-to-page-input');
    const inputStart = railSource.lastIndexOf('<input', inputPos);
    const inputEnd = railSource.indexOf('/>', inputStart) + 2;
    const inputBlock = railSource.slice(inputStart, inputEnd);
    expect(inputBlock).toContain('aria-label=');
  });
});

describe('LeftNavRail — nav controls only shown when document open', () => {
  it('nav controls are conditional on hasDoc', () => {
    const navPrevPos = railSource.indexOf('nav-prev-page-btn');
    const hasdocPos = railSource.lastIndexOf('hasDoc', navPrevPos);
    expect(hasdocPos).toBeGreaterThan(-1);
    expect(navPrevPos - hasdocPos).toBeLessThan(300);
  });
});

// ---------------------------------------------------------------------------
// ViewerApp wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — LeftNavRail nav props', () => {
  it('passes onNextPage to LeftNavRail', () => {
    expect(viewerAppSource).toContain('onNextPage=');
  });

  it('passes onPrevPage to LeftNavRail', () => {
    expect(viewerAppSource).toContain('onPrevPage=');
  });

  it('onNextPage increments pageIndex clamped to pageCount - 1', () => {
    const railBlock = viewerAppSource.slice(
      viewerAppSource.indexOf('<LeftNavRail'),
      viewerAppSource.indexOf('/>', viewerAppSource.indexOf('<LeftNavRail')) + 2
    );
    expect(railBlock).toContain('Math.min(pageCount - 1, i + 1)');
  });

  it('onPrevPage decrements pageIndex clamped to 0', () => {
    const railBlock = viewerAppSource.slice(
      viewerAppSource.indexOf('<LeftNavRail'),
      viewerAppSource.indexOf('/>', viewerAppSource.indexOf('<LeftNavRail')) + 2
    );
    expect(railBlock).toContain('Math.max(0, i - 1)');
  });
});

// ---------------------------------------------------------------------------
// No regressions
// ---------------------------------------------------------------------------

describe('LeftNavRail — no regressions', () => {
  it('thumbnails prop still accepted', () => {
    expect(railSource).toContain('thumbnails: Map<number, string>');
  });

  it('onPageSelect prop still accepted', () => {
    expect(railSource).toContain('onPageSelect: (index: number) => void');
  });

  it('panel toggle still works (togglePanel)', () => {
    expect(railSource).toContain('togglePanel');
  });

  it('thumbnail items still have data-testid', () => {
    expect(railSource).toContain('data-testid={`thumbnail-${i}`}');
  });
});
