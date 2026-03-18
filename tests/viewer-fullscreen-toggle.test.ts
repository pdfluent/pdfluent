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

// Locate the handleToolAction body for scoped assertions
const actionStart = toolbarSource.indexOf('function handleToolAction(');
const actionEnd = toolbarSource.indexOf('\n  }', actionStart) + 4;
const actionBody = toolbarSource.slice(actionStart, actionEnd);

// ---------------------------------------------------------------------------
// WIRED_TOOLS registration
// ---------------------------------------------------------------------------

describe('ModeToolbar — full screen: WIRED_TOOLS entry', () => {
  it("adds 'Volledig scherm' to WIRED_TOOLS", () => {
    expect(toolbarSource).toContain("'toolbar.fullscreen'");
  });

  it("'Volledig scherm' is inside the WIRED_TOOLS Set literal", () => {
    const wiredStart = toolbarSource.indexOf('WIRED_TOOLS');
    const wiredEnd = toolbarSource.indexOf(']);', wiredStart);
    const wiredBlock = toolbarSource.slice(wiredStart, wiredEnd);
    expect(wiredBlock).toContain("'toolbar.fullscreen'");
  });
});

// ---------------------------------------------------------------------------
// handleToolAction dispatch
// ---------------------------------------------------------------------------

describe('ModeToolbar — full screen: handleToolAction case', () => {
  it("handles the 'Volledig scherm' case", () => {
    expect(actionBody).toContain("case 'toolbar.fullscreen'");
  });

  it('checks document.fullscreenElement to decide enter vs exit', () => {
    expect(actionBody).toContain('document.fullscreenElement');
  });

  it('calls document.exitFullscreen() when already in full screen', () => {
    expect(actionBody).toContain('document.exitFullscreen()');
  });

  it('calls document.documentElement.requestFullscreen() to enter full screen', () => {
    expect(actionBody).toContain('document.documentElement.requestFullscreen()');
  });

  it('uses the correct toggle logic: exit if fullscreenElement, enter otherwise', () => {
    const caseStart = actionBody.indexOf("case 'toolbar.fullscreen'");
    const caseEnd = actionBody.indexOf('break', caseStart);
    const caseBlock = actionBody.slice(caseStart, caseEnd);
    expect(caseBlock).toContain('if (document.fullscreenElement)');
    expect(caseBlock).toContain('document.exitFullscreen()');
    expect(caseBlock).toContain('document.documentElement.requestFullscreen()');
  });
});

// ---------------------------------------------------------------------------
// No regressions
// ---------------------------------------------------------------------------

describe('ModeToolbar — full screen: no regressions', () => {
  it("'Inzoomen' is still in WIRED_TOOLS", () => {
    const wiredStart = toolbarSource.indexOf('WIRED_TOOLS');
    const wiredEnd = toolbarSource.indexOf(']);', wiredStart);
    expect(toolbarSource.slice(wiredStart, wiredEnd)).toContain("'toolbar.zoomIn'");
  });

  it("'Uitzoomen' is still in WIRED_TOOLS", () => {
    const wiredStart = toolbarSource.indexOf('WIRED_TOOLS');
    const wiredEnd = toolbarSource.indexOf(']);', wiredStart);
    expect(toolbarSource.slice(wiredStart, wiredEnd)).toContain("'toolbar.zoomOut'");
  });

  it("'Zoek tekst' is still in WIRED_TOOLS", () => {
    const wiredStart = toolbarSource.indexOf('WIRED_TOOLS');
    const wiredEnd = toolbarSource.indexOf(']);', wiredStart);
    expect(toolbarSource.slice(wiredStart, wiredEnd)).toContain("'toolbar.searchText'");
  });

  it('zoom in/out cases still dispatch', () => {
    expect(actionBody).toContain("case 'toolbar.zoomIn'");
    expect(actionBody).toContain("case 'toolbar.zoomOut'");
  });

  it('page mutation cases still dispatch', () => {
    expect(actionBody).toContain("case 'toolbar.deletePage'");
    expect(actionBody).toContain("case 'toolbar.rotateRight'");
  });

  it('zoom display still present in read mode', () => {
    expect(toolbarSource).toContain("mode === 'read'");
    expect(toolbarSource).toContain('Math.round(zoom * 100)');
  });
});
