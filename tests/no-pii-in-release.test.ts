// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Personal-data detection is parked: a release build has no UI entry, no
// command and no strings for it. The checker is tested on fixtures that break
// each rule, and the real manifest, command list and shell are held to it.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script without types
import { bundleProblems, handlerProblems, manifestProblems, PII_COMMANDS } from '../scripts/ci/no-pii-in-release.mjs';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('the real tree', () => {
  it('keeps the pii feature out of default', () => {
    expect(manifestProblems(read('src-tauri/Cargo.toml'))).toEqual([]);
  });
  it('registers every personal-data command behind the feature', () => {
    expect(handlerProblems(read('src-tauri/src/lib.rs'))).toEqual([]);
  });
  it('renders the controls only when the build flag is on', () => {
    const shell = read('src/viewer/v3/EditorV3Shell.tsx');
    expect(shell).toContain('{PII_ENABLED ? <PiiControls');
    expect(shell.match(/<PiiControls/g)).toHaveLength(1);
    expect(read('src/viewer/pii/enabled.ts')).toContain("import.meta.env.VITE_PII_ENABLED === '1'");
  });
  it('promises nothing about it', () => {
    const features = JSON.parse(read('product/editor-features.json')) as { features: Array<{ id: string; status: string }> };
    expect(features.features.find((f) => f.id === 'pii-detection')?.status).toBe('not-offered');
  });
});

describe('the checker', () => {
  const cargo = (def: string) => `[features]\ndefault = [${def}]\npii = []\npii-model = ["pii", "dep:ort"]\n[dependencies]\n`;
  it('passes a manifest whose default leaves the feature out', () => {
    expect(manifestProblems(cargo('"custom-protocol"'))).toEqual([]);
  });
  it('fails when default names pii, or a feature that pulls it in', () => {
    expect(manifestProblems(cargo('"pii"'))).toHaveLength(1);
    expect(manifestProblems(cargo('"pii-model"'))).toHaveLength(2);
  });
  it('fails a command registered without its cfg', () => {
    const ok = PII_COMMANDS.map((c: string) => `#[cfg(feature = "pii")]\n#[tauri::command]\nfn ${c}() {}\n`).join('')
      + 'generate_handler![\n' + PII_COMMANDS.map((c: string) => `            #[cfg(feature = "pii")]\n            ${c},\n`).join('') + ']';
    expect(handlerProblems(ok)).toEqual([]);
    const bare = ok.replace('            #[cfg(feature = "pii")]\n            detect_pii,', '            detect_pii,');
    expect(handlerProblems(bare)).toEqual(['detect_pii is registered without #[cfg(feature = "pii")].']);
  });
  it('fails a bundle that names a command or carries the control', () => {
    const dist = mkdtempSync(join(tmpdir(), 'dist-'));
    mkdirSync(join(dist, 'assets'));
    writeFileSync(join(dist, 'assets', 'a.js'), 'invoke("open_pdf")');
    expect(bundleProblems(dist)).toEqual([]);
    writeFileSync(join(dist, 'assets', 'b.js'), 'invoke("detect_pii");h("div",{"data-testid":"pii-controls"})');
    expect(bundleProblems(dist)).toHaveLength(2);
  });
  it('does not call an empty folder clean', () => {
    expect(bundleProblems(mkdtempSync(join(tmpdir(), 'empty-')))).toHaveLength(1);
  });
});
