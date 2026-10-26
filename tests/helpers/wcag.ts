// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/** WCAG 2.x contrast maths and a small CSS-variable cascade, for tests. */

export type Rgba = [number, number, number, number];

export function parseColor(raw: string): Rgba {
  const v = raw.trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(v);
  if (m) {
    let h = m[1]!;
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
      h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    ];
  }
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(v);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
  m = /^hsl\(\s*([\d.]+)(?:deg)?\s+([\d.]+)%\s+([\d.]+)%\s*\)$/.exec(v);
  if (m) {
    const h = Number(m[1]) / 360;
    const s = Number(m[2]) / 100;
    const l = Number(m[3]) / 100;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t0: number): number => {
      let t = t0;
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255, 1];
  }
  if (v === 'transparent') return [0, 0, 0, 0];
  throw new Error(`cannot parse colour: ${raw}`);
}

/** `top` painted over `under` (both may be translucent). */
export function composite(top: Rgba, under: Rgba): Rgba {
  const a = top[3] + under[3] * (1 - top[3]);
  if (a === 0) return [0, 0, 0, 0];
  const ch = (i: 0 | 1 | 2): number => (top[i] * top[3] + under[i] * under[3] * (1 - top[3])) / a;
  return [ch(0), ch(1), ch(2), a];
}

function luminance([r, g, b]: Rgba): number {
  const lin = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

export function contrastRatio(a: Rgba, b: Rgba): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function hex(c: Rgba): string {
  return '#' + [0, 1, 2].map((i) => Math.round(c[i]!).toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// CSS reading
// ---------------------------------------------------------------------------

export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

export interface Rule {
  selectors: string[];
  decls: Array<[string, string]>;
  /** Source order, so a later rule of equal specificity wins. */
  order: number;
}

/** Every rule with a declaration block, including those nested in @media/@layer. */
export function readRules(css: string): Rule[] {
  const src = stripComments(css);
  const rules: Rule[] = [];
  let order = 0;
  const walk = (text: string): void => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i);
      if (open < 0) break;
      const head = text.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      while (depth > 0 && j < text.length) {
        if (text[j] === '{') depth++;
        else if (text[j] === '}') depth--;
        j++;
      }
      const body = text.slice(open + 1, j - 1);
      if (head.startsWith('@')) {
        walk(body);
      } else if (head) {
        const decls: Array<[string, string]> = [];
        for (const d of body.matchAll(/([a-z0-9-]+)\s*:\s*([^;{}]+);?/g)) decls.push([d[1]!, d[2]!.trim()]);
        rules.push({ selectors: head.split(',').map((s) => s.trim().replace(/\s+/g, ' ')), decls, order: order++ });
      }
      i = j;
    }
  };
  walk(src);
  return rules;
}

/** Last declaration of `prop` in a rule whose selector list contains `selector` exactly. */
export function declared(rules: Rule[], selector: string, prop: string): string | null {
  let found: string | null = null;
  for (const r of rules) {
    if (!r.selectors.includes(selector)) continue;
    for (const [p, v] of r.decls) if (p === prop) found = v.replace(/\s*!important$/, '');
  }
  return found;
}

export type VarMap = Record<string, string>;

/** Custom properties declared by the rules that match one of `selectors`, later wins. */
export function varsOf(rules: Rule[], selectors: string[]): VarMap {
  const out: VarMap = {};
  for (const r of rules) {
    if (!r.selectors.some((s) => selectors.includes(s))) continue;
    for (const [p, v] of r.decls) if (p.startsWith('--')) out[p] = v;
  }
  return out;
}

/** Resolve `var(--x[, fallback])` chains against a map. */
export function resolveVars(value: string, map: VarMap, depth = 0): string {
  if (depth > 8) throw new Error(`var() chain too deep: ${value}`);
  const m = /^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*(.+))?\)$/.exec(value.trim());
  if (!m) return value.trim();
  const hit = map[m[1]!];
  if (hit !== undefined) return resolveVars(hit, map, depth + 1);
  if (m[2] !== undefined) return resolveVars(m[2], map, depth + 1);
  throw new Error(`undefined custom property ${m[1]} (in ${value})`);
}
