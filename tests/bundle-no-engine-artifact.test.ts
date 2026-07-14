// SPDX-License-Identifier: LicenseRef-PDFluent-Proprietary
// Copyright (c) 2026 Innovation Trigger B.V.
//
// SDK-protection guard: the XFA Rust SDK crates (the PDF engine) are statically
// linked into the pdfluent-desktop binary. Nothing separable should ever ship
// alongside the app — that would let someone lift the engine out of the app
// bundle and reuse it elsewhere, which LICENSE.md §3 forbids and which this
// test exists to make structurally hard to do by accident.
//
// This fails if a separable engine artifact (a *.dylib/*.so/*.dll/*.wasm from
// the XFA crates) ever lands in tauri.conf.json's bundle.resources, or in the
// resources/bin directory that ships inside the app bundle. It does NOT forbid
// bundling ordinary helper binaries (e.g. the translate helper) — those are
// small native executables, not the engine itself.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TAURI_ROOT = join(ROOT, 'src-tauri');

const ENGINE_ARTIFACT_EXTENSIONS = ['.dylib', '.so', '.dll', '.wasm'];

function hasEngineArtifactExtension(name: string): boolean {
  return ENGINE_ARTIFACT_EXTENSIONS.some(ext => name.toLowerCase().endsWith(ext));
}

describe('SDK-protection: no separable engine artifact ships in the bundle', () => {
  it('tauri.conf.json bundle.resources contains no engine-artifact file', () => {
    const conf = JSON.parse(readFileSync(join(TAURI_ROOT, 'tauri.conf.json'), 'utf8'));
    const resources: Record<string, string> = conf.bundle?.resources ?? {};
    const hits = Object.entries(resources)
      .flatMap(([src, dest]) => [src, dest])
      .filter(hasEngineArtifactExtension);
    expect(hits, `bundle.resources references an engine artifact: ${hits.join(', ')}`).toEqual([]);
  });

  it('resources/bin contains no engine-artifact file', () => {
    const dir = join(TAURI_ROOT, 'resources', 'bin');
    if (!existsSync(dir)) return; // nothing to check
    const hits = readdirSync(dir).filter(hasEngineArtifactExtension);
    expect(hits, `resources/bin contains an engine artifact: ${hits.join(', ')}`).toEqual([]);
  });
});
