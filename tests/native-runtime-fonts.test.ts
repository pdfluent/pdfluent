// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('..', import.meta.url);
const tauriConfig = JSON.parse(
  readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
) as {
  bundle?: { resources?: string[] | Record<string, string> };
  app?: { security?: { csp?: string } };
};

/** Tauri resources may be an array (paths) or a map (source → bundle dest). */
function resourceSources(resources?: string[] | Record<string, string>): string[] {
  if (!resources) return [];
  return Array.isArray(resources) ? resources : Object.keys(resources);
}
const rustLibSource = readFileSync(
  new URL('../src-tauri/src/lib.rs', import.meta.url),
  'utf8',
);
const packageJsonSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
const packageLockSource = readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8');

describe('native runtime contract', () => {
  it('does not ship browser PDF runtime assets or dependencies', () => {
    expect(packageJsonSource).not.toMatch(/xfa-wasm|wasm:build|wasm:check(?!-artifacts)/);
    expect(packageLockSource).not.toContain('xfa-wasm');
    expect(existsSync(new URL('../public/xfa_wasm_bg.wasm', import.meta.url))).toBe(false);
    expect(existsSync(new URL('../src/core/engine/wasm', import.meta.url))).toBe(false);
  });

  it('keeps CSP free of script eval allowances for browser PDF runtimes', () => {
    const csp = tauriConfig.app?.security?.csp ?? '';
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain('wasm-unsafe-eval');
    expect(csp).not.toContain("'unsafe-eval'");
  });
});

describe('Liberation font bundle', () => {
  const fontDir = new URL('../src-tauri/resources/fonts/liberation-2.1.5/', import.meta.url);

  it('bundles the Liberation 2.1.5 font directory as a Tauri resource', () => {
    expect(resourceSources(tauriConfig.bundle?.resources)).toContain('resources/fonts/liberation-2.1.5');
  });

  it('ships the official Liberation 2.1.5 TTF set and license', () => {
    const files = readdirSync(fontDir).sort();
    expect(files).toEqual(expect.arrayContaining([
      'LICENSE',
      'LiberationMono-Bold.ttf',
      'LiberationMono-BoldItalic.ttf',
      'LiberationMono-Italic.ttf',
      'LiberationMono-Regular.ttf',
      'LiberationSans-Bold.ttf',
      'LiberationSans-BoldItalic.ttf',
      'LiberationSans-Italic.ttf',
      'LiberationSans-Regular.ttf',
      'LiberationSerif-Bold.ttf',
      'LiberationSerif-BoldItalic.ttf',
      'LiberationSerif-Italic.ttf',
      'LiberationSerif-Regular.ttf',
    ]));
    expect(files.filter((file) => file.endsWith('.ttf')).length).toBe(12);
  });

  it('wires the bundled font directory into the XFA font resolver cache', () => {
    expect(rustLibSource).toContain('configure_bundled_font_cache');
    expect(rustLibSource).toContain('XFA_FONT_CACHE');
    expect(rustLibSource).toContain('liberation-2.1.5');
  });

  it('keeps fonts as app resources, not SDK source files', () => {
    expect(fontDir.pathname).toContain('/pdfluent-v3/src-tauri/resources/fonts/');
    expect(new URL('../src-tauri/resources/fonts/liberation-2.1.5/LICENSE', import.meta.url).pathname)
      .toContain('/pdfluent-v3/');
    expect(root.pathname).toContain('/PDFluent/pdfluent-v3/');
  });
});
