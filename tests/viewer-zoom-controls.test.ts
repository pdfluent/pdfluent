// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

// Locate the floating zoom control block for scoped assertions.
const floatStart = viewerAppSource.indexOf('Floating zoom controls');
const floatEnd = viewerAppSource.indexOf('</div>\n          )}', floatStart) + 8;
const floatBlock = viewerAppSource.slice(floatStart, floatEnd);

// ---------------------------------------------------------------------------
// Batch 1 — Zoom controls: zoom-in button
// ---------------------------------------------------------------------------

describe('ViewerApp — floating zoom controls: zoom in', () => {
  it('renders a zoom-in button with + label', () => {
    expect(floatBlock).toContain('+');
  });

  it('zoom-in button calls setZoom with clamped increment', () => {
    expect(floatBlock).toContain('Math.min(4');
    expect(floatBlock).toContain('0.25');
  });

  it('zoom-in button is disabled at zoom ceiling (4×)', () => {
    expect(floatBlock).toContain('zoom >= 4');
  });
});

// ---------------------------------------------------------------------------
// Batch 1 — Zoom controls: zoom-out button
// ---------------------------------------------------------------------------

describe('ViewerApp — floating zoom controls: zoom out', () => {
  it('renders a zoom-out button with − label', () => {
    expect(floatBlock).toContain('−');
  });

  it('zoom-out button calls setZoom with clamped decrement', () => {
    expect(floatBlock).toContain('Math.max(0.25');
  });

  it('zoom-out button is disabled at zoom floor (0.25×)', () => {
    expect(floatBlock).toContain('zoom <= 0.25');
  });
});

// ---------------------------------------------------------------------------
// Batch 1 — Zoom controls: zoom percentage / reset
// ---------------------------------------------------------------------------

describe('ViewerApp — floating zoom controls: percentage display', () => {
  it('renders zoom percentage label via Math.round', () => {
    expect(floatBlock).toContain('Math.round(zoom * 100)');
  });

  it('percentage button opens presets popover on click', () => {
    expect(floatBlock).toContain('setZoomPresetsOpen');
  });

  it('percentage button has zoom-reset-btn testid', () => {
    expect(floatBlock).toContain('data-testid="zoom-reset-btn"');
  });
});

// ---------------------------------------------------------------------------
// Batch 1 — Zoom controls: fit to width
// ---------------------------------------------------------------------------

describe('ViewerApp — floating zoom controls: fit to width', () => {
  it('renders zoom-fit-width-btn', () => {
    expect(floatBlock).toContain('data-testid="zoom-fit-width-btn"');
  });

  it('fit-to-width button resets zoom to 1.0', () => {
    const btnIdx = floatBlock.indexOf('data-testid="zoom-fit-width-btn"');
    const btn = floatBlock.slice(Math.max(0, btnIdx - 100), btnIdx + 400);
    expect(btn).toContain('setZoom(1.0)');
  });

  it('fit-to-width button has accessible aria-label', () => {
    const btnIdx = floatBlock.indexOf('data-testid="zoom-fit-width-btn"');
    const btn = floatBlock.slice(Math.max(0, btnIdx - 100), btnIdx + 400);
    expect(btn).toContain('aria-label=');
  });
});

// ---------------------------------------------------------------------------
// Batch 1 — Zoom state: initial value and localStorage persistence
// ---------------------------------------------------------------------------

describe('ViewerApp — zoom state', () => {
  it('initialises zoom from localStorage or defaults to 1', () => {
    // The useState initialiser reads from localStorage
    expect(viewerAppSource).toContain("localStorage.getItem('pdfluent.viewer.zoom'");
  });

  it('persists zoom to localStorage on change', () => {
    expect(viewerAppSource).toContain("localStorage.setItem('pdfluent.viewer.zoom'");
  });

  it('zoom state minimum is 0.25 (25%)', () => {
    expect(viewerAppSource).toContain('Math.max(0.25');
  });

  it('zoom state maximum is 4 (400%)', () => {
    expect(viewerAppSource).toContain('Math.min(4');
  });
});
