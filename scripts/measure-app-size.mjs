// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// Size of a macOS .app per architecture: what an arm64 Mac and an Intel Mac
// each store, because the App Store thins a universal app to the device. A file
// that is not Mach-O counts in full for both; a universal Mach-O counts the
// slice of that architecture only.
//
//   node scripts/measure-app-size.mjs <a.app> [<b.app> ...]
//   node scripts/measure-app-size.mjs --before <a.app> --after <b.app>
//
// Used for docs/BUNDLED_OCR.md: a build without and with the
// bundled OCR component. Sizes are bytes on disk as the files are (apparent
// size, no compression); the installer .pkg is smaller.

import { execFileSync } from 'node:child_process';
import { lstatSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ARCHS = ['arm64', 'x86_64'];

function sliceSizes(file) {
  const out = execFileSync('lipo', ['-detailed_info', file], { encoding: 'utf8' });
  const sizes = {};
  for (const block of out.split(/Architecture /).slice(1)) {
    const arch = block.split('\n')[0].trim();
    const size = /^size (\d+)/m.exec(block);
    if (size) sizes[arch] = Number(size[1]);
  }
  return sizes;
}

function isMachO(file) {
  return /Mach-O/.test(execFileSync('file', ['-b', file], { encoding: 'utf8' }));
}

export function sizeByArch(app) {
  const total = { arm64: 0, x86_64: 0 };
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) {
        const size = lstatSync(p).size;
        let slices = null;
        if (size > 4096 && isMachO(p)) {
          try { slices = sliceSizes(p); } catch { slices = null; }
        }
        for (const a of ARCHS) total[a] += slices ? (slices[a] ?? 0) : size;
      }
    }
  };
  walk(app);
  return total;
}

const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;

function main() {
  const args = process.argv.slice(2);
  const before = args.indexOf('--before');
  const after = args.indexOf('--after');
  if (before !== -1 && after !== -1) {
    const b = sizeByArch(resolve(args[before + 1]));
    const a = sizeByArch(resolve(args[after + 1]));
    for (const arch of ARCHS) console.log(`${arch}: ${mb(b[arch])} -> ${mb(a[arch])} (+${mb(a[arch] - b[arch])})`);
    return;
  }
  if (!args.length) { console.error('usage: measure-app-size.mjs <app>... | --before <app> --after <app>'); process.exit(2); }
  for (const app of args) {
    const s = sizeByArch(resolve(app));
    console.log(`${app}: arm64 ${mb(s.arm64)}, x86_64 ${mb(s.x86_64)}`);
  }
}
main();
