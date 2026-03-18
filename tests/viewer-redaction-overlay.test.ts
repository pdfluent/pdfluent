// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const overlaySource = readFileSync(
  new URL('../src/viewer/components/AnnotationOverlay.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// AnnotationOverlay — redaction marker rendering
// ---------------------------------------------------------------------------

describe('AnnotationOverlay — redaction marker visual style', () => {
  it("renders a dedicated branch for type 'redaction'", () => {
    expect(overlaySource).toContain("if (t === 'redaction')");
  });

  it('redaction marker sets data-redaction="true"', () => {
    const branchStart = overlaySource.indexOf("if (t === 'redaction')");
    const branchEnd = overlaySource.indexOf('\n        }', branchStart) + 10;
    const branch = overlaySource.slice(branchStart, branchEnd);
    expect(branch).toContain('data-redaction="true"');
  });

  it('redaction marker uses fill="black"', () => {
    const branchStart = overlaySource.indexOf("if (t === 'redaction')");
    const branchEnd = overlaySource.indexOf('\n        }', branchStart) + 10;
    const branch = overlaySource.slice(branchStart, branchEnd);
    expect(branch).toContain('fill="black"');
  });

  it('redaction marker uses fillOpacity 0.7 at rest', () => {
    const branchStart = overlaySource.indexOf("if (t === 'redaction')");
    const branchEnd = overlaySource.indexOf('\n        }', branchStart) + 10;
    const branch = overlaySource.slice(branchStart, branchEnd);
    expect(branch).toContain("'0.7'");
  });

  it('redaction marker uses fillOpacity 0.85 on hover', () => {
    const branchStart = overlaySource.indexOf("if (t === 'redaction')");
    const branchEnd = overlaySource.indexOf('\n        }', branchStart) + 10;
    const branch = overlaySource.slice(branchStart, branchEnd);
    expect(branch).toContain("'0.85'");
  });

  it('redaction marker hover opacity expression uses isHovered', () => {
    const branchStart = overlaySource.indexOf("if (t === 'redaction')");
    const branchEnd = overlaySource.indexOf('\n        }', branchStart) + 10;
    const branch = overlaySource.slice(branchStart, branchEnd);
    expect(branch).toContain('isHovered');
    // isHovered drives opacity: '0.85' when true, '0.7' when false
    const fillOpacityIdx = branch.indexOf('fillOpacity');
    const expr = branch.slice(fillOpacityIdx, fillOpacityIdx + 60);
    expect(expr).toContain('isHovered');
  });

  it('redaction marker uses dashed border (strokeDasharray)', () => {
    const branchStart = overlaySource.indexOf("if (t === 'redaction')");
    const branchEnd = overlaySource.indexOf('\n        }', branchStart) + 10;
    const branch = overlaySource.slice(branchStart, branchEnd);
    expect(branch).toContain('strokeDasharray');
    expect(branch).toContain('4 2');
  });

  it('redaction marker uses stroke="black"', () => {
    const branchStart = overlaySource.indexOf("if (t === 'redaction')");
    const branchEnd = overlaySource.indexOf('\n        }', branchStart) + 10;
    const branch = overlaySource.slice(branchStart, branchEnd);
    expect(branch).toContain('stroke="black"');
  });

  it('selected redaction marker has no strokeDasharray', () => {
    const branchStart = overlaySource.indexOf("if (t === 'redaction')");
    const branchEnd = overlaySource.indexOf('\n        }', branchStart) + 10;
    const branch = overlaySource.slice(branchStart, branchEnd);
    // When selected: strokeDasharray should be 'none'
    expect(branch).toContain("'none'");
  });

  it('selected redaction marker uses isSelected for strokeWidth', () => {
    const branchStart = overlaySource.indexOf("if (t === 'redaction')");
    const branchEnd = overlaySource.indexOf('\n        }', branchStart) + 10;
    const branch = overlaySource.slice(branchStart, branchEnd);
    expect(branch).toContain('isSelected');
    const swIdx = branch.indexOf('strokeWidth');
    const swExpr = branch.slice(swIdx, swIdx + 40);
    expect(swExpr).toContain('isSelected');
  });
});

// ---------------------------------------------------------------------------
// AnnotationOverlay — hover state infrastructure
// ---------------------------------------------------------------------------

describe('AnnotationOverlay — hover state infrastructure', () => {
  it('imports useState from react', () => {
    expect(overlaySource).toContain("import { useState }");
  });

  it('declares hoveredMarkId state', () => {
    expect(overlaySource).toContain('const [hoveredMarkId, setHoveredMarkId]');
  });

  it('computes isHovered per annotation', () => {
    expect(overlaySource).toContain('mark.id === hoveredMarkId');
  });

  it('defines onMouseEnter handler that sets hoveredMarkId', () => {
    expect(overlaySource).toContain('onMouseEnter: () => setHoveredMarkId(mark.id)');
  });

  it('defines onMouseLeave handler that clears hoveredMarkId', () => {
    expect(overlaySource).toContain('onMouseLeave: () => setHoveredMarkId(null)');
  });

  it('spreads hoverHandlers onto redaction marker', () => {
    const branchStart = overlaySource.indexOf("if (t === 'redaction')");
    const branchEnd = overlaySource.indexOf('\n        }', branchStart) + 10;
    const branch = overlaySource.slice(branchStart, branchEnd);
    expect(branch).toContain('{...hoverHandlers}');
  });
});
