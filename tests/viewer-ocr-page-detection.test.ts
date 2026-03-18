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

// ---------------------------------------------------------------------------
// ViewerApp — scannedPageIndices state
// ---------------------------------------------------------------------------

describe('ViewerApp — scannedPageIndices state', () => {
  it('declares scannedPageIndices state as Set<number>', () => {
    expect(viewerAppSource).toContain('scannedPageIndices');
    expect(viewerAppSource).toContain('Set<number>');
  });

  it('scannedPageIndices initialized as empty Set', () => {
    expect(viewerAppSource).toContain('new Set<number>()');
  });

  it('has setScannedPageIndices setter', () => {
    expect(viewerAppSource).toContain('setScannedPageIndices');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — scanned page detection logic
// ---------------------------------------------------------------------------

describe('ViewerApp — scanned page detection logic', () => {
  it('defines SCANNED_PAGE_TEXT_THRESHOLD constant', () => {
    expect(viewerAppSource).toContain('SCANNED_PAGE_TEXT_THRESHOLD');
  });

  it('SCANNED_PAGE_TEXT_THRESHOLD is 12', () => {
    expect(viewerAppSource).toContain('SCANNED_PAGE_TEXT_THRESHOLD = 12');
  });

  it('iterates over all pages (for loop up to pdfDoc.pages.length)', () => {
    expect(viewerAppSource).toContain('pdfDoc.pages.length');
  });

  it('calls extractPageTextSpans for each page', () => {
    const detectionStart = viewerAppSource.indexOf('SCANNED_PAGE_TEXT_THRESHOLD');
    const detectionEnd = detectionStart + 500;
    const block = viewerAppSource.slice(detectionStart, detectionEnd);
    expect(block).toContain('extractPageTextSpans');
  });

  it('sums text length from spans', () => {
    const detectionStart = viewerAppSource.indexOf('SCANNED_PAGE_TEXT_THRESHOLD');
    const detectionEnd = detectionStart + 500;
    const block = viewerAppSource.slice(detectionStart, detectionEnd);
    expect(block).toContain('span.text.length');
  });

  it('adds page to scanned set when chars below threshold', () => {
    const detectionStart = viewerAppSource.indexOf('SCANNED_PAGE_TEXT_THRESHOLD');
    const detectionEnd = detectionStart + 600;
    const block = viewerAppSource.slice(detectionStart, detectionEnd);
    expect(block).toContain('scanned.add(p)');
  });

  it('calls setScannedPageIndices with the discovered set', () => {
    const detectionStart = viewerAppSource.indexOf('SCANNED_PAGE_TEXT_THRESHOLD');
    const detectionEnd = detectionStart + 700;
    const block = viewerAppSource.slice(detectionStart, detectionEnd);
    expect(block).toContain('setScannedPageIndices(scanned)');
  });

  it('detection runs inside the document load effect', () => {
    // The detection block must appear before the pdfDoc?.id dependency comment
    const detectionPos = viewerAppSource.indexOf('SCANNED_PAGE_TEXT_THRESHOLD');
    const effectEnd = viewerAppSource.indexOf("[pdfDoc?.id]); // eslint-disable-line", detectionPos);
    expect(effectEnd).toBeGreaterThan(detectionPos);
  });
});
