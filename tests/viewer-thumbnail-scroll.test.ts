// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const navRailSource = readFileSync(
  new URL('../src/viewer/components/LeftNavRail.tsx', import.meta.url),
  'utf8'
);

// Locate ThumbnailPanel for scoped assertions
const panelStart = navRailSource.indexOf('function ThumbnailPanel(');
const panelEnd = navRailSource.indexOf('\nfunction ', panelStart + 1);
const panelBody = navRailSource.slice(panelStart, panelEnd);

// ---------------------------------------------------------------------------
// Ref wiring
// ---------------------------------------------------------------------------

describe('ThumbnailPanel — active thumbnail ref', () => {
  it('imports useRef from react', () => {
    expect(navRailSource).toContain('useRef');
    expect(navRailSource.slice(0, navRailSource.indexOf('function ThumbnailPanel'))).toContain('useRef');
  });

  it('creates activeRef with useRef inside ThumbnailPanel', () => {
    expect(panelBody).toContain('activeRef = useRef<HTMLButtonElement | null>(null)');
  });

  it('attaches activeRef to the active thumbnail button', () => {
    expect(panelBody).toContain('ref={isActive ? activeRef : null}');
  });

  it('does not attach a ref to inactive thumbnails (null when not active)', () => {
    expect(panelBody).toContain(': null}');
  });
});

// ---------------------------------------------------------------------------
// scrollIntoView call
// ---------------------------------------------------------------------------

describe('ThumbnailPanel — scrollIntoView on page change', () => {
  it('calls scrollIntoView on activeRef.current', () => {
    expect(panelBody).toContain('activeRef.current?.scrollIntoView(');
  });

  it('uses block: nearest to minimise scroll distance', () => {
    expect(panelBody).toContain("block: 'nearest'");
  });

  it('uses behavior: smooth for animated scrolling', () => {
    expect(panelBody).toContain("behavior: 'smooth'");
  });

  it('scroll call is inside a useEffect', () => {
    const effectIdx = panelBody.indexOf('useEffect(');
    const scrollIdx = panelBody.indexOf('scrollIntoView', effectIdx);
    expect(effectIdx).toBeGreaterThan(-1);
    expect(scrollIdx).toBeGreaterThan(effectIdx);
  });

  it('useEffect depends on currentPage', () => {
    expect(panelBody).toContain('}, [currentPage])');
  });
});

// ---------------------------------------------------------------------------
// No-op when ref is null (optional chaining guard)
// ---------------------------------------------------------------------------

describe('ThumbnailPanel — no-op when active ref is unset', () => {
  it('uses optional chaining (?.) so null ref does not throw', () => {
    expect(panelBody).toContain('activeRef.current?.scrollIntoView');
  });
});

// ---------------------------------------------------------------------------
// Existing thumbnail rendering unchanged
// ---------------------------------------------------------------------------

describe('ThumbnailPanel — existing rendering unchanged', () => {
  it('still renders data-testid thumbnail buttons', () => {
    expect(panelBody).toContain('data-testid={`thumbnail-${i}`}');
  });

  it('still marks active thumbnail with isActive styles', () => {
    expect(panelBody).toContain('isActive');
  });

  it('still calls onPageSelect on click', () => {
    expect(panelBody).toContain('onPageSelect(i)');
  });

  it('still renders thumbnail image when available', () => {
    expect(panelBody).toContain('thumbUrl');
  });
});
