// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const overlaySource = readFileSync(
  join(import.meta.dirname, '../src/viewer/components/TextInteractionOverlay.tsx'),
  'utf8',
);

const pageCanvasSource = readFileSync(
  join(import.meta.dirname, '../src/viewer/components/PageCanvas.tsx'),
  'utf8',
);

// ---------------------------------------------------------------------------
// TextInteractionOverlay source readiness
// ---------------------------------------------------------------------------

describe('TextInteractionOverlay — source readiness', () => {
  it('exports TextInteractionOverlay component', () => {
    expect(overlaySource).toContain('export const TextInteractionOverlay');
  });

  it('exports TextInteractionOverlayProps interface', () => {
    expect(overlaySource).toContain('export interface TextInteractionOverlayProps');
  });

  it('has active, hovered, selected, pageHeightPt, zoom props', () => {
    expect(overlaySource).toContain('active: boolean');
    expect(overlaySource).toContain('hovered: TextHoverTarget | null');
    expect(overlaySource).toContain('selected: TextParagraphTarget | null');
    expect(overlaySource).toContain('pageHeightPt: number');
    expect(overlaySource).toContain('zoom: number');
  });

  it('uses text-interaction-overlay testid', () => {
    expect(overlaySource).toContain('text-interaction-overlay');
  });

  it('uses text-hover-rect testid for hover state', () => {
    expect(overlaySource).toContain('text-hover-rect');
  });

  it('uses text-selected-rect testid for selected state', () => {
    expect(overlaySource).toContain('text-selected-rect');
  });

  it('uses getChromeAttrs for visual chrome', () => {
    expect(overlaySource).toContain('getChromeAttrs');
  });

  it('uses chromeToSvgProps to spread SVG attributes', () => {
    expect(overlaySource).toContain('chromeToSvgProps');
  });

  it('uses pdfRectToDom for coordinate conversion', () => {
    expect(overlaySource).toContain('pdfRectToDom');
  });

  it('sets pointerEvents to none (does not block text selection)', () => {
    expect(overlaySource).toContain("pointerEvents: 'none'");
  });

  it('renders null when active is false', () => {
    expect(overlaySource).toContain('if (!active) return null');
  });

  it('is memoized', () => {
    expect(overlaySource).toContain('memo(');
  });
});

// ---------------------------------------------------------------------------
// PageCanvas integration
// ---------------------------------------------------------------------------

describe('PageCanvas — TextInteractionOverlay integration', () => {
  it('imports TextInteractionOverlay', () => {
    expect(pageCanvasSource).toContain("import { TextInteractionOverlay } from './TextInteractionOverlay'");
  });

  it('imports hitTestText from textHoverHitTest', () => {
    expect(pageCanvasSource).toContain("import { hitTestText }");
    expect(pageCanvasSource).toContain("textHoverHitTest");
  });

  it('imports PageTextStructure from textInteractionModel', () => {
    expect(pageCanvasSource).toContain('PageTextStructure');
    expect(pageCanvasSource).toContain('textInteractionModel');
  });

  it('accepts textStructure prop', () => {
    expect(pageCanvasSource).toContain('textStructure');
  });

  it('accepts textInteractionActive prop', () => {
    expect(pageCanvasSource).toContain('textInteractionActive');
  });

  it('renders TextInteractionOverlay in the component', () => {
    expect(pageCanvasSource).toContain('<TextInteractionOverlay');
  });

  it('clears hover on mouse leave', () => {
    expect(pageCanvasSource).toContain('onMouseLeave');
    expect(pageCanvasSource).toContain('setHoveredTextTarget(null)');
  });

  it('runs hit test in mouse move handler', () => {
    expect(pageCanvasSource).toContain('hitTestText(');
    expect(pageCanvasSource).toContain('setHoveredTextTarget(');
  });

  it('notifies parent via onTextTargetSelect on mouse up when text target is hovered', () => {
    // Batch 2: selection is now controlled — PageCanvas calls onTextTargetSelect callback
    expect(pageCanvasSource).toContain('onTextTargetSelect?.(');
    expect(pageCanvasSource).toContain('hoveredTextTarget?.paragraph');
  });

  it('stacks TextInteractionOverlay between annotation overlay and text layer', () => {
    const annotIdx = pageCanvasSource.indexOf('zIndex: 10');
    const textIntIdx = pageCanvasSource.indexOf('zIndex: 15');
    const textLayerIdx = pageCanvasSource.indexOf('zIndex: 20');
    expect(annotIdx).toBeGreaterThan(-1);
    expect(textIntIdx).toBeGreaterThan(-1);
    expect(textLayerIdx).toBeGreaterThan(-1);
    expect(annotIdx).toBeLessThan(textIntIdx);
    expect(textIntIdx).toBeLessThan(textLayerIdx);
  });
});

// ---------------------------------------------------------------------------
// ViewerApp integration
// ---------------------------------------------------------------------------

describe('ViewerApp — text interaction wiring', () => {
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
  ].map(p => readFileSync(join(import.meta.dirname, p), 'utf8')).join('\n\n');

  it('imports groupDigitalTextSpans', () => {
    expect(viewerAppSource).toContain('groupDigitalTextSpans');
  });

  it('imports PageTextStructure type', () => {
    expect(viewerAppSource).toContain('PageTextStructure');
  });

  it('memoizes pageTextStructure', () => {
    expect(viewerAppSource).toContain('pageTextStructure');
    expect(viewerAppSource).toContain('groupDigitalTextSpans(textSpans');
  });

  it('derives textInteractionActive from mode via rules module', () => {
    expect(viewerAppSource).toContain('textInteractionActive');
    // Batch 5: uses isTextInteractionActive(mode, activeAnnotationTool) from textInteractionRules
    expect(viewerAppSource).toContain('isTextInteractionActive');
  });

  it('passes textStructure to PageCanvas', () => {
    expect(viewerAppSource).toContain('textStructure={pageTextStructure}');
  });

  it('passes textInteractionActive to PageCanvas', () => {
    expect(viewerAppSource).toContain('textInteractionActive={textInteractionActive}');
  });
});
