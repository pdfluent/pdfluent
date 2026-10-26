// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * Contrast of every foreground/background pair the UI paints, in light, dark
 * and the Windows tints, checked against WCAG 2.2 AA (text 4.5:1, large text and
 * UI components 3:1).
 *
 * The table below reads each pair from the component's own CSS rule, not from
 * a list of token names, so it cannot drift from what ships: change the colour
 * of `.pfv3 .v3-warning` and the pair changes with it. A rule that stops
 * declaring a colour fails with "no colour declared" instead of passing.
 * Tailwind/shadcn surfaces (update banner) are written as token pairs.
 *
 * Why this exists: a dark-mode banner shipped at 1.9:1 because the colours were
 * literals (#92400e) in a rule that never saw the dark tokens, and Settings ->
 * dark on a light OS left the shadcn tokens light. The rendered-page gate is
 * tests/e2e/contrast.spec.ts; this one is fast and names the token to fix.
 *
 * The guard is itself checked: tests at the bottom prove the maths on known
 * pairs and that darkening a token makes a pair fail.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  composite,
  contrastRatio,
  declared,
  hex,
  parseColor,
  readRules,
  resolveVars,
  varsOf,
  type Rgba,
  type Rule,
  type VarMap,
} from './helpers/wcag';

const SRC = join(__dirname, '..', 'src');
const read = (rel: string): string => readFileSync(join(SRC, rel), 'utf8');

// Load order is the order of the imports in src/main.tsx.
const FILES = [
  'styles/tokens.css',
  'styles/global.css',
  ...readdirSync(join(SRC, 'styles/viewer')).filter((f) => f.endsWith('.css')).sort().map((f) => `styles/viewer/${f}`),
  'styles/magic-patterns.css',
  'styles/viewer-v3.css',
];

export function buildRules(overrides: Record<string, (css: string) => string> = {}): Rule[] {
  const all: Rule[] = [];
  for (const f of FILES) {
    const css = overrides[f] ? overrides[f]!(read(f)) : read(f);
    for (const r of readRules(css)) all.push({ ...r, order: all.length });
  }
  return all;
}

// ---------------------------------------------------------------------------
// Themes: which custom properties are live where
// ---------------------------------------------------------------------------

type ThemeName = 'light' | 'dark' | 'dark-by-setting' | 'windows-light' | 'windows-dark';
type Scope = 'root' | 'pfv3';

const ROOT_LIGHT = [':root'];
const WIN_LIGHT = [':root[data-platform="windows"]'];
const ROOT_DARK_OS = [':root:not(.theme-light)'];
const WIN_DARK_OS = [':root[data-platform="windows"]:not(.theme-light)'];
const ROOT_DARK_CLASS = [':root.theme-dark', '.dark'];
const WIN_DARK_CLASS = [':root[data-platform="windows"].theme-dark'];
const V3_LIGHT = ['.pfv3'];
const V3_DARK = ['.pfv3.theme-dark'];

export function themeVars(rules: Rule[], theme: ThemeName, scope: Scope): VarMap {
  const layers: string[][] = [ROOT_LIGHT];
  if (theme === 'windows-light') layers.push(WIN_LIGHT);
  if (theme === 'dark') layers.push(ROOT_DARK_OS);
  if (theme === 'windows-dark') layers.push(WIN_LIGHT, ROOT_DARK_OS, WIN_DARK_OS);
  if (theme === 'dark-by-setting') layers.push(ROOT_DARK_CLASS);
  const dark = theme === 'dark' || theme === 'dark-by-setting' || theme === 'windows-dark';
  if (scope === 'pfv3') {
    layers.push(V3_LIGHT);
    if (dark) layers.push(V3_DARK);
  }
  // Rule order inside a layer is source order; layers apply in the order above.
  // (Equal-specificity ties between files do not change any pair measured here.)
  return Object.assign({}, ...layers.map((sels) => varsOf(rules, sels)));
}

// ---------------------------------------------------------------------------
// The pair table
// ---------------------------------------------------------------------------

/** A colour: a selector's own declaration, a token, or a literal; optionally translucent. */
type Ref = string | { sel: string; prop: string; alpha?: number } | { token: string; alpha?: number };

interface Pair {
  /** Where on screen, in words a designer would use. */
  component: string;
  scope: Scope;
  fg: Ref;
  /** Layers painted bottom to top; the first is the surface the component sits on. */
  bg: Ref[];
  /** WCAG threshold: 4.5 text, 3 for large text, icons and component boundaries. */
  min: 4.5 | 3;
  /** Themes this pair does not apply to, with the reason. */
  skip?: Partial<Record<ThemeName, string>>;
}

