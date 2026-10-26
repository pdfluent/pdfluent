// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * What an enterprise accent colour may colour.
 *
 * The brand is monochrome: buttons, tabs and tools are near-black / near-white
 * whatever a customer configures. The accent reaches only the two jobs blue has
 * (src/styles/tokens.css): the focus ring and selection.
 *
 * A colour that would not be visible against both the light and the dark
 * surfaces (3:1) is ignored rather than applied, because a focus indicator
 * nobody can see is worse than the default one.
 */

const LIGHT_SURFACE: Rgb = [255, 255, 255];
const DARK_SURFACE: Rgb = [35, 36, 41];

type Rgb = [number, number, number];

function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const v = m[1]!;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

function luminance([r, g, b]: Rgb): number {
  const lin = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** CSS custom properties to set for an enterprise accent; empty when unusable. */
export function enterpriseAccentTokens(hex: string): Record<string, string> {
  const rgb = parseHex(hex);
  if (!rgb) return {};
  if (contrast(rgb, LIGHT_SURFACE) < 3 || contrast(rgb, DARK_SURFACE) < 3) return {};
  const solid = `#${hex.trim().replace('#', '').toLowerCase()}`;
  const a = (alpha: number): string => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
  return {
    '--focus-ring': solid,
    '--focus-halo': a(0.3),
    '--focus-ring-on-page': solid,
    '--focus-halo-on-page': a(0.3),
    '--selection': solid,
    '--selection-fill': a(0.18),
    '--selection-line': a(0.55),
    '--selection-on-page': solid,
    '--selection-on-page-fill': a(0.16),
    '--selection-on-page-line': a(0.55),
    '--selection-on-page-strong': a(0.9),
    '--selection-text-bg': a(0.35),
    '--caret-on-page': solid,
  };
}
