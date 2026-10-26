// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// Runs the staged macOS OCR binary: `--version`, then an OCR of a tiny fixture
// PNG on stdin (the way the app calls it), once per architecture in the binary.
//
// Why a re-signed COPY: the shipped helper carries com.apple.security.app-sandbox
// + com.apple.security.inherit. Outside a sandboxed parent app the kernel aborts
// it in libsecinit before main() (exit 133, SIGILL/SIGTRAP, no output). That is
// correct for the shipped file and it is why a plain `tesseract --version` on it
// prints nothing. The copy is signed ad hoc without those entitlements, so what
// is exercised is exactly the shipped, lipo-merged Mach-O (both slices, linked
// libraries, tessdata path), not its sandbox behaviour. The sandbox side is read
// back by `--verify` and by notarize-macos.sh / build-mas.sh (entitlements).
//
// usage: node scripts/ocr-component/ocr-smoke.mjs [<bundle-dir>] [--universal]
// --universal: the binary must hold both arm64 and x86_64 (release bundle).
// Without it, every architecture the binary has is run (a CI runner stages one).
// A missing prerequisite (not macOS, no Rosetta) is reported on stderr as
// "SKIPPED (not a pass): <reason>" and does not fail; a wrong result does.

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { isMainModule } from '../lib/main-module.mjs';

const root = resolve(import.meta.dirname, '..', '..');
export const FIXTURE = join(root, 'tests', 'fixtures', 'ocr', 'hello-ocr.png');
export const EXPECTED_TEXT = 'PDFluent OCR 42';
export const EXPECTED_VERSION = /^tesseract 5\.5\.1\b/;

/** Pure judgement of one run, so the tests can feed it good and bad output. */
export function judge(arch, version, ocr) {
  const problems = [];
  if (version.status !== 0 || !EXPECTED_VERSION.test(version.stdout.trim())) {
    problems.push(`${arch}: --version exit ${version.status}, output ${JSON.stringify(version.stdout.trim().slice(0, 80))}`);
  }
  if (ocr.status !== 0 || ocr.stdout.replace(/\s+/g, ' ').trim() !== EXPECTED_TEXT) {
    problems.push(`${arch}: OCR exit ${ocr.status}, read ${JSON.stringify(ocr.stdout.replace(/\s+/g, ' ').trim().slice(0, 80))}, expected ${JSON.stringify(EXPECTED_TEXT)}`);
  }
  return problems;
}

function run(cmd, args, input) {
  const r = spawnSync(cmd, args, { input, encoding: 'utf8', maxBuffer: 1 << 24 });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

export function smoke(bundleDir, { universal = false } = {}) {
  if (process.platform !== 'darwin') return { skipped: 'not macOS', problems: [] };
  const binary = join(bundleDir, 'bin', 'tesseract');
  if (!existsSync(binary)) return { skipped: null, problems: [`${binary}: missing`] };
  const archs = run('lipo', ['-archs', binary]).stdout.trim().split(/\s+/).filter(Boolean);
  const wanted = universal ? ['arm64', 'x86_64'] : archs;
  if (!archs.length || wanted.some((a) => !archs.includes(a))) {
    return { skipped: null, problems: [`${binary}: architectures [${archs}], expected ${universal ? 'arm64 and x86_64' : 'at least one'}`] };
  }
  const dir = mkdtempSync(join(tmpdir(), 'pdfluent-ocr-smoke-'));
  const problems = [];
  const skipped = [];
  try {
    const copy = join(dir, 'tesseract');
    copyFileSync(binary, copy);
    const sign = run('codesign', ['--force', '--options', 'runtime', '--sign', '-', copy]);
    if (sign.status !== 0) return { skipped: null, problems: [`re-signing the copy failed: ${sign.stderr.trim()}`] };
    const png = readFileSync(FIXTURE);
    const tessdata = join(bundleDir, 'tessdata');
    for (const arch of wanted) {
      const prefix = ['-' + arch, copy];
      if (run('arch', ['-' + arch, '/usr/bin/true']).status !== 0) { skipped.push(`${arch} cannot run here (Rosetta missing?)`); continue; }
      const version = run('arch', [...prefix, '--version']);
      const ocr = run('arch', [...prefix, 'stdin', 'stdout', '--tessdata-dir', tessdata, '-l', 'eng'], png);
      problems.push(...judge(arch, version, ocr));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return { skipped: skipped.length ? skipped.join('; ') : null, problems };
}

if (isMainModule(import.meta.url)) {
  const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const dir = resolve(positional[0] ?? join(root, 'src-tauri', 'resources', 'ocr-bundle'));
  const r = smoke(dir, { universal: process.argv.includes('--universal') });
  if (r.skipped) console.error(`SKIPPED (not a pass): ${r.skipped}`);
  if (r.problems.length) {
    console.error(`FAIL the staged OCR binary in ${dir} does not work:\n  ${r.problems.join('\n  ')}`);
    process.exit(1);
  }
  if (!r.skipped) console.log(`OK the staged OCR binary in ${dir} reports its version and reads the fixture`);
}
