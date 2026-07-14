// SPDX-License-Identifier: LicenseRef-PDFluent-Proprietary
// Copyright (c) 2026 Innovation Trigger B.V.
//
// Drift-guard: PDFluent Editor is proprietary software, free for everyone to
// use — including commercial and business use (see LICENSE.md). Monetisation
// runs entirely through the separately licensed PDFluent SDK. This test fails
// if stale claims creep back in: legacy self-license / engine claims (AGPL
// self-licensing, "open-source PDF editor", a Pdfium/LibPDF *engine* claim,
// "early development / not ready" status copy), OR the old paid-app-licence
// model (€49 pricing, a per-seat/JetBrains-style licence, "buy a licence",
// "commercial use requires a licence", or the old "personal, non-commercial
// use" grant language).
//
// It checks stale CLAIM PHRASES, not bare dependency names: keeping the
// @libpdf/core dependency, attributing OSS deps (incl. ones licensed AGPL would
// they exist) in THIRD_PARTY*, blocking AGPL for dependencies in
// compliance/policy.json, or writing a disclaimer like "no Pdfium" / "NOT
// open-source" are all allowed. The SDK (licensed separately, unaffected by
// this transition) may still say "per-seat" or similar in its own docs —
// this guard only scans the editor repo.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Directories/files never scanned: vendored, build output, generated artifacts,
// historical archives, comparative research, and this guard itself.
const EXCLUDED_DIRS = new Set([
  'node_modules', 'dist', 'target', '.git', '.github-archive', 'coverage',
]);
const EXCLUDED_PATHS = [
  'docs/archive', // historical records (may quote old headers verbatim)
  'docs/text-interaction-research-findings.md', // compares PDF.js/PDFium/Acrobat
  'GRATIS_EDITOR_IMPLEMENTATIEPLAN.md', // migration plan; quotes OLD phrases as instructions to remove them
  'THIRD_PARTY.md', // generated OSS attribution (lists dep licenses)
  'THIRD_PARTY_ATTRIBUTIONS.md', // generated OSS attribution
  'compliance-report.json', // generated
  'package-lock.json',
  'tests/licensing-claims-guard.test.ts', // this file states the patterns
  'tests/viewer-v3-workflow-regressions.test.ts', // asserts the OLD phrases are ABSENT via .not.toContain(...)
];

const SCAN_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.rs', '.json', '.md', '.toml',
  '.yml', '.yaml', '.sh', '.ps1', '.css', '.html', '.txt',
]);

/** Stale self-claims that must not reappear. Each is specific enough to skip
 *  legitimate disclaimers, dependency block-lists and attributions. */
const FORBIDDEN: { label: string; re: RegExp }[] = [
  { label: 'AGPL SPDX self-license header', re: /SPDX-License-Identifier:\s*AGPL/i },
  { label: '"open-source PDF editor" tagline', re: /open[- ]source PDF editor/i },
  { label: '"licensed under AGPL" grant', re: /licensed under (the )?AGPL/i },
  { label: 'AGPL self-license claim', re: /\bAGPL-3\.0(-or-later|-only)?\.\s*See\b/i },
  { label: 'Pdfium engine claim', re: /Pdfium \(rendering\)/i },
  { label: 'LibPDF engine claim', re: /LibPDF \(manipulation\)/i },
  { label: '"early development" status', re: /\bearly development\b/i },
  { label: '"not ready for end-user" status', re: /not (yet )?ready for end-user/i },
  { label: 'project-is-AGPL note', re: /Project license is AGPL/i },
  // Legal-entity normalization: the entity is "Innovation Trigger B.V." — the
  // bare product/brand name "PDFluent" is fine, but "PDFluent" used AS the legal
  // entity (with a B.V./BV suffix, any casing) must not reappear.
  { label: 'stale "PDFluent B.V." legal entity', re: /PDFluent\s+B\.V\.?|PDFluent\s+BV\b/i },
  // The old paid-app-licence model (removed 2026-07-11 — the app is now free
  // for everyone; monetisation moved entirely to the separately licensed SDK).
  { label: 'old €49/business-tier pricing', re: /€\s?49|\$\s?49\b|49\s?\/\s?(user|seat)/i },
  { label: 'old "personal, non-commercial use" grant', re: /personal,?\s+non-commercial/i },
  { label: 'old "buy a license" CTA', re: /buy (a |the )?(commercial )?licen[cs]e/i },
  { label: 'old "commercial use requires a license" claim', re: /commercial use requires/i },
  { label: 'old per-seat licence model', re: /per-seat licen[cs]e/i },
  { label: 'old JetBrains-style licence comparison', re: /jetbrains[- ]style|jetbrains.{0,10}\blicen[cs]e\b/i },
];

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (EXCLUDED_DIRS.has(name)) continue;
    const abs = join(dir, name);
    const rel = relative(ROOT, abs).split(sep).join('/');
    if (EXCLUDED_PATHS.some(p => rel === p || rel.startsWith(p + '/'))) continue;
    const st = statSync(abs);
    if (st.isDirectory()) {
      walk(abs, out);
    } else if (SCAN_EXTENSIONS.has(name.slice(name.lastIndexOf('.')))) {
      out.push(abs);
    }
  }
}

describe('licensing claims drift-guard', () => {
  const files: string[] = [];
  walk(ROOT, files);

  it('scans a non-trivial slice of the repo', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  for (const { label, re } of FORBIDDEN) {
    it(`has no stale claim: ${label}`, () => {
      const hits: string[] = [];
      for (const abs of files) {
        let text: string;
        try {
          text = readFileSync(abs, 'utf8');
        } catch {
          continue;
        }
        const lines = text.split('\n');
        lines.forEach((line, i) => {
          if (re.test(line)) hits.push(`${relative(ROOT, abs)}:${i + 1}: ${line.trim().slice(0, 120)}`);
        });
      }
      expect(hits, `stale claim "${label}" found:\n${hits.join('\n')}`).toEqual([]);
    });
  }
});
