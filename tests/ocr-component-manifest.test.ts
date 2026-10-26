// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// The OCR component manifest is what the build bundles and the app checks
// (owner decision 19-10: bundled in every build, no download). This pins the
// tooling that fills it in and the shape of the shipped copy:
// macOS (both architectures) and Windows x64 only, the four required
// languages, a licence text per notice, and no way to publish with a gap.

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MANIFEST_PATH,
  pinLanguages,
  pinPlatform,
  sha256File,
  unpinned,
} from '../scripts/ocr-component/write-manifest.mjs';

interface FileEntry { path: string; sha256: string; size: number; executable: boolean }
interface Manifest {
  published: boolean;
  notices: Array<{ name: string; license: string; file: string }>;
  platforms: Record<string, { binary: string; files: FileEntry[] }>;
  languages: Record<string, { path: string; sha256: string; size: number }>;
}

const shipped = (): Manifest => JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;

const made: string[] = [];
afterEach(() => { for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true }); });

function stage(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'pdfluent-ocr-manifest-'));
  made.push(dir);
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  return dir;
}

describe('the shipped OCR component manifest', () => {
  it('offers the platforms the editor ships on and nothing else', () => {
    expect(Object.keys(shipped().platforms).sort()).toEqual(['macos-aarch64', 'macos-x86_64', 'windows-x86_64']);
  });

  it('offers at least English, Dutch, German and French', () => {
    for (const code of ['eng', 'nld', 'deu', 'fra']) expect(shipped().languages[code]).toBeDefined();
  });

  it('carries the Tesseract and language-data licences inside every platform', () => {
    const m = shipped();
    expect(m.notices.find((n) => n.name === 'Tesseract OCR')?.license).toBe('Apache-2.0');
    expect(m.notices.find((n) => n.name.startsWith('tessdata'))?.license).toBe('Apache-2.0');
    for (const entry of Object.values(m.platforms)) {
      for (const n of m.notices) expect(entry.files.map((f) => f.path)).toContain(n.file);
    }
  });

  it('is published, and every platform file and language pack is pinned to real bytes', () => {
    const m = shipped();
    expect(m.published).toBe(true);
    expect(unpinned(m)).toEqual([]);
    const pins = [
      ...Object.values(m.platforms).flatMap((p) => p.files),
      ...Object.values(m.languages),
    ];
    for (const p of pins) {
      expect(p.sha256, p.path).toMatch(/^[0-9a-f]{64}$/);
      expect(p.size, p.path).toBeGreaterThan(0);
    }
    // No two different binaries share a pin: a copy-pasted hash would pass the checks above.
    const binaries = Object.values(m.platforms).map((p) => p.files.find((f) => f.path === p.binary)!.sha256);
    expect(new Set(binaries).size).toBe(binaries.length);
    // The reviewed slices (22-10, builds under /Volumes/PDFluent-Builds): changing one is a decision, not a drive-by.
    const expected: Record<string, [string, string, number]> = {
      'windows-x86_64': ['bin/tesseract.exe', 'f9b183002daaecf3e57eca7d4c95eebcfd9eb5ab96b631ba95d77d197f17b990', 5225984],
      'macos-aarch64': ['bin/tesseract', '9211613f4a653334fb3d30e089c1aa3705bf494ef3ca0807799ccccba003e317', 5354720],
      'macos-x86_64': ['bin/tesseract', 'be2fbfd4d78bc46e8aae19cf620575aeac4aa8fbd10a0fbdbc383c3a043e281c', 5622544],
    };
    for (const [key, [path, sha, size]] of Object.entries(expected)) {
      const f = m.platforms[key]!.files.find((x) => x.path === path)!;
      expect({ sha256: f.sha256, size: f.size }, key).toEqual({ sha256: sha, size });
    }
  });

  it('stops being publishable the moment one pin is blanked or one hash is malformed', () => {
    const blank = shipped();
    blank.platforms['macos-aarch64']!.files[0]!.sha256 = '';
    expect(unpinned(blank)).toContain('macos-aarch64/' + blank.platforms['macos-aarch64']!.files[0]!.path);
    const empty = shipped();
    empty.languages['eng']!.size = 0;
    expect(unpinned(empty)).toContain('tessdata/eng');
  });
});

describe('write-manifest', () => {
  it('pins hash and size of every file from the build output', () => {
    const m = shipped();
    for (const f of m.platforms['macos-aarch64']!.files) { f.sha256 = ''; f.size = 0; }
    const files = Object.fromEntries(m.platforms['macos-aarch64']!.files.map((f) => [f.path, `content of ${f.path}`]));
    const dir = stage(files);
    pinPlatform(m, 'macos-aarch64', dir);
    for (const f of m.platforms['macos-aarch64']!.files) {
      expect(f.sha256).toBe(sha256File(join(dir, f.path)));
      expect(f.size).toBe(`content of ${f.path}`.length);
    }
    // The pins of the file just pinned come from the staged bytes, not from the shipped manifest.
    expect(m.platforms['macos-aarch64']!.files[0]!.sha256).toBe(sha256File(join(dir, m.platforms['macos-aarch64']!.files[0]!.path)));
  });

  it('fails on a file the build did not produce instead of pinning a gap', () => {
    const m = shipped();
    const dir = stage({ 'bin/tesseract': 'x' });
    expect(() => pinPlatform(m, 'macos-aarch64', dir)).toThrow();
  });

  it('becomes publishable once every platform and language is pinned', () => {
    const m = shipped();
    for (const key of Object.keys(m.platforms)) {
      pinPlatform(m, key, stage(Object.fromEntries(m.platforms[key]!.files.map((f) => [f.path, key + f.path]))));
    }
    pinLanguages(m, stage(Object.fromEntries(Object.values(m.languages).map((l) => [l.path, l.path]))));
    expect(unpinned(m)).toEqual([]);
  });

  it('has no download vocabulary: no host path, no consent version, no upload list', () => {
    const m = shipped() as unknown as Record<string, unknown>;
    expect(m['base_path']).toBeUndefined();
    expect(m['consent_text_version']).toBeUndefined();
    expect(readFileSync(new URL('../scripts/ocr-component/write-manifest.mjs', import.meta.url), 'utf8'))
      .not.toMatch(/uploadList|--upload-list/);
  });
});