const WORKSPACE: Ref = { token: '--workspace' };
const PANEL: Ref = { token: '--panel' };
const WARN_BG: Ref = { sel: '.pfv3 .v3-warning', prop: 'background' };

const sel = (s: string, prop: string, alpha?: number): Ref => ({ sel: s, prop, ...(alpha === undefined ? {} : { alpha }) });

export const PAIRS: Pair[] = [
  // ── Document banners ─────────────────────────────────────────────────────
  { component: 'XFA banner: title', scope: 'pfv3', fg: sel('.pfv3 .v3-warning', 'color'), bg: [WORKSPACE, WARN_BG], min: 4.5 },
  { component: 'XFA banner: body text', scope: 'pfv3', fg: sel('.pfv3 .v3-warning p', 'color'), bg: [WORKSPACE, WARN_BG], min: 4.5 },
  { component: 'XFA banner: failure line', scope: 'pfv3', fg: sel('.pfv3 .v3-warning p.warning-error', 'color'), bg: [WORKSPACE, WARN_BG], min: 4.5 },
  { component: 'XFA banner: badge', scope: 'pfv3', fg: sel('.pfv3 .v3-warning', 'color'), bg: [WORKSPACE, WARN_BG, sel('.pfv3 .v3-warning .badge', 'background')], min: 4.5 },
  { component: 'XFA banner: convert button', scope: 'pfv3', fg: sel('.pfv3 .warning-action', 'color'), bg: [sel('.pfv3 .warning-action', 'background')], min: 4.5 },
  { component: 'XFA banner: close button', scope: 'pfv3', fg: sel('.pfv3 .warning-secondary', 'color'), bg: [WORKSPACE, WARN_BG, sel('.pfv3 .warning-secondary', 'background')], min: 4.5 },
  { component: 'Form-script consent bar: message', scope: 'pfv3', fg: sel('.pfv3 .v3-script-bar', 'color'), bg: [WORKSPACE, sel('.pfv3 .v3-script-bar', 'background')], min: 4.5 },
  { component: 'Form-script consent bar: detail', scope: 'pfv3', fg: sel('.pfv3 .v3-script-bar .script-bar-sub', 'color'), bg: [WORKSPACE, sel('.pfv3 .v3-script-bar', 'background')], min: 4.5 },
  { component: 'Form-script consent bar: primary button', scope: 'pfv3', fg: sel('.pfv3 .v3-script-bar .script-bar-primary', 'color'), bg: [sel('.pfv3 .v3-script-bar .script-bar-primary', 'background')], min: 4.5 },
  { component: 'Form-script consent bar: secondary button', scope: 'pfv3', fg: sel('.pfv3 .v3-script-bar .script-bar-secondary', 'color'), bg: [sel('.pfv3 .v3-script-bar .script-bar-secondary', 'background')], min: 4.5 },
  { component: 'Form bar: message', scope: 'pfv3', fg: sel('.pfv3 .v3-form-bar', 'color'), bg: [WORKSPACE, sel('.pfv3 .v3-form-bar', 'background')], min: 4.5 },
  { component: 'Form bar: detail', scope: 'pfv3', fg: sel('.pfv3 .v3-form-bar .form-bar-sub', 'color'), bg: [WORKSPACE, sel('.pfv3 .v3-form-bar', 'background')], min: 4.5 },
  { component: 'Form bar: toggle', scope: 'pfv3', fg: sel('.pfv3 .v3-form-bar .form-bar-toggle', 'color'), bg: [sel('.pfv3 .v3-form-bar .form-bar-toggle', 'background')], min: 4.5 },
  { component: 'Form bar: toggle, on', scope: 'pfv3', fg: sel('.pfv3 .v3-form-bar .form-bar-toggle.is-on', 'color'), bg: [sel('.pfv3 .v3-form-bar .form-bar-toggle.is-on', 'background')], min: 4.5 },
  { component: 'Update banner: message', scope: 'root', fg: { token: '--foreground' }, bg: [{ token: '--background' }, { token: '--primary', alpha: 0.1 }], min: 4.5 },
  { component: 'Update banner: version', scope: 'root', fg: { token: '--muted-foreground' }, bg: [{ token: '--background' }, { token: '--primary', alpha: 0.1 }], min: 4.5 },
  { component: 'Update banner: install button', scope: 'root', fg: { token: '--primary-foreground' }, bg: [{ token: '--primary' }], min: 4.5 },
  { component: 'Error text in a dialog (text-destructive) on the app background', scope: 'root', fg: { token: '--destructive' }, bg: [{ token: '--background' }], min: 4.5 },
  { component: 'Error text in a dialog (text-destructive) on a muted surface', scope: 'root', fg: { token: '--destructive' }, bg: [{ token: '--muted' }], min: 4.5 },
  { component: 'Destructive button', scope: 'root', fg: { token: '--destructive-foreground' }, bg: [{ token: '--destructive' }], min: 4.5 },
  { component: 'Open-error panel: title', scope: 'pfv3', fg: sel('.pfv3 .v3-canvas-state.open-error', 'color'), bg: [WORKSPACE], min: 4.5 },
  { component: 'Open-error panel: body', scope: 'pfv3', fg: sel('.pfv3 .open-error-body', 'color'), bg: [WORKSPACE], min: 4.5 },

  // ── Toasts and floating notes ────────────────────────────────────────────
  { component: 'Format row, selected: extension', scope: 'pfv3', fg: sel('.pfv3 .fmt.sel .ext', 'color'), bg: [PANEL, sel('.pfv3 .fmt.sel', 'background')], min: 4.5 },
  { component: 'Toast: text', scope: 'pfv3', fg: sel('.pfv3 .toast', 'color'), bg: [sel('.pfv3 .toast', 'background')], min: 4.5 },
  { component: 'Toast: icon', scope: 'pfv3', fg: sel('.pfv3 .toast svg', 'color'), bg: [sel('.pfv3 .toast', 'background')], min: 3 },
  { component: 'Toast: edge against the canvas', scope: 'pfv3', fg: sel('.pfv3 .toast', 'background'), bg: [WORKSPACE], min: 3 },
  { component: 'Error toast / rejection note: text (app)', scope: 'root', fg: sel('.pf-notice', 'color'), bg: [sel('.pf-notice', 'background')], min: 4.5 },
  { component: 'Error toast / rejection note: text (shell)', scope: 'pfv3', fg: sel('.pf-notice', 'color'), bg: [sel('.pf-notice', 'background')], min: 4.5 },
  { component: 'Error toast: title', scope: 'root', fg: sel('.pf-notice-error .pf-notice-title', 'color'), bg: [sel('.pf-notice', 'background')], min: 4.5 },
  { component: 'Error toast / rejection note: detail', scope: 'root', fg: sel('.pf-notice-sub', 'color'), bg: [sel('.pf-notice', 'background')], min: 4.5 },
  { component: 'Rejection note: code', scope: 'root', fg: sel('.pf-notice-code', 'color'), bg: [sel('.pf-notice', 'background')], min: 4.5 },
  { component: 'Error toast: dismiss icon', scope: 'root', fg: sel('.pf-notice-dismiss', 'color'), bg: [sel('.pf-notice', 'background')], min: 3 },
  { component: 'Floating edit pill: text', scope: 'pfv3', fg: sel('.pfv3 [data-testid="text-edit-floating-pill"]', 'color'), bg: [sel('.pfv3 [data-testid="text-edit-floating-pill"]', 'background')], min: 4.5 },
  { component: 'Floating edit pill: buttons', scope: 'pfv3', fg: sel('.pfv3 [data-testid="text-edit-floating-pill"] button', 'color'), bg: [sel('.pfv3 [data-testid="text-edit-floating-pill"]', 'background')], min: 4.5 },
  { component: 'Floating edit pill: pressed button', scope: 'pfv3', fg: sel('.pfv3 [data-testid="text-edit-floating-pill"] button[aria-pressed="true"]', 'color'), bg: [sel('.pfv3 [data-testid="text-edit-floating-pill"]', 'background'), sel('.pfv3 [data-testid="text-edit-floating-pill"] button[aria-pressed="true"]', 'background')], min: 4.5 },
  { component: 'Floating edit pill: save button', scope: 'pfv3', fg: sel('.pfv3 [data-testid="text-edit-floating-pill"] [data-testid="text-edit-save-btn"]', 'color'), bg: [sel('.pfv3 [data-testid="text-edit-floating-pill"] [data-testid="text-edit-save-btn"]', 'background')], min: 4.5 },
  { component: 'Tooltip on the tool rail', scope: 'pfv3', fg: sel('.pfv3 .rail-btn[data-tip]::before', 'color'), bg: [sel('.pfv3 .rail-btn[data-tip]::before', 'background')], min: 4.5 },

  // ── Menus, palette, dialogs ──────────────────────────────────────────────
  { component: 'Menu item', scope: 'pfv3', fg: sel('.pfv3 .dd-item', 'color'), bg: [sel('.pfv3 .dropdown', 'background')], min: 4.5 },
  { component: 'Menu item: hovered', scope: 'pfv3', fg: sel('.pfv3 .dd-item', 'color'), bg: [sel('.pfv3 .dropdown', 'background'), sel('.pfv3 .dd-item:hover:not(:disabled)', 'background')], min: 4.5 },
  { component: 'Menu item: shortcut / value', scope: 'pfv3', fg: sel('.pfv3 .dd-item .sc', 'color'), bg: [sel('.pfv3 .dropdown', 'background')], min: 4.5 },
  { component: 'Menu item: disabled (policy 3:1)', scope: 'pfv3', fg: sel('.pfv3 .dd-item:disabled', 'color'), bg: [sel('.pfv3 .dropdown', 'background')], min: 3 },
  { component: 'Command palette: input', scope: 'root', fg: sel('.cmdpalette-input', 'color'), bg: [sel('.cmdpalette', 'background')], min: 4.5 },
  { component: 'Command palette: placeholder', scope: 'root', fg: sel('.cmdpalette-input::placeholder', 'color'), bg: [sel('.cmdpalette', 'background')], min: 4.5 },
  { component: 'Command palette: item', scope: 'root', fg: sel('.cmdpalette-item', 'color'), bg: [sel('.cmdpalette', 'background')], min: 4.5 },
  { component: 'Command palette: active item', scope: 'root', fg: sel('.cmdpalette-item-active', 'color'), bg: [sel('.cmdpalette', 'background'), sel('.cmdpalette-item-active', 'background')], min: 4.5 },
  { component: 'Command palette: section title', scope: 'root', fg: sel('.cmdpalette-section-title', 'color'), bg: [sel('.cmdpalette', 'background')], min: 4.5 },

  // ── Panels, status bar, empty states, chrome ─────────────────────────────
  { component: 'Top bar: file name', scope: 'pfv3', fg: sel('.pfv3 .crumb .file', 'color'), bg: [sel('.pfv3 .topbar', 'background')], min: 4.5 },
  { component: 'Top bar: breadcrumb separator', scope: 'pfv3', fg: sel('.pfv3 .crumb .sep', 'color'), bg: [sel('.pfv3 .topbar', 'background')], min: 4.5 },
  { component: 'Brand mark: letter on square', scope: 'pfv3', fg: sel('.pfv3 .brand-mark', 'color'), bg: [sel('.pfv3 .brand-mark', 'background')], min: 4.5 },
  { component: 'Brand mark: square on top bar', scope: 'pfv3', fg: sel('.pfv3 .brand-mark', 'background'), bg: [sel('.pfv3 .topbar', 'background')], min: 3 },
  { component: 'Side panel: secondary text', scope: 'pfv3', fg: { token: '--text-secondary' }, bg: [sel('.pfv3 .rightrail', 'background')], min: 4.5 },
  { component: 'Side panel: muted text', scope: 'pfv3', fg: { token: '--text-muted' }, bg: [sel('.pfv3 .rightrail', 'background')], min: 4.5 },
  { component: 'Side panel: primary text', scope: 'pfv3', fg: { token: '--text-primary' }, bg: [sel('.pfv3 .rightrail', 'background')], min: 4.5 },
  { component: 'Disabled text on a panel (policy 3:1)', scope: 'pfv3', fg: { token: '--text-disabled' }, bg: [PANEL], min: 3 },
  { component: 'Status bar: text', scope: 'root', fg: sel('.bottom-taskbar-label', 'color'), bg: [sel('.bottom-taskbar', 'background')], min: 4.5, skip: {} },
  { component: 'Welcome: heading', scope: 'pfv3', fg: sel('.pfv3', 'color'), bg: [WORKSPACE], min: 4.5 },
  { component: 'Welcome: copy', scope: 'pfv3', fg: sel('.pfv3 .welcome-v3 p', 'color'), bg: [WORKSPACE], min: 4.5 },
  { component: 'Canvas message: error', scope: 'pfv3', fg: sel('.pfv3 .v3-canvas-state.error', 'color'), bg: [WORKSPACE], min: 4.5 },

  // ── Focus, selection, form fields ────────────────────────────────────────
  { component: 'Focus ring on the workspace', scope: 'pfv3', fg: { token: '--focus-ring' }, bg: [WORKSPACE], min: 3 },
  { component: 'Focus ring on a panel', scope: 'pfv3', fg: { token: '--focus-ring' }, bg: [PANEL], min: 3 },
  { component: 'Focus ring on a menu', scope: 'pfv3', fg: { token: '--focus-ring' }, bg: [sel('.pfv3 .dropdown', 'background')], min: 3 },
  { component: 'Focus ring on the warning banner', scope: 'pfv3', fg: { token: '--focus-ring' }, bg: [WORKSPACE, WARN_BG], min: 3 },
  { component: 'Focus ring on the edit pill', scope: 'pfv3', fg: { token: '--focus-ring-on-page' }, bg: [sel('.pfv3 [data-testid="text-edit-floating-pill"]', 'background')], min: 3 },
  { component: 'Link text on a panel', scope: 'pfv3', fg: { token: '--link' }, bg: [PANEL], min: 4.5 },
  { component: 'Link text on the warning banner', scope: 'pfv3', fg: { token: '--link' }, bg: [WORKSPACE, WARN_BG], min: 4.5, skip: { light: 'links are not used in banners', dark: 'links are not used in banners', 'dark-by-setting': 'links are not used in banners', 'windows-light': 'links are not used in banners', 'windows-dark': 'links are not used in banners' } },
  { component: 'Highlighted form-field border on the page', scope: 'pfv3', fg: { token: '--selection-on-page-strong' }, bg: ['#ffffff'].map((c) => c as Ref), min: 3 },
  { component: 'Selected-text highlight: black text on it, over the page', scope: 'pfv3', fg: '#000000', bg: ['#ffffff', { token: '--selection-text-bg' }], min: 4.5 },
];

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

