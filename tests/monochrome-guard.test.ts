// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * Monochrome guard.
 *
 * The brand is monochrome; blue is a functional micro-accent (focus ring, link,
 * selection) and nothing else. docs/design/MONOCHROME_MIGRATION.md has the
 * history. This file keeps it that way:
 *
 *  1. No blue colour value (hex, rgb(), hsl(), a named colour) and no blue
 *     Tailwind class anywhere in src/ except src/styles/tokens.css.
 *     A line that paints DOCUMENT content (a highlight swatch, signature ink)
 *     carries `monochrome-allow: <reason>` and is listed in the register below,
 *     so every exception is counted and has a reason.
 *     The same goes for rainbow Tailwind hues (purple, pink, teal, orange,
 *     yellow, ...) and for any `backdrop-filter`: surfaces are flat. Status hues
 *     (red, green, emerald, amber) stay available for error/success/warning.
 *  2. Blue tokens (--focus-*, --link*, --selection*) are never used on a
 *     button, tab, tool or call to action, except as that control's focus ring.
 *  3. The token pairs meet WCAG AA in light and dark: text 4.5:1, focus ring
 *     and selection 3:1.
 *  4. The dark block is declared once per selector family and the copies agree.
 *
 * The detector is itself tested against known blues and known greys: a scanner
 * that quietly stops matching produces a green run that measures nothing.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative as relativePath, sep } from 'node:path';

// Paths are compared and reported with '/', whatever the platform joins with.
const relative = (from: string, to: string): string => relativePath(from, to).split(sep).join('/');
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');
const TOKEN_FILE = 'src/styles/tokens.css';

