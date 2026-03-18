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
// ViewerApp — page navigation keyboard handler
// ---------------------------------------------------------------------------

describe('ViewerApp — handlePageNav keyboard handler', () => {
  function pageNavBody(): string {
    const fnStart = viewerAppSource.indexOf('function handlePageNav(');
    const fnEnd = viewerAppSource.indexOf('\n  }, [pageCount])', fnStart) + 16;
    return viewerAppSource.slice(fnStart, fnEnd);
  }

  it('defines handlePageNav function', () => {
    expect(viewerAppSource).toContain('function handlePageNav(');
  });

  it('guards against navigation when pageCount is 0', () => {
    expect(pageNavBody()).toContain('pageCount === 0');
  });

  it('ignores key events while focus is in INPUT elements', () => {
    expect(pageNavBody()).toContain("'INPUT'");
  });

  it('ignores key events while focus is in TEXTAREA elements', () => {
    expect(pageNavBody()).toContain("'TEXTAREA'");
  });

  it('ArrowRight advances to next page', () => {
    expect(pageNavBody()).toContain("case 'ArrowRight'");
    expect(pageNavBody()).toContain('i + 1');
  });

  it('ArrowDown advances to next page', () => {
    expect(pageNavBody()).toContain("case 'ArrowDown'");
  });

  it('PageDown advances to next page', () => {
    expect(pageNavBody()).toContain("case 'PageDown'");
  });

  it('clamps next page at pageCount - 1', () => {
    expect(pageNavBody()).toContain('pageCount - 1, i + 1');
  });

  it('ArrowLeft goes to previous page', () => {
    expect(pageNavBody()).toContain("case 'ArrowLeft'");
    expect(pageNavBody()).toContain('i - 1');
  });

  it('ArrowUp goes to previous page', () => {
    expect(pageNavBody()).toContain("case 'ArrowUp'");
  });

  it('PageUp goes to previous page', () => {
    expect(pageNavBody()).toContain("case 'PageUp'");
  });

  it('clamps previous page at 0', () => {
    expect(pageNavBody()).toContain('Math.max(0, i - 1)');
  });

  it('Home jumps to first page (index 0)', () => {
    expect(pageNavBody()).toContain("case 'Home'");
    expect(pageNavBody()).toContain('setPageIndex(0)');
  });

  it('End jumps to last page', () => {
    expect(pageNavBody()).toContain("case 'End'");
    expect(pageNavBody()).toContain('setPageIndex(pageCount - 1)');
  });

  it('calls e.preventDefault() to prevent browser scroll', () => {
    expect(pageNavBody()).toContain('e.preventDefault()');
  });

  it('registers on window keydown', () => {
    const fnStart = viewerAppSource.indexOf('function handlePageNav(');
    const blockEnd = viewerAppSource.indexOf('\n  }, [pageCount]);', fnStart) + 40;
    const listenerSection = viewerAppSource.slice(fnStart, blockEnd);
    expect(listenerSection).toContain("addEventListener('keydown', handlePageNav)");
  });

  it('removes listener on cleanup', () => {
    const fnStart = viewerAppSource.indexOf('function handlePageNav(');
    const blockEnd = viewerAppSource.indexOf('\n  }, [pageCount]);', fnStart) + 40;
    const listenerSection = viewerAppSource.slice(fnStart, blockEnd);
    expect(listenerSection).toContain("removeEventListener('keydown', handlePageNav)");
  });
});