function colourOf(ref: Ref, rules: Rule[], vars: VarMap, under: Rgba): Rgba {
  let raw: string;
  let alpha = 1;
  if (typeof ref === 'string') {
    raw = ref;
  } else if ('token' in ref) {
    raw = resolveVars(`var(${ref.token})`, vars);
    alpha = ref.alpha ?? 1;
  } else {
    const v = declared(rules, ref.sel, ref.prop);
    if (v === null) throw new Error(`no ${ref.prop} declared by "${ref.sel}"`);
    // `background: <colour>` shorthand with extra parts is not used; a gradient or image would be caught here.
    raw = resolveVars(v, vars);
    alpha = ref.alpha ?? 1;
  }
  const c = parseColor(raw);
  return composite([c[0], c[1], c[2], c[3] * alpha], under);
}

export function measurePair(pair: Pair, rules: Rule[], theme: ThemeName): { ratio: number; fg: string; bg: string } {
  const vars = themeVars(rules, theme, pair.scope);
  // The page behind everything is the document canvas colour for that scope.
  let surface: Rgba = parseColor(resolveVars('var(--bg-canvas, #ffffff)', vars));
  surface = [surface[0], surface[1], surface[2], 1];
  for (const layer of pair.bg) surface = colourOf(layer, rules, vars, surface);
  const fg = colourOf(pair.fg, rules, vars, surface);
  return { ratio: contrastRatio(fg, surface), fg: hex(fg), bg: hex(surface) };
}

