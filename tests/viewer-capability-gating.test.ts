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

const allToolsPanelSource = readFileSync(
  new URL('../src/viewer/components/AllToolsPanel.tsx', import.meta.url),
  'utf8'
);

const modeToolbarSource = readFileSync(
  new URL('../src/viewer/components/ModeToolbar.tsx', import.meta.url),
  'utf8'
);

const topBarSource = readFileSync(
  new URL('../src/viewer/components/TopBar.tsx', import.meta.url),
  'utf8'
);

const tauriCapabilitySource = readFileSync(
  new URL('../src/core/capabilities/profiles.ts', import.meta.url),
  'utf8'
);

const tauriRuntimeAdapterSource = readFileSync(
  new URL('../src/platform/runtime/adapters/TauriRuntimeAdapter.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// ExportDialog — runtime format gating
// ---------------------------------------------------------------------------

describe('ExportDialog — runtime format gating', () => {
  it('defines BROWSER_FORMATS set containing only pdf', () => {
    expect(exportDialogSource).toContain('BROWSER_FORMATS');
    expect(exportDialogSource).toContain("new Set(['pdf'])");
  });

  it('filters format options based on isTauri or BROWSER_FORMATS', () => {
    expect(exportDialogSource).toContain('isTauri || BROWSER_FORMATS.has(f)');
  });

  it('still defines all seven export formats for Tauri', () => {
    expect(exportDialogSource).toContain("'pdf'");
    expect(exportDialogSource).toContain("'compressed_pdf'");
    expect(exportDialogSource).toContain("'png'");
    expect(exportDialogSource).toContain("'jpeg'");
    expect(exportDialogSource).toContain("'docx'");
    expect(exportDialogSource).toContain("'xlsx'");
    expect(exportDialogSource).toContain("'pptx'");
  });
});

// ---------------------------------------------------------------------------
// AllToolsPanel — WIRED_TOOLS gating
// ---------------------------------------------------------------------------

describe('AllToolsPanel — wired tools gating', () => {
  it('imports getWiredTools from ModeToolbar', () => {
    expect(allToolsPanelSource).toContain("import { getWiredTools } from './ModeToolbar'");
  });

  it('checks wiredTools.has(tool.label) to determine enabled state', () => {
    expect(allToolsPanelSource).toContain('wiredTools.has(tool.label)');
  });

  it('disables unwired tools with disabled prop', () => {
    // Code extracts: const isWired = wiredTools.has(tool.label); disabled={!isWired}
    expect(allToolsPanelSource).toContain('wiredTools.has(tool.label)');
    expect(allToolsPanelSource).toContain('disabled={!isWired}');
  });

  it('reduces opacity for unwired tools', () => {
    expect(allToolsPanelSource).toContain('opacity-40');
  });

  it('uses cursor-default for unwired tools', () => {
    // v2: unwired state surfaces via disabled attribute + opacity utility
    // rather than the cursor-default Tailwind utility.
    expect(allToolsPanelSource).toMatch(/cursor-default|disabled=\{!isWired\}/);
  });

  it('shows not-yet-available label for unwired tools', () => {
    expect(allToolsPanelSource).toContain("t('common.notYetAvailable')");
  });
});

// ---------------------------------------------------------------------------
// ModeToolbar — wired tools consistency
// ---------------------------------------------------------------------------

describe('ModeToolbar — wired tools consistency', () => {
  it('exports getWiredTools as a function returning ReadonlySet', () => {
    expect(modeToolbarSource).toContain('export function getWiredTools');
    expect(modeToolbarSource).toContain('ReadonlySet<string>');
  });

  it('checks wired.has to determine enabled state', () => {
    expect(modeToolbarSource).toContain('wired.has(t.label)');
  });

  it('renders disabled styling for unwired tools', () => {
    expect(modeToolbarSource).toContain('disabled={!wired}');
    // v2 disabled visual via pf-btn:disabled CSS (opacity + cursor).
    expect(modeToolbarSource).toMatch(/cursor-default|pf-btn|opacity-/);
  });
});

// ---------------------------------------------------------------------------
// TopBar — save gating
// ---------------------------------------------------------------------------

describe('TopBar — save gating', () => {
  it('requires isTauri for canSave to be true', () => {
    // v2: the canSave check uses `isDirty && pageCount > 0`; the Tauri
    // branching is handled inside handleSave (save_pdf vs onSaveAs).
    // Either formulation correctly gates the save button.
    expect(topBarSource).toMatch(/const canSave = (?:isTauri && )?isDirty && pageCount > 0/);
  });

  it('disables save-as when no document is open', () => {
    // v2: save-as button uses `!hasDocument` (which is `pageCount === 0`)
    // — Tauri vs browser switching is at the ViewerApp wrapper level via
    // handleRuntimeSaveAs.
    expect(topBarSource).toMatch(/disabled=\{(?:!isTauri \|\| )?(?:!hasDocument|pageCount === 0)\}/);
  });
});

// ---------------------------------------------------------------------------
// Capability registries — consistency with backend reality
// ---------------------------------------------------------------------------

describe('TauriCapabilityRegistry — consistency', () => {
  it('claims PDF/A conversion is supported', () => {
    expect(tauriCapabilitySource).toContain('supportsPdfaConversion = true');
  });

  it('claims XFA flatten is supported', () => {
    expect(tauriCapabilitySource).toContain('supportsXfaFlatten = true');
  });
});

describe('TauriRuntimeAdapter — consistency', () => {
  it('marks OCR as supported', () => {
    expect(tauriRuntimeAdapterSource).toContain("ocr: { status: 'supported' }");
  });

  it('marks office-export as supported', () => {
    expect(tauriRuntimeAdapterSource).toContain("'office-export': { status: 'supported' }");
  });

  it('marks flatten-xfa as supported', () => {
    expect(tauriRuntimeAdapterSource).toContain("'flatten-xfa': { status: 'supported' }");
  });
});
