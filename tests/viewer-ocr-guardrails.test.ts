// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

// The OCR run itself (J-60) is no longer a per-page loop in the frontend that
// keeps words for an overlay: it writes a text layer into the document. Its
// behaviour is tested where it happens -- src-tauri/tests/
// ocr_makes_scans_searchable.rs (scan -> OCR -> save -> search),
// src-tauri/src/ocr_component.rs (the bundled component, checksums) and
// src/lib/__tests__/ocrComponent.test.ts (what "Run OCR" leads to).

const viewerAppSource = [
  '../src/viewer/hooks/usePageNavigation.ts',
  '../src/viewer/hooks/useZoomControls.ts',
  '../src/viewer/hooks/useSidebarState.ts',
  '../src/viewer/hooks/useUndoRedo.ts',
  '../src/viewer/hooks/useSearch.ts',
  '../src/viewer/hooks/useFormFields.ts',
  '../src/viewer/hooks/useModeManager.ts',
  '../src/viewer/hooks/useDocumentLifecycle.ts',
  '../src/viewer/hooks/useCommands.ts',
  '../src/viewer/hooks/useDragDrop.ts',
  '../src/viewer/ViewerSidePanels.tsx',
  '../src/viewer/hooks/useAnnotations.ts',
  '../src/viewer/hooks/useTextInteraction.ts',
  '../src/viewer/hooks/useKeyboardShortcuts.ts',
  '../src/viewer/ViewerApp.tsx',
  '../src/viewer/WelcomeSection.tsx',
].map(p => readFileSync(new URL(p, import.meta.url), 'utf8')).join('\n\n');

const ocrOverlaySource = readFileSync(
  new URL('../src/viewer/components/OcrOverlay.tsx', import.meta.url),
  'utf8'
);


const rightPanelSource = readFileSync(
  new URL('../src/viewer/components/RightContextPanel.tsx', import.meta.url),
  'utf8'
);

const mockOcrEngineSource = readFileSync(
  new URL('../src/core/engine/mock/MockOcrEngine.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// handleRunOcr — input guards
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// OcrOverlay — rendering guardrails
// ---------------------------------------------------------------------------

describe('OcrOverlay — rendering guardrails', () => {
  it('does not render when visible is false', () => {
    expect(ocrOverlaySource).toContain('!visible');
  });

  it('does not render when words array is empty', () => {
    expect(ocrOverlaySource).toContain('words.length === 0');
  });

  it('SVG has pointerEvents none to prevent blocking user interaction', () => {
    expect(ocrOverlaySource).toContain("pointerEvents: 'none'");
  });

  it('uses data-confidence attribute to expose confidence for accessibility/testing', () => {
    expect(ocrOverlaySource).toContain('data-confidence=');
  });

  it('default lowConfidenceThreshold is 0.6', () => {
    expect(ocrOverlaySource).toContain('lowConfidenceThreshold = 0.6');
  });

  it('visible defaults to true (opt-in visible state)', () => {
    expect(ocrOverlaySource).toContain('visible = true');
  });
});

// ---------------------------------------------------------------------------
// Rust OCR bridge — input validation guardrails
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// OcrPanel — UI guardrails
// ---------------------------------------------------------------------------

describe('OcrPanel — UI guardrails', () => {
  it('run button disabled through combined runtime guard', () => {
    expect(rightPanelSource).toContain('const controlsDisabled = ocrRunning || !runtimeAvailable || ocrStatusChecking');
    expect(rightPanelSource).toContain('disabled={controlsDisabled}');
  });

  it('onRunOcr called with optional chaining (safe when prop absent)', () => {
    expect(rightPanelSource).toContain('onRunOcr?.({');
  });

  it('scope selector defaults to scanned (prefer safe subset over all)', () => {
    expect(rightPanelSource).toContain("'scanned'");
  });
});

// ---------------------------------------------------------------------------
// MockOcrEngine — conforms to OcrEngine contract
// ---------------------------------------------------------------------------

describe('MockOcrEngine — contract conformance', () => {
  it('implements OcrEngine interface', () => {
    expect(mockOcrEngineSource).toContain('implements OcrEngine');
  });

  it('isAvailable returns true in mock', () => {
    expect(mockOcrEngineSource).toContain('return true');
  });

  it('runOcr returns success: true', () => {
    expect(mockOcrEngineSource).toContain('success: true');
  });

  it('mock words array is non-empty (enables overlay tests)', () => {
    expect(mockOcrEngineSource).toContain("text: 'Mock'");
  });

  it('mock result includes qualityMetrics', () => {
    expect(mockOcrEngineSource).toContain('qualityMetrics');
  });
});