const THEMES: ThemeName[] = ['light', 'dark', 'dark-by-setting', 'windows-light', 'windows-dark'];
const RULES = buildRules();

describe('contrast pairs: every foreground/background the UI paints', () => {
  it('reads a believable number of pairs (the table did not go quiet)', () => {
    expect(PAIRS.length).toBeGreaterThan(50);
    expect(RULES.length).toBeGreaterThan(800);
  });

  describe.each(THEMES)('%s', (theme) => {
    it.each(PAIRS.filter((p) => !p.skip?.[theme]).map((p) => [p.component, p] as const))('%s', (_name, pair) => {
      const { ratio, fg, bg } = measurePair(pair, RULES, theme);
      expect(
        ratio,
        `${pair.component} in ${theme}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1, needs ${pair.min}:1`,
      ).toBeGreaterThanOrEqual(pair.min);
    });
  });

  it('dark by OS preference and dark by Settings resolve every pair identically', () => {
    const diffs: string[] = [];
    for (const pair of PAIRS) {
      const a = measurePair(pair, RULES, 'dark');
      const b = measurePair(pair, RULES, 'dark-by-setting');
      if (a.fg !== b.fg || a.bg !== b.bg) diffs.push(`${pair.component}: OS ${a.fg} on ${a.bg}, Settings ${b.fg} on ${b.bg}`);
    }
    expect(
      diffs,
      'choosing dark in Settings on a light OS must paint what a dark OS paints (tokens.css keeps the two dark blocks in step)',
    ).toEqual([]);
  });

  it('the two dark blocks in tokens.css declare the same custom properties', () => {
    const rules = RULES;
    const os = varsOf(rules, ROOT_DARK_OS);
    const cls = varsOf(rules, ROOT_DARK_CLASS);
    expect(Object.keys(cls).sort()).toEqual(Object.keys(os).sort());
    for (const k of Object.keys(os)) expect(cls[k], k).toBe(os[k]);
    const osWin = varsOf(rules, WIN_DARK_OS);
    const clsWin = varsOf(rules, WIN_DARK_CLASS);
    expect(clsWin).toEqual(osWin);
  });

  it('no banner, toast or pill rule paints a literal colour any more', () => {
    const selectors = [
      '.pfv3 .v3-warning', '.pfv3 .v3-warning .badge', '.pfv3 .v3-warning p', '.pfv3 .v3-warning p.warning-error',
      '.pfv3 .warning-action', '.pfv3 .warning-secondary', '.pfv3 .toast', '.pfv3 .toast svg',
      '.pfv3 [data-testid="text-edit-floating-pill"]', '.pfv3 [data-testid="text-edit-floating-pill"] button',
      '.pfv3 [data-testid="text-edit-floating-pill"] [data-testid="text-edit-save-btn"]',
      '.pfv3 .rail-btn[data-tip]::before', '.pf-notice',
    ];
    const literals: string[] = [];
    for (const s of selectors) {
      for (const prop of ['color', 'background', 'border']) {
        const v = declared(RULES, s, prop);
        if (v && /#[0-9a-f]{3,8}\b|rgba?\(/i.test(v) && !/var\(/.test(v)) literals.push(`${s} { ${prop}: ${v} }`);
      }
    }
    expect(literals, 'a literal colour in these rules cannot follow the theme: use a token from tokens.css').toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The guard checks itself
// ---------------------------------------------------------------------------

describe('contrast pairs: the guard itself', () => {
  it('computes known ratios', () => {
    expect(contrastRatio(parseColor('#000000'), parseColor('#ffffff'))).toBeCloseTo(21, 1);
    expect(contrastRatio(parseColor('#777777'), parseColor('#ffffff'))).toBeCloseTo(4.48, 1);
    expect(contrastRatio(parseColor('#92400e'), parseColor('#2a221a'))).toBeLessThan(2.3); // the banner the owner reported
  });

  it('composites a translucent layer', () => {
    const c = composite(parseColor('rgba(255, 255, 255, 0.5)'), parseColor('#000000'));
    expect(hex(c)).toBe('#808080');
  });

  it('fails when a token is darkened (mutation check)', () => {
    const mutated = buildRules({
      'styles/tokens.css': (css) => css.replace(/--notice-warn-fg: #fcd9a0;/g, '--notice-warn-fg: #3a2a10;'),
    });
    const pair = PAIRS.find((p) => p.component === 'XFA banner: title')!;
    expect(measurePair(pair, RULES, 'dark').ratio).toBeGreaterThanOrEqual(4.5);
    expect(measurePair(pair, mutated, 'dark').ratio).toBeLessThan(4.5);
    expect(measurePair(pair, mutated, 'dark-by-setting').ratio).toBeLessThan(4.5);
  });

  it('fails when a rule goes back to a literal colour (mutation check)', () => {
    const mutated = buildRules({
      'styles/viewer-v3.css': (css) => css.replace('color: var(--notice-warn-fg);', 'color: #92400e;'),
    });
    const pair = PAIRS.find((p) => p.component === 'XFA banner: title')!;
    expect(measurePair(pair, mutated, 'dark').ratio).toBeLessThan(4.5);
  });

  it('refuses to pass on a rule that declares no colour', () => {
    const pair: Pair = { component: 'x', scope: 'pfv3', fg: sel('.does-not-exist', 'color'), bg: [WORKSPACE], min: 4.5 };
    expect(() => measurePair(pair, RULES, 'light')).toThrow(/no color declared/);
  });
});
