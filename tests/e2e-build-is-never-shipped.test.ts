// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The journey suite's e2e build (src-tauri/src/e2e.rs) answers native dialogs
// and evaluates scripts from a folder. That is a test seam and must never be
// in an app a user installs. Shipped builds come from the default features and
// the release scripts below; this pins that neither turns `e2e` on.

import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8');

describe('the e2e build is never shipped', () => {
  it('e2e is a feature of its own and not a default one', () => {
    const features = cargo.slice(cargo.indexOf('[features]'));
    const defaults = /^default\s*=\s*\[([^\]]*)\]/m.exec(features);
    expect(defaults, 'no default feature list').not.toBeNull();
    expect(defaults?.[1]).not.toMatch(/e2e/);
    expect(features).toMatch(/^e2e\s*=\s*\[\s*\]/m);
    expect(features).not.toMatch(/^\w[\w-]*\s*=\s*\[[^\]]*"e2e"/m);
  });

  it('no release build, workflow or tauri config names the feature', () => {
    const files = [
      '.github/workflows/release.yml',
      'scripts/build-verified.sh',
      'scripts/release-windows-remote.sh',
      ...readdirSync('src-tauri').filter((f) => /^tauri.*\.conf\.json$/.test(f)).map((f) => `src-tauri/${f}`),
    ];
    for (const f of files) {
      let src = '';
      try { src = readFileSync(f, 'utf8'); } catch { continue; }
      expect(src, f).not.toMatch(/features[^\n]*\be2e\b/);
    }
  });

  it('every e2e hook in the app is behind the feature', () => {
    const lib = readFileSync('src-tauri/src/lib.rs', 'utf8');
    const lines = lib.split('\n');
    lines.forEach((line, i) => {
      if (/\be2e::/.test(line)) {
        const context = lines.slice(Math.max(0, i - 3), i + 1).join('\n');
        expect(context, `lib.rs:${i + 1} uses e2e:: outside #[cfg(feature = "e2e")]`).toMatch(/#\[cfg\(feature = "e2e"\)\]/);
      }
    });
  });

  it('the e2e hooks in the save path are behind the feature too', () => {
    const lines = readFileSync('src-tauri/src/atomic_file.rs', 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (/\be2e::/.test(line) && !/^\s*\/\//.test(line)) {
        const context = lines.slice(Math.max(0, i - 6), i + 1).join('\n');
        expect(context, `atomic_file.rs:${i + 1} uses e2e:: outside #[cfg(feature = "e2e")]`).toMatch(/#\[cfg\(feature = "e2e"\)\]/);
      }
    });
  });
});
