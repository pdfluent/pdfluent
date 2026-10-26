// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import type { Page } from '@playwright/test';

/**
 * Contrast sweep over the rendered page, as a second opinion next to axe.
 *
 * axe reports "incomplete" (not "violation") whenever it cannot resolve a
 * background -- a translucent layer over a gradient, an overlapped element --
 * and an incomplete result does not fail a test. This sweep resolves every
 * background itself by compositing the ancestors' translucent fills over each
 * other, and fails on what it can compute. What it cannot compute (a
 * background image) is returned separately, never silently passed.
 *
 * Measured, per visible element:
 *  - text: 4.5:1, or 3:1 for large text (>= 24px, or >= 18.66px bold)
 *  - disabled text: 3:1. WCAG exempts it; the product does not, because a
 *    disabled control nobody can read is a control nobody understands
 *  - icon-only controls (an svg in a button with no text): 3:1 (WCAG 1.4.11)
 * The document itself (.page, a canvas of white paper in both themes) is
 * skipped: it is the PDF's own colours, not the app's.
 */

export interface SweepFinding {
  kind: 'text' | 'disabled-text' | 'icon';
  path: string;
  text: string;
  fg: string;
  bg: string;
  ratio: number;
  required: number;
}

export interface SweepResult {
  failures: SweepFinding[];
  /** Elements whose background could not be resolved (image/gradient). */
  unresolved: string[];
  measured: number;
}

