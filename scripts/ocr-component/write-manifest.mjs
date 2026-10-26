// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// Pin the OCR component in the manifest the app compiles in
// (src-tauri/resources/ocr/tesseract-component.json): the SHA-256 and exact
// size of every file, from the files build-tesseract.sh produced -- after
// signing, because the hash is of what ships. ocr-bundle.mjs checks the build
// output against these pins before it bundles anything.
//
// usage:
//   node scripts/ocr-component/write-manifest.mjs --platform macos-aarch64 --dir <out>/macos-aarch64
//   node scripts/ocr-component/write-manifest.mjs --tessdata <out>/tessdata
//   node scripts/ocr-component/write-manifest.mjs --publish
//
// --publish flips `published` to true only when every platform file and every
// language pack carries a 64-hex SHA-256 and a size; the app reports OCR as
// unavailable against a manifest that is not published, ocr-bundle.mjs refuses
// to stage from one, and the unit tests refuse a published one with a gap.
// Nothing is uploaded: the component travels inside the app.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from '../lib/main-module.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MANIFEST_PATH = join(root, 'src-tauri', 'resources', 'ocr', 'tesseract-component.json');

const HEX64 = /^[0-9a-f]{64}$/;

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Pin every file of `platform` from `dir`. A file the manifest names must exist. */
export function pinPlatform(manifest, platform, dir) {
  const entry = manifest.platforms[platform];
  if (!entry) throw new Error(`the manifest has no platform ${platform}`);
  for (const file of entry.files) {
    const path = join(dir, file.path);
    file.sha256 = sha256File(path);
    file.size = statSync(path).size;
  }
  return manifest;
}

/** Pin every language pack from `dir`. */
export function pinLanguages(manifest, dir) {
  for (const lang of Object.values(manifest.languages)) {
    const path = join(dir, lang.path);
    lang.sha256 = sha256File(path);
    lang.size = statSync(path).size;
  }
  return manifest;
}

/** What still stops publication; empty when every entry is pinned. */
export function unpinned(manifest) {
  const gaps = [];
  for (const [key, entry] of Object.entries(manifest.platforms)) {
    for (const f of entry.files) {
      if (!HEX64.test(f.sha256) || !(f.size > 0)) gaps.push(`${key}/${f.path}`);
    }
  }
  for (const [code, lang] of Object.entries(manifest.languages)) {
    if (!HEX64.test(lang.sha256) || !(lang.size > 0)) gaps.push(`tessdata/${code}`);
  }
  return gaps;
}

function main(argv) {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const arg = (name) => { const i = argv.indexOf(name); return i === -1 ? undefined : argv[i + 1]; };
  if (arg('--platform')) pinPlatform(manifest, arg('--platform'), arg('--dir'));
  else if (arg('--tessdata')) pinLanguages(manifest, arg('--tessdata'));
  else if (argv.includes('--publish')) {
    const gaps = unpinned(manifest);
    if (gaps.length) {
      console.error(`FAIL not publishable, unpinned: ${gaps.join(', ')}`);
      return 1;
    }
    manifest.published = true;
  } else {
    console.error('usage: --platform <key> --dir <dir> | --tessdata <dir> | --publish');
    return 2;
  }
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`wrote ${MANIFEST_PATH}`);
  return 0;
}

if (isMainModule(import.meta.url)) process.exit(main(process.argv.slice(2)));
