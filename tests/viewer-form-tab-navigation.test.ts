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
// Locate the Tab handler body for scoped assertions
// ---------------------------------------------------------------------------

const tabHandlerStart = viewerAppSource.indexOf('handleFieldTabKey');
const tabHandlerEnd   = viewerAppSource.indexOf('}, [mode, formFields', tabHandlerStart) + 60;
const tabHandlerBody  = viewerAppSource.slice(tabHandlerStart, tabHandlerEnd);

// ---------------------------------------------------------------------------
// Existence and gating
// ---------------------------------------------------------------------------

describe('ViewerApp — form tab navigation: handler', () => {
  it('defines handleFieldTabKey', () => {
    expect(viewerAppSource).toContain('handleFieldTabKey');
  });

  it('only triggers on Tab key', () => {
    expect(tabHandlerBody).toContain("e.key !== 'Tab'");
  });

  it('guards against non-forms mode', () => {
    expect(tabHandlerBody).toContain("mode !== 'forms'");
  });

  it('guards against empty formFields', () => {
    expect(tabHandlerBody).toContain('formFields.length === 0');
  });

  it('calls e.preventDefault() to suppress default tab focus', () => {
    expect(tabHandlerBody).toContain('e.preventDefault()');
  });
});

// ---------------------------------------------------------------------------
// Forward navigation (Tab)
// ---------------------------------------------------------------------------

describe('ViewerApp — form tab navigation: Tab forward', () => {
  it('advances to index 0 on first Tab when no field is selected (activeFieldIdx < 0)', () => {
    expect(tabHandlerBody).toContain('activeFieldIdx < 0 ? 0 :');
  });

  it('advances to next field clamped to formFields.length - 1', () => {
    expect(tabHandlerBody).toContain('Math.min(formFields.length - 1, activeFieldIdx + 1)');
  });

  it('calls handleFieldNav for forward navigation', () => {
    // The forward branch should call handleFieldNav
    expect(tabHandlerBody).toContain('handleFieldNav(activeFieldIdx < 0 ? 0 :');
  });
});

// ---------------------------------------------------------------------------
// Backward navigation (Shift+Tab)
// ---------------------------------------------------------------------------

describe('ViewerApp — form tab navigation: Shift+Tab backward', () => {
  it('uses e.shiftKey to distinguish backward navigation', () => {
    expect(tabHandlerBody).toContain('e.shiftKey');
  });

  it('goes to previous field clamped to 0', () => {
    expect(tabHandlerBody).toContain('Math.max(0, activeFieldIdx - 1)');
  });

  it('calls handleFieldNav for backward navigation', () => {
    expect(tabHandlerBody).toContain('handleFieldNav(Math.max(0, activeFieldIdx - 1))');
  });
});

// ---------------------------------------------------------------------------
// useEffect wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — form tab navigation: useEffect', () => {
  it('registers keydown listener', () => {
    expect(tabHandlerBody).toContain("addEventListener('keydown', handleFieldTabKey)");
  });

  it('removes keydown listener on cleanup', () => {
    expect(tabHandlerBody).toContain("removeEventListener('keydown', handleFieldTabKey)");
  });

  it('depends on [mode, formFields, activeFieldIdx, handleFieldNav]', () => {
    expect(tabHandlerBody).toContain('}, [mode, formFields, activeFieldIdx, handleFieldNav]');
  });
});

// ---------------------------------------------------------------------------
// No regressions — existing keyboard shortcuts still present
// ---------------------------------------------------------------------------

describe('ViewerApp — form tab navigation: no regressions', () => {
  it('handleFieldNav still defined', () => {
    expect(viewerAppSource).toContain('handleFieldNav');
  });

  it('activeFieldIdx state still present', () => {
    expect(viewerAppSource).toContain('activeFieldIdx');
  });

  it('handleCommentNav still present', () => {
    expect(viewerAppSource).toContain('handleCommentNav');
  });

  it('go-to-page shortcut still present', () => {
    expect(viewerAppSource).toContain('handleGoToPage');
  });

  it('zoom keyboard shortcut still present', () => {
    expect(viewerAppSource).toContain('handleZoomKey');
  });

  it('save-as keyboard shortcut still present', () => {
    expect(viewerAppSource).toContain('handleSaveAsKey');
  });
});
