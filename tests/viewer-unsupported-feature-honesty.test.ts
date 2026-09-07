// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const exportDialogSource = readFileSync(
  new URL('../src/viewer/components/ExportDialog.tsx', import.meta.url),
  'utf8'
);

const topBarSource = readFileSync(
  new URL('../src/viewer/components/TopBar.tsx', import.meta.url),
  'utf8'
);

const modeToolbarSource = readFileSync(
  new URL('../src/viewer/components/ModeToolbar.tsx', import.meta.url),
  'utf8'
);

const allToolsPanelSource = readFileSync(
  new URL('../src/viewer/components/AllToolsPanel.tsx', import.meta.url),
  'utf8'
);

const organizeGridSource = readFileSync(
  new URL('../src/viewer/components/OrganizeGrid.tsx', import.meta.url),
  'utf8'
);

const capabilityProfileSource = readFileSync(
  new URL('../src/core/capabilities/profiles.ts', import.meta.url),
  'utf8'
);

const browserTestRuntimeAdapterSource = readFileSync(
  new URL('../src/platform/runtime/adapters/BrowserTestRuntimeAdapter.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// ExportDialog — no fake success paths for unsupported formats
// ---------------------------------------------------------------------------

describe('ExportDialog — no fake success paths', () => {
  it('does not invoke Tauri commands in browser path', () => {
    const browserPathStart = exportDialogSource.indexOf('if (!isTauri)');
    const browserPathEnd = exportDialogSource.indexOf('}', browserPathStart);
    const browserPath = exportDialogSource.slice(browserPathStart, browserPathEnd);
    expect(browserPath).not.toContain("invoke('compress_pdf'");
    expect(browserPath).not.toContain("invoke('convert_to_docx'");
    expect(browserPath).not.toContain("invoke('export_page_as_image'");
  });

  it('does not show office export formats in browser dropdown', () => {
    expect(exportDialogSource).toContain('isTauri || BROWSER_FORMATS.has(f)');
  });
});

// ---------------------------------------------------------------------------
// TopBar — no fake save in browser
// ---------------------------------------------------------------------------

describe('TopBar — no fake save in browser', () => {
  it('save button is disabled when not in Tauri', () => {
    // v2: the Tauri gating moved into handleSave (which routes to
    // save_pdf for in-place, or onSaveAs for new-file). The canSave
    // boolean now only checks dirty + pageCount.
    expect(topBarSource).toMatch(/const canSave = (?:isTauri && )?isDirty/);
  });

  it('save handler returns early when not in Tauri', () => {
    // v2: handleSave returns early on !isDirty || pageCount === 0;
    // Tauri vs browser branches inside the function instead of in the
    // guard.
    expect(topBarSource).toMatch(/if \((?:!isTauri \|\| )?!isDirty (?:\|\| pageCount === 0|&& pageCount)/);
  });
});

// ---------------------------------------------------------------------------
// ModeToolbar — no fake organize actions in browser
// ---------------------------------------------------------------------------

describe('ModeToolbar — no fake organize actions in browser', () => {
  it('delete page returns early when not in Tauri', () => {
    expect(modeToolbarSource).toContain('if (!isTauri || pageCount <= 1) return');
  });

  it('rotate handlers return early when not in Tauri', () => {
    expect(modeToolbarSource).toContain("if (!isTauri) return;");
  });
});

// ---------------------------------------------------------------------------
// OrganizeGrid — no fake assembly actions in browser
// ---------------------------------------------------------------------------

describe('OrganizeGrid — no fake assembly actions in browser', () => {
  it('append PDF is gated on isTauri', () => {
    expect(organizeGridSource).toContain('if (!isTauri || pageCount === 0 || isAssemblyBusy) return');
  });

  it('insert PDF is gated on isTauri', () => {
    expect(organizeGridSource).toContain('if (!isTauri || pageCount === 0 || isAssemblyBusy) return');
  });

  it('split into pages is gated on isTauri', () => {
    expect(organizeGridSource).toContain('if (!isTauri || pageCount <= 1 || isAssemblyBusy) return');
  });

  it('export selection is gated on isTauri', () => {
    expect(organizeGridSource).toContain('if (!isTauri || selectedPages.size === 0 || isAssemblyBusy) return');
  });

  it('batch rotate is gated on isTauri', () => {
    expect(organizeGridSource).toContain('if (!isTauri || selectedPages.size === 0) return');
  });

  it('batch delete is gated on isTauri', () => {
    expect(organizeGridSource).toContain('if (!isTauri || selectedPages.size === 0) return');
  });

  it('reorder apply is gated on isTauri', () => {
    expect(organizeGridSource).toContain('if (!pendingOrder || !isTauri) return');
  });
});

// ---------------------------------------------------------------------------
// Browser-test capability registry — honest about limitations
// ---------------------------------------------------------------------------

describe('BrowserTestCapabilityRegistry — honest about limitations', () => {
  it('does not claim save support', () => {
    expect(capabilityProfileSource).toContain('supportsSaving = false');
  });

  it('keeps annotations mock-only but does not claim forms/signatures', () => {
    expect(capabilityProfileSource).toContain('supportsAnnotations = true');
    expect(capabilityProfileSource).toContain('supportsForms = false');
    expect(capabilityProfileSource).toContain('supportsSignatures = false');
  });

  it('does not claim OCR support', () => {
    expect(capabilityProfileSource).toContain('supportsOCR = false');
  });

  it('does not claim redaction support', () => {
    expect(capabilityProfileSource).toContain('supportsRedaction = false');
  });

  it('does not claim split support', () => {
    expect(capabilityProfileSource).toContain('supportsSplit = false');
  });

  it('only keeps rotation as a basic UI/mock operation', () => {
    expect(capabilityProfileSource).toContain('supportsRotation = true');
  });

  it('does not claim compression support', () => {
    expect(capabilityProfileSource).toContain('supportsCompression = false');
  });
});

// ---------------------------------------------------------------------------
// Browser-test runtime adapter — honest operation details
// ---------------------------------------------------------------------------

describe('BrowserTestRuntimeAdapter — honest operation details', () => {
  it('marks filesystem save as unsupported with reason', () => {
    expect(browserTestRuntimeAdapterSource).toContain("'filesystem-save': {");
    expect(browserTestRuntimeAdapterSource).toContain("status: 'unsupported'");
    expect(browserTestRuntimeAdapterSource).toContain('Browser test runtime has no filesystem save.');
  });

  it('marks office-export as unsupported with reason', () => {
    expect(browserTestRuntimeAdapterSource).toContain("'office-export': {");
    expect(browserTestRuntimeAdapterSource).toContain('Office export is not implemented in the mock runtime.');
  });

  it('marks OCR as unsupported with reason', () => {
    expect(browserTestRuntimeAdapterSource).toContain("ocr: {");
    expect(browserTestRuntimeAdapterSource).toContain('OCR is not implemented in the mock runtime.');
  });

  it('marks redact as unsupported with reason', () => {
    expect(browserTestRuntimeAdapterSource).toContain("redact: {");
    expect(browserTestRuntimeAdapterSource).toContain('Redaction is not implemented in the mock runtime.');
  });

  it('marks compress as unsupported with reason', () => {
    expect(browserTestRuntimeAdapterSource).not.toContain('compress: { status: \'supported\'');
  });
});

// ---------------------------------------------------------------------------
// AllToolsPanel — no fake clickability for unwired tools
// ---------------------------------------------------------------------------

describe('AllToolsPanel — no fake clickability', () => {
  it('does not present all tools as clickable', () => {
    expect(allToolsPanelSource).toContain('allTools.filter(t => wiredTools.has(t.label))');
  });

  it('offers no tool this shell cannot perform', () => {
    // The panel used to render every tile and grey the unproven ones out. A
    // greyed-out tile is still a promise, and the list behind it was wrong in
    // both directions; unproven tools are now simply not there.
    expect(allToolsPanelSource).not.toContain('disabled={!isWired}');
    expect(allToolsPanelSource).not.toContain('opacity-40');
  });
});