// ---------------------------------------------------------------------------
// Colour maths
// ---------------------------------------------------------------------------

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  let h = hex.replace('#', '');
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function hsl([r, g, b]: Rgb): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const mx = Math.max(rn, gn, bn);
  const mn = Math.min(rn, gn, bn);
  const d = mx - mn;
  const l = (mx + mn) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (mx === rn) h = ((gn - bn) / d) % 6;
    else if (mx === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

/** Blue means: cyan-to-indigo hue, clearly saturated, not near-black or near-white. */
export function isBlueHsl(h: number, s: number, l: number): boolean {
  return h >= 185 && h <= 265 && s >= 0.45 && l >= 0.15 && l <= 0.95;
}

function luminance([r, g, b]: Rgb): number {
  const lin = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `rgba(...)` token composited over an opaque backdrop. */
function over(fg: string, backdrop: Rgb): Rgb {
  const m = /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/.exec(fg);
  if (!m) return hexToRgb(fg);
  const a = Number(m[4]);
  return [0, 1, 2].map((i) => Math.round(Number(m[i + 1]) * a + backdrop[i]! * (1 - a))) as Rgb;
}

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

const BLUE_NAMES =
  /\b(?:blue|navy|royalblue|dodgerblue|deepskyblue|cornflowerblue|steelblue|slateblue|midnightblue|cadetblue|skyblue|cyan|indigo)\b(?!-)/i;
const TW_BLUE =
  /(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border|ring|from|to|via|fill|stroke|outline|accent|divide|shadow|decoration|caret|placeholder)-(?:blue|sky|indigo|cyan|violet|purple|pink|teal|orange|yellow|lime|rose|fuchsia)-\d{2,3}\b(?:\/\d+)?/;

export interface Hit {
  line: number;
  text: string;
  value: string;
}

/** Every blue colour value on a line. Pure, so it can be tested on its own. */
export function blueValuesOnLine(line: string): string[] {
  const out: string[] = [];
  for (const m of line.matchAll(/#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_-])/g)) {
    const [h, s, l] = hsl(hexToRgb(m[0]));
    if (isBlueHsl(h, s, l)) out.push(m[0]);
  }
  for (const m of line.matchAll(/rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/g)) {
    const [h, s, l] = hsl([Number(m[1]), Number(m[2]), Number(m[3])]);
    if (isBlueHsl(h, s, l)) out.push(m[0] + ')');
  }
  for (const m of line.matchAll(/hsla?\(\s*([\d.]+)(?:deg)?\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%/g)) {
    if (isBlueHsl(Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100)) out.push(m[0] + ')');
  }
  const tw = TW_BLUE.exec(line);
  if (tw) out.push(tw[0]);
  return out;
}

/** Blue colour NAMES (`color: blue`) only where a CSS/JS colour is being set. */
function namedBlueOnLine(line: string): string[] {
  if (!/(?:color|background|border|fill|stroke|outline|shadow)\s*[:=]/i.test(line)) return [];
  if (/var\(--|monochrome-allow/.test(line)) return [];
  const m = /:\s*['"]?\s*(blue|navy|royalblue|dodgerblue|deepskyblue|cornflowerblue|steelblue|slateblue|midnightblue|skyblue)\b/i.exec(line);
  return m && BLUE_NAMES.test(m[1]!) ? [m[1]!] : [];
}

/** A blurred or frosted surface. The design system is flat. */
export function glassOnLine(line: string): string[] {
  const m = /(?:-webkit-)?backdrop-?filter|backdropFilter/i.exec(line);
  return m ? [m[0]] : [];
}

const ALLOW = /monochrome-allow:\s*(\S.{6,})/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      walk(p, out);
    } else if (/\.(css|tsx?|html|svg)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

function scanFile(path: string): { hits: Hit[]; allowed: Hit[]; badAllow: Hit[] } {
  const hits: Hit[] = [];
  const allowed: Hit[] = [];
  const badAllow: Hit[] = [];
  const lines = readFileSync(path, 'utf8').split('\n');
  lines.forEach((text, i) => {
    const values = [...blueValuesOnLine(text), ...namedBlueOnLine(text), ...glassOnLine(text)];
    if (/monochrome-allow/.test(text) && !ALLOW.test(text)) {
      badAllow.push({ line: i + 1, text: text.trim(), value: 'monochrome-allow without a reason' });
    }
    if (values.length === 0) return;
    const entry = { line: i + 1, text: text.trim().slice(0, 140), value: values.join(' ') };
    // The marker may sit on the line itself or on the line above.
    if (ALLOW.test(text) || (i > 0 && ALLOW.test(lines[i - 1]!))) allowed.push(entry);
    else hits.push(entry);
  });
  return { hits, allowed, badAllow };
}

// ---------------------------------------------------------------------------
// The detector, tested against known colours
// ---------------------------------------------------------------------------

describe('monochrome guard: the detector itself', () => {
  it.each([
    '#0a66ff',
    '#4d94ff',
    '#2563eb',
    '#3b82f6',
    '#0a58d8',
    '#1d4ed8',
    '#86b6ff',
    '#06f',
    'rgba(10, 102, 255, 0.14)',
    'rgb(37 99 235)',
    'rgba(59,130,246,0.55)',
    'hsl(215 100% 60%)',
    'hsl(215, 100%, 62%)',
    'text-blue-600',
    'hover:bg-blue-500/20',
    'dark:text-sky-400',
    'ring-indigo-500',
  ])('flags %s', (v) => {
    expect(blueValuesOnLine(`x: ${v};`).length).toBeGreaterThan(0);
  });

  it.each([
    '#1a1a1a',
    '#ffffff',
    '#f2f2f2',
    '#5f6370',
    '#7b808f',
    '#ccd1dc',
    '#656a77',
    '#16a34a',
    '#d97706',
    '#dc2626',
    '#0e0e12',
    'rgba(26, 26, 26, 0.08)',
    'rgba(22, 27, 38, 0.1)', // slate shadow tint, not a blue
    'hsl(0 0% 91%)',
    'bg-black',
    'text-muted-foreground',
    'bg-primary',
    'text-pf-accent',
    'border-blueprint', // a word that merely contains blue
  ])('lets %s through', (v) => {
    expect(blueValuesOnLine(`x: ${v};`)).toEqual([]);
  });

  it.each(['text-purple-600', 'bg-pink-500/20', 'dark:text-teal-400', 'hover:text-orange-500', 'text-yellow-600'])(
    'flags the rainbow class %s',
    (v) => expect(blueValuesOnLine(`c: '${v}'`).length).toBeGreaterThan(0),
  );

  it.each(['text-red-500', 'bg-green-500', 'text-emerald-700', 'border-amber-500/40', 'text-destructive'])(
    'lets the status class %s through',
    (v) => expect(blueValuesOnLine(`c: '${v}'`)).toEqual([]),
  );

  it.each([
    '  backdrop-filter: blur(24px) saturate(180%);',
    '  -webkit-backdrop-filter: var(--glass-blur);',
    "  backdropFilter: 'blur(2px)',",
  ])('flags a frosted surface: %s', (l) => expect(glassOnLine(l).length).toBeGreaterThan(0));

  it('does not flag a class that merely ends in -backdrop', () => {
    expect(glassOnLine('.app-dialog-backdrop {')).toEqual([]);
    expect(glassOnLine('.pfv3 .modal-backdrop {')).toEqual([]);
  });

  it('flags a named blue only where a colour is being set', () => {
    expect(namedBlueOnLine('  color: blue;')).toEqual(['blue']);
    expect(namedBlueOnLine("  background: 'royalblue',")).toEqual(['royalblue']);
    expect(namedBlueOnLine('// the blue highlight swatch')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 1. No blue outside the token file
// ---------------------------------------------------------------------------

/**
 * Every line that may keep a blue, with the reason. Adding a line to src/ with
 * `monochrome-allow:` raises the count and fails the test below until this
 * register is updated in review. That is the point: the exceptions are visible.
 */
const ALLOWED_PER_FILE: Record<string, number> = {
  'src/components/AnnotationToolbar.tsx': 3, // highlight blue + two shape colour presets
  'src/components/Toolbar.tsx': 1, // highlight blue swatch
  'src/components/Viewer.tsx': 2, // underline annotation preview colour
  'src/viewer/components/RightContextPanel.tsx': 2, // annotation swatch row; text colour palette blue (value and swatch class share a line)
  'src/viewer/v3/EditorV3Shell.tsx': 4, // signature ink: two renders, two colour pickers
  'src/viewer/v3/SignaturePad.tsx': 1, // signature ink
};

describe('monochrome guard: no blue outside src/styles/tokens.css', () => {
  const files = walk(SRC).filter((f) => relative(ROOT, f) !== TOKEN_FILE);

  it('scans a believable number of files (the walk did not go quiet)', () => {
    expect(files.length).toBeGreaterThan(150);
    expect(files.some((f) => f.endsWith('global.css'))).toBe(true);
    expect(files.some((f) => f.endsWith('viewer-v3.css'))).toBe(true);
    expect(files.some((f) => f.endsWith('selectionChrome.ts'))).toBe(true);
  });

  it('has no hard-coded blue value or blue Tailwind class', () => {
    const offenders: string[] = [];
    for (const f of files) {
      for (const h of scanFile(f).hits) {
        offenders.push(`${relative(ROOT, f)}:${h.line}  ${h.value}   ${h.text}`);
      }
    }
    expect(
      offenders,
      'Blue belongs in src/styles/tokens.css only. Use var(--focus-ring), var(--link), ' +
        'var(--selection*) for the three allowed jobs and var(--emphasis) / var(--state-active-bg) ' +
        'for primary and active states. Document-content colours take a ' +
        '`monochrome-allow: <reason>` marker.\n' +
        offenders.join('\n'),
    ).toEqual([]);
  });

  it('every monochrome-allow marker has a reason', () => {
    const bad: string[] = [];
    for (const f of walk(SRC)) {
      for (const h of scanFile(f).badAllow) bad.push(`${relative(ROOT, f)}:${h.line}`);
    }
    expect(bad).toEqual([]);
  });

  it('the allow register matches the code', () => {
    const actual: Record<string, number> = {};
    for (const f of files) {
      const n = scanFile(f).allowed.length;
      if (n > 0) actual[relative(ROOT, f)] = n;
    }
    expect(actual).toEqual(ALLOWED_PER_FILE);
  });

  it('the token file is the only place the brand blue is defined', () => {
    const tokens = readFileSync(join(ROOT, TOKEN_FILE), 'utf8');
    expect(tokens).toContain('--focus-ring: #0a66ff');
    expect(tokens).toContain('--focus-ring: #4d94ff');
    // No legacy "accent" token carrying a blue.
    for (const f of walk(SRC)) {
      const css = f.endsWith('.css') ? readFileSync(f, 'utf8') : '';
      // magic-patterns.css keeps the shadcn --accent, which is a neutral grey.
      expect(css, relative(ROOT, f)).not.toMatch(/--accent-(?:strong|soft|line)\s*:/);
      if (!f.endsWith('magic-patterns.css')) expect(css, relative(ROOT, f)).not.toMatch(/--accent\s*:/);
    }
  });

  it('no stylesheet or component reads a token that no longer exists', () => {
    const gone = /var\(--(?:accent|accent-strong|accent-soft|accent-line|on-primary)\)/;
    const offenders: string[] = [];
    for (const f of walk(SRC)) {
      if (gone.test(readFileSync(f, 'utf8'))) offenders.push(relative(ROOT, f));
    }
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. Blue tokens never fill a control
// ---------------------------------------------------------------------------

const BLUE_TOKENS = /var\(--(?:focus-[a-z-]+|link(?:-hover)?|selection(?:-[a-z-]+)?|caret-on-page)\)/;
const CONTROL_SELECTOR = /(?:btn|button|tab\b|tabs?[-.:\s]|cta|iconbtn|(?<![a-z])rail|toolbar|action|menu|chip|badge)/i;

describe('monochrome guard: blue never paints a control', () => {
  const cssFiles = walk(SRC).filter((f) => f.endsWith('.css') && relative(ROOT, f) !== TOKEN_FILE);

  it('no button, tab, tool or CTA rule uses a blue token outside :focus', () => {
    const offenders: string[] = [];
    for (const f of cssFiles) {
      const css = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
        const selector = m[1]!.trim();
        const body = m[2]!;
        if (!CONTROL_SELECTOR.test(selector) || /:focus/.test(selector)) continue;
        for (const decl of body.split(';')) {
          if (BLUE_TOKENS.test(decl) && !/^\s*--/.test(decl)) {
            offenders.push(`${relative(ROOT, f)}: ${selector.replace(/\s+/g, ' ')} { ${decl.trim()} }`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the controls that should be neutral really use the neutral tokens', () => {
    const v3 = readFileSync(join(SRC, 'styles/viewer-v3.css'), 'utf8');
    const rule = (sel: string): string => {
      const i = v3.indexOf(`${sel} {`);
      expect(i, `rule ${sel} exists`).toBeGreaterThan(-1);
      return v3.slice(i, v3.indexOf('}', i));
    };
    expect(rule('.pfv3 .rail-btn.active')).toContain('var(--emphasis)');
    expect(rule('.pfv3 .menu-tab.active::after')).toContain('var(--emphasis)');
    expect(rule('.pfv3 .iconbtn.on')).toContain('var(--state-active-bg)');
    const g = readFileSync(join(SRC, 'styles/global.css'), 'utf8');
    expect(g).toMatch(/\.btn-primary \{[^}]*background: var\(--emphasis\)/);
    expect(g).toMatch(/\.mode-tab-active::after \{[^}]*background: var\(--emphasis\)/);
  });
});

// ---------------------------------------------------------------------------
// 3. Contrast
// ---------------------------------------------------------------------------

function parseBlock(css: string, header: RegExp): Record<string, string> {
  const m = header.exec(css);
  if (!m) throw new Error(`block not found: ${header}`);
  const start = css.indexOf('{', m.index) + 1;
  let depth = 1;
  let i = start;
  while (depth > 0 && i < css.length) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') depth--;
    i++;
  }
  const body = css.slice(start, i - 1);
  const out: Record<string, string> = {};
  for (const d of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[d[1]!] = d[2]!.trim();
  return out;
}

const tokensCss = readFileSync(join(ROOT, TOKEN_FILE), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const v3Css = readFileSync(join(SRC, 'styles/viewer-v3.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const light = parseBlock(tokensCss, /^:root \{/m);
const darkMedia = parseBlock(tokensCss, /^\s{2}:root:not\(\.theme-light\) \{/m);
const darkClass = parseBlock(tokensCss, /^:root\.theme-dark,/m);
const v3Light = { ...parseBlock(v3Css, /^\.pfv3 \{/m), ...parseBlock(tokensCss, /^\.pfv3 \{/m) };
const v3Dark = {
  ...parseBlock(v3Css, /^\.pfv3\.theme-dark \{/m),
  ...parseBlock(tokensCss, /^\.pfv3\.theme-dark \{\s*--primary/m),
};

type Theme = { name: string; t: Record<string, string>; surfaces: Record<string, string>; page: string };

const themes: Theme[] = [
  {
    name: 'light',
    t: light,
    surfaces: {
      elevated: light['--bg-surface-elevated']!,
      surface: light['--bg-surface']!,
      'surface-2': light['--bg-surface-2']!,
      'v3 panel': v3Light['--panel']!,
      'v3 workspace': v3Light['--workspace']!,
    },
    page: '#ffffff',
  },
  {
    name: 'dark',
    t: { ...light, ...darkMedia },
    surfaces: {
      elevated: darkMedia['--bg-surface-elevated']!,
      surface: darkMedia['--bg-surface']!,
      'surface-2': darkMedia['--bg-surface-2']!,
      'v3 panel': v3Dark['--panel']!,
      'v3 workspace': v3Dark['--workspace']!,
    },
    page: '#ffffff', // a PDF page is white paper in both themes
  },
];

describe.each(themes)('monochrome guard: contrast in $name', ({ t, surfaces, page, name }) => {
  const rgb = (v: string, backdrop: Rgb = [255, 255, 255]): Rgb => over(v, backdrop);
  const text = name === 'light'
    ? { '--text-primary': t['--text-primary']!, '--text-secondary': t['--text-secondary']!, '--text-muted': t['--text-muted']! }
    : { '--text-primary': t['--text-primary']!, '--text-secondary': t['--text-secondary']!, '--text-muted': t['--text-muted']! };

  it('the surface set was read (not an empty pass)', () => {
    for (const [k, v] of Object.entries(surfaces)) expect(v, k).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it.each(Object.keys(text))('%s is 4.5:1 on every surface', (token) => {
    // v3 shell sets its own secondary/muted; use its values on its own surfaces.
    const v3 = name === 'light' ? v3Light : v3Dark;
    for (const [sname, bg] of Object.entries(surfaces)) {
      const fg = sname.startsWith('v3') && v3[token] ? v3[token]! : text[token as keyof typeof text];
      const ratio = contrast(hexToRgb(fg), hexToRgb(bg));
      expect(ratio, `${token} ${fg} on ${sname} ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('links are 4.5:1 on every surface', () => {
    for (const tok of ['--link', '--link-hover']) {
      for (const [sname, bg] of Object.entries(surfaces)) {
        expect(contrast(hexToRgb(t[tok]!), hexToRgb(bg)), `${tok} on ${sname}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('text on the primary action is 4.5:1, including hover', () => {
    expect(contrast(hexToRgb(t['--on-emphasis']!), hexToRgb(t['--emphasis']!))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hexToRgb(t['--on-emphasis']!), hexToRgb(t['--emphasis-hover']!))).toBeGreaterThanOrEqual(4.5);
  });

  it('active-state text is 4.5:1 on its tint over every surface', () => {
    for (const [sname, bg] of Object.entries(surfaces)) {
      const tint = rgb(t['--state-active-bg']!, hexToRgb(bg));
      expect(contrast(hexToRgb(t['--state-active-fg']!), tint), `active on ${sname}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('the focus ring is 3:1 against every surface it can sit on', () => {
    for (const [sname, bg] of Object.entries(surfaces)) {
      expect(contrast(hexToRgb(t['--focus-ring']!), hexToRgb(bg)), `focus ring on ${sname}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('on a PDF page the focus ring and the selection are 3:1 against white paper', () => {
    for (const tok of ['--focus-ring-on-page', '--selection-on-page', '--caret-on-page']) {
      expect(contrast(hexToRgb(light[tok]!), hexToRgb(page)), tok).toBeGreaterThanOrEqual(3);
    }
    // The translucent strokes still have to read on white.
    const strong = rgb(light['--selection-on-page-strong']!, hexToRgb(page));
    const line = rgb(light['--selection-on-page-line']!, hexToRgb(page));
    expect(contrast(strong, hexToRgb(page)), 'selection stroke').toBeGreaterThanOrEqual(3);
    expect(contrast(line, hexToRgb(page)), 'hover/secondary stroke').toBeGreaterThanOrEqual(2);
  });

  it('selected text stays legible: black text on the selection fill is 7:1', () => {
    const fill = rgb(light['--selection-text-bg']!, hexToRgb(page));
    expect(contrast([26, 26, 26], fill)).toBeGreaterThanOrEqual(7);
  });

  it('the selection fill is visible against its surface (1.15:1 or more)', () => {
    for (const [sname, bg] of Object.entries(surfaces)) {
      const fill = rgb(t['--selection-fill']!, hexToRgb(bg));
      expect(contrast(fill, hexToRgb(bg)), `selection fill on ${sname}`).toBeGreaterThanOrEqual(1.15);
    }
  });
});

describe('monochrome guard: dark mode is one block, copied consistently', () => {
  it('.theme-dark / .dark / .pfv3.theme-dark agree with the OS dark block on every shared key', () => {
    const shared = Object.keys(darkClass).filter((k) => k in darkMedia);
    expect(shared.length).toBeGreaterThan(10);
    for (const k of shared) expect(darkClass[k], k).toBe(darkMedia[k]);
  });

  it('dark primary action is near-white on near-black, as specified', () => {
    expect(darkMedia['--emphasis']).toBe('#f2f2f2');
    expect(darkMedia['--on-emphasis']).toBe('#0e0e12');
    expect(darkMedia['--focus-ring']).toBe('#4d94ff');
    expect(darkMedia['--selection']).toBe('#4d94ff');
  });

  it('light primary action is near-black with white text, as specified', () => {
    expect(light['--emphasis']).toBe('#1a1a1a');
    expect(light['--on-emphasis']).toBe('#ffffff');
    expect(light['--focus-ring']).toBe('#0a66ff');
  });
});

// ---------------------------------------------------------------------------
// 4. Icons are monochrome; surfaces are flat
// ---------------------------------------------------------------------------

describe('monochrome guard: icons and surfaces', () => {
  it('tool definitions carry no colour: icons inherit currentColor / text-muted-foreground', () => {
    const src = readFileSync(join(SRC, 'viewer/tools/toolDefinitions.ts'), 'utf8');
    expect(src).not.toMatch(/\bcolor\??:/);
    expect(src).not.toMatch(/text-[a-z]+-\d{2,3}/);
    const panel = readFileSync(join(SRC, 'viewer/components/AllToolsPanel.tsx'), 'utf8');
    expect(panel).not.toMatch(/tool\.color/);
  });

  it('no stylesheet or component blurs what is behind it (backdrop-filter)', () => {
    const offenders: string[] = [];
    for (const f of walk(SRC)) {
      for (const h of scanFile(f).hits) {
        if (glassOnLine(h.text).length > 0) offenders.push(`${relative(ROOT, f)}:${h.line}  ${h.text}`);
      }
    }
    expect(offenders, 'Flat surfaces: opaque fill, hairline border, quiet shadow.').toEqual([]);
  });

  it('the v3 flat surface tokens are opaque (no alpha, no inset highlight)', () => {
    const v3 = readFileSync(join(SRC, 'styles/viewer-v3.css'), 'utf8');
    for (const tok of ['--glass-bg', '--glass-bg-strong', '--lg-bg']) {
      for (const m of v3.matchAll(new RegExp(`${tok}:\\s*([^;]+);`, 'g'))) {
        expect(m[1], tok).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
    expect(v3).not.toMatch(/--(?:glass|lg)-blur/);
    expect(v3).not.toMatch(/--(?:glass|lg)-edge:\s*inset/);
  });
});