export async function sweepContrast(page: Page, scope = 'body'): Promise<SweepResult> {
  return page.evaluate((scopeSel) => {
    type Rgba = [number, number, number, number];

    const parse = (css: string): Rgba | null => {
      let m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.%]+))?\s*\)$/.exec(css);
      if (m) {
        const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
        return [parseFloat(m[1]!), parseFloat(m[2]!), parseFloat(m[3]!), a];
      }
      m = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.%]+))?\s*\)$/.exec(css);
      if (m) {
        const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
        return [parseFloat(m[1]!) * 255, parseFloat(m[2]!) * 255, parseFloat(m[3]!) * 255, a];
      }
      return null;
    };
    const over = (top: Rgba, under: Rgba): Rgba => {
      const a = top[3] + under[3] * (1 - top[3]);
      if (a === 0) return [0, 0, 0, 0];
      return [0, 1, 2].map((i) => (top[i]! * top[3] + under[i]! * under[3] * (1 - top[3])) / a).concat(a) as Rgba;
    };
    const lum = ([r, g, b]: Rgba): number => {
      const l = [r, g, b].map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * l[0]! + 0.7152 * l[1]! + 0.0722 * l[2]!;
    };
    const ratioOf = (a: Rgba, b: Rgba): number => {
      const x = lum(a);
      const y = lum(b);
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    const hex = (c: Rgba): string =>
      '#' + [0, 1, 2].map((i) => Math.round(c[i]!).toString(16).padStart(2, '0')).join('');

    const pathOf = (el: Element): string => {
      const parts: string[] = [];
      let n: Element | null = el;
      for (let i = 0; n && i < 4; i++, n = n.parentElement) {
        const id = n.getAttribute('data-testid');
        const cls = (n.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
        parts.unshift(id ? `${n.tagName.toLowerCase()}[${id}]` : `${n.tagName.toLowerCase()}${cls ? '.' + cls : ''}`);
        if (id) break;
      }
      return parts.join(' > ');
    };

    const layersFrom = (from: Element | null, stopAt: Element | null): Rgba[] | null => {
      const layers: Rgba[] = [];
      for (let n: Element | null = from; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.backgroundImage !== 'none') return null; // image or gradient: unknowable
        const bg = parse(cs.backgroundColor);
        if (bg && bg[3] > 0) {
          layers.push(bg);
          if (bg[3] >= 1) break;
        }
        if (n === stopAt) break;
      }
      return layers;
    };
    const flatten = (layers: Rgba[], base: Rgba): Rgba => {
      let acc = base;
      for (let i = layers.length - 1; i >= 0; i--) acc = over(layers[i]!, acc);
      return acc;
    };
    const pageBase = (): Rgba => {
      const html = parse(getComputedStyle(document.documentElement).backgroundColor);
      return html && html[3] > 0 ? over(html, [255, 255, 255, 1]) : [255, 255, 255, 1];
    };

    /**
     * Colours as painted. `opacity` fades an element together with its own
     * background, so it is applied to the group and blended over what is behind
     * the outermost faded ancestor, not to the text alone.
     */
    const painted = (el: Element, fg0: Rgba): { fg: Rgba; bg: Rgba } | null => {
      let top: Element | null = null;
      let alpha = 1;
      for (let n: Element | null = el; n; n = n.parentElement) {
        const o = parseFloat(getComputedStyle(n).opacity);
        if (o < 1) {
          top = n;
          alpha *= o;
        }
      }
      if (!top) {
        const layers = layersFrom(el, null);
        if (!layers) return null;
        const bg = flatten(layers, pageBase());
        return { fg: over(fg0, bg), bg };
      }
      const inner = layersFrom(el, top);
      const outer = layersFrom(top.parentElement, null);
      if (!inner || !outer) return null;
      const behind = flatten(outer, pageBase());
      const localBg = flatten(inner, [0, 0, 0, 0]);
      const localFg = over(fg0, localBg);
      return {
        bg: over([localBg[0], localBg[1], localBg[2], localBg[3] * alpha], behind),
        fg: over([localFg[0], localFg[1], localFg[2], localFg[3] * alpha], behind),
      };
    };

    const visible = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      for (let n: Element | null = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
        if (n.getAttribute('aria-hidden') === 'true' && n.tagName !== 'BODY') return false;
      }
      return true;
    };

    const root = document.querySelector(scopeSel) ?? document.body;
    const failures: SweepFinding[] = [];
    const unresolved: string[] = [];
    let measured = 0;

    const check = (el: Element, fgCss: string, kind: SweepFinding['kind'], required: number, text: string) => {
      const fg0 = parse(fgCss);
      if (!fg0) return;
      const p = painted(el, fg0);
      if (!p) {
        unresolved.push(pathOf(el));
        return;
      }
      measured++;
      const { fg, bg } = p;
      const ratio = ratioOf(fg, bg);
      if (ratio + 1e-9 < required) {
        failures.push({ kind, path: pathOf(el), text: text.slice(0, 48), fg: hex(fg), bg: hex(bg), ratio: Math.round(ratio * 100) / 100, required });
      }
    };

    const all = [root, ...Array.from(root.querySelectorAll('*'))];
    for (const el of all) {
      if (el.closest('.page, .page-inner, canvas, [data-sweep-skip]')) continue;
      if (el instanceof SVGElement && !(el instanceof SVGSVGElement)) continue;

      // Text: an element with its own non-blank text node.
      const own = Array.from(el.childNodes)
        .filter((c) => c.nodeType === Node.TEXT_NODE)
        .map((c) => c.textContent ?? '')
        .join('')
        .trim();
      if (own && !(el instanceof SVGElement) && visible(el)) {
        const cs = getComputedStyle(el);
        const px = parseFloat(cs.fontSize);
        const bold = parseInt(cs.fontWeight, 10) >= 700;
        const large = px >= 24 || (px >= 18.66 && bold);
        const disabled = el.matches(':disabled, [aria-disabled="true"]') || !!el.closest(':disabled, [aria-disabled="true"]');
        check(el, cs.color, disabled ? 'disabled-text' : 'text', disabled ? 3 : large ? 3 : 4.5, own);
      }

      // Icon-only control: an svg whose button has no text of its own.
      if (el instanceof SVGSVGElement && visible(el)) {
        const host = el.closest('button, [role="button"]');
        if (host && !(host.textContent ?? '').trim()) {
          const disabled = host.matches(':disabled, [aria-disabled="true"]');
          const cs = getComputedStyle(el);
          const stroke = cs.stroke !== 'none' ? cs.stroke : cs.fill;
          check(el, stroke === 'none' ? cs.color : stroke, 'icon', 3, host.getAttribute('aria-label') ?? '');
          void disabled;
        }
      }
    }
    return { failures, unresolved, measured };
  }, scope);
}

export function describeFindings(r: SweepResult): string {
  return r.failures
    .map((f) => `  ${f.ratio.toFixed(2)}:1 < ${f.required}:1  [${f.kind}] ${f.fg} on ${f.bg}  ${f.path}  "${f.text}"`)
    .join('\n');
}
