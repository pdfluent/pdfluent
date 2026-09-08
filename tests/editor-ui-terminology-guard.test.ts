// SPDX-License-Identifier: LicenseRef-PDFluent-Proprietary
// Copyright (c) 2026 Innovation Trigger B.V.
//
// Drift-guard for what the user can read on screen.
//
// The editor is free for everyone, including business use, under the
// proprietary EULA in LICENSE.md. There is no licence key, no trial period,
// no tier and no paywall — monetisation runs entirely through the separately
// licensed PDFluent SDK. This guard fails if the vocabulary of the abolished
// paid-app model reappears in a user-visible string.
//
// It is deliberately narrower than tests/licensing-claims-guard.test.ts, which
// scans the whole repository for stale *claims* in prose. This one scans the
// surfaces a user actually reads — the 27 locale files, the frontend sources
// and the native menu — and it also asserts that the dormant licensing module
// stays unwired, because a re-registered command would put a licence dialog
// back on screen without any prose changing.
//
// The word "licence" on its own is fine: Help > License & Terms links to the
// EULA, and the third-party notices are reachable from the same menu. What is
// forbidden is the machinery: keys, activation, trials, tiers, seats,
// subscriptions and purchase prompts.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LOCALES = join(ROOT, 'src/i18n/locales');

// Nothing is excluded from the scan. `src-tauri/src/licensing.rs` — the dormant
// paid-app module — used to be, and was deleted with the SDK pin move; the test
// that forbids the PDF/A stamp (`src-tauri/src/pdfa_export_guard.rs`) has to
// match the stamp text but never spells it in one literal, so it passes here
// like any other source. Keep it that way rather than adding an exception.
const EXCLUDED: string[] = [];

const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.rs', '.json']);

/** Vocabulary of the abolished paid-app model. Each pattern names machinery,
 *  not the bare word "licence", so the EULA link and the notices menu survive. */
const FORBIDDEN: { label: string; re: RegExp }[] = [
  { label: 'trial period / trial version', re: /\btrials?\b|\bproefversie\b|\bproefperiode\b/i },
  { label: 'free tier / paid tier', re: /free[- ]tier|paid[- ]tier|\bfree plan\b/i },
  { label: 'licence key', re: /licen[cs]e[- ]key|licentiesleutel|product key|activation code/i },
  { label: 'licence activation flow', re: /activate (a |your |the )?licen[cs]e|enter (a |your )?licen[cs]e|licen[cs]e file/i },
  { label: 'purchase prompt', re: /buy (a |the )?(commercial )?licen[cs]e|purchase (a |the )?licen[cs]e|licentie kopen|upgrade to (pro|premium|business)/i },
  { label: 'subscription or seat model', re: /\bsubscriptions?\b|\babonnement\b|per[- ]seat|\bseats?\b(?! belt)/i },
  { label: 'paid unlock', re: /unlock (the )?(full|pro|premium) version|\bpaid (plan|version)\b|\bpremium feature/i },
  { label: 'non-commercial restriction', re: /personal use only|non-commercial use/i },
  { label: 'licence expiry notice', re: /licen[cs]e (has )?expired|licen[cs]e is (invalid|expired)/i },
];

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const rel = relative(ROOT, abs).split(sep).join('/');
    if (EXCLUDED.includes(rel)) continue;
    if (statSync(abs).isDirectory()) {
      if (name === 'node_modules' || name === 'target' || name === 'dist') continue;
      walk(abs, out);
    } else if (SCAN_EXTENSIONS.has(name.slice(name.lastIndexOf('.')))) {
      out.push(abs);
    }
  }
}

/** The quoted strings and JSX text of a source file — what can end up on
 *  screen. Scanning whole lines instead would trip over identifiers and
 *  section comments ("// ── Subscriptions ──" in the undo-redo listener code
 *  is not a payment model). */
function visibleStrings(text: string): { line: number; value: string }[] {
  const out: { line: number; value: string }[] = [];
  text.split('\n').forEach((line, i) => {
    // Quoted literals (single, double, template) plus the text between JSX tags.
    const matches = line.match(/"[^"]*"|'[^']*'|`[^`]*`|>[^<>{}]+</g);
    for (const m of matches ?? []) out.push({ line: i + 1, value: m });
  });
  return out;
}

/** Every string a locale file can produce, flattened with its key path. */
function localeStrings(file: string): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  const visit = (node: unknown, path: string): void => {
    if (typeof node === 'string') {
      out.push({ key: path, value: node });
    } else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) visit(v, path ? `${path}.${k}` : k);
    }
  };
  visit(JSON.parse(readFileSync(file, 'utf8')), '');
  return out;
}

describe('editor UI terminology guard', () => {
  const localeFiles = readdirSync(LOCALES)
    .filter(n => n.endsWith('.json'))
    .map(n => join(LOCALES, n));

  const sourceFiles: string[] = [];
  walk(join(ROOT, 'src'), sourceFiles);
  walk(join(ROOT, 'src-tauri/src'), sourceFiles);

  it('scans every locale and a non-trivial slice of the UI sources', () => {
    // 27 shipped languages; the count only ever grows.
    expect(localeFiles.length).toBeGreaterThanOrEqual(27);
    expect(localeStrings(join(LOCALES, 'en.json')).length).toBeGreaterThan(100);
    expect(sourceFiles.length).toBeGreaterThan(100);
  });

  for (const { label, re } of FORBIDDEN) {
    it(`no locale offers the user: ${label}`, () => {
      const hits: string[] = [];
      for (const file of localeFiles) {
        for (const { key, value } of localeStrings(file)) {
          if (re.test(value)) hits.push(`${relative(ROOT, file)} ${key}: ${value.slice(0, 120)}`);
        }
      }
      expect(hits, `forbidden UI terminology "${label}":\n${hits.join('\n')}`).toEqual([]);
    });

    it(`no UI source carries: ${label}`, () => {
      const hits: string[] = [];
      for (const abs of sourceFiles) {
        for (const { line, value } of visibleStrings(readFileSync(abs, 'utf8'))) {
          if (re.test(value)) hits.push(`${relative(ROOT, abs)}:${line}: ${value.trim().slice(0, 120)}`);
        }
      }
      expect(hits, `forbidden UI terminology "${label}":\n${hits.join('\n')}`).toEqual([]);
    });
  }

  it('carries no licensing module at all', () => {
    // The dormant module was deleted with the SDK pin move: the engine crate it
    // used (`xfa-license`) no longer exists, and the editor is free for
    // everyone. A registered command or managed state is all it would take to
    // put a licence dialog back on screen, whatever the prose says.
    expect(
      existsSync(join(ROOT, 'src-tauri/src/licensing.rs')),
      'src-tauri/src/licensing.rs is back',
    ).toBe(false);
    const lib = readFileSync(join(ROOT, 'src-tauri/src/lib.rs'), 'utf8');
    for (const symbol of [
      'get_license_status',
      'activate_license',
      'deactivate_license',
      'LicenseManager',
      'discover_and_validate',
      'help_open_pricing',
      'mod licensing',
    ]) {
      expect(lib, `src-tauri/src/lib.rs wires up ${symbol}`).not.toContain(symbol);
    }
  });


  it('is wired into a pipeline that a branch push actually starts', () => {
    // The point of the previous rounds of this work was a guard that existed
    // and ran nowhere: the pipeline used to run on tags and merge requests
    // only. The editor lands on release/ga-readiness by push, so that is the
    // trigger the guard has to sit behind.
    const ci = readFileSync(join(ROOT, '.github/workflows/quality.yml'), 'utf8');
    expect(ci).toMatch(/^on:\n {2}push:\n {4}branches:\n {6}- main\n {6}- "release\/\*\*"\n {2}pull_request:$/m);
    const fastJob = ci.slice(ci.indexOf('  quality-gates-fast:'), ci.indexOf('  repo-truth:'));
    // Unfiltered: a path argument here would drop the guards again. Flags are
    // fine (worker caps, reporters); a path is not, and that is the difference
    // this checks rather than pinning the whole command line.
    const vitest = /^ +- run: npx vitest run(.*)$/m.exec(fastJob);
    expect(vitest, 'the fast gate no longer runs the suite').not.toBeNull();
    expect(vitest![1].split(/\s+/).filter(Boolean).every(arg => arg.startsWith('-'))).toBe(true);
  });

  it('keeps the licence-seat model out of the frontend', () => {
    // The legacy shell (reachable with ?legacy) offered "Seat tier (pro |
    // business | enterprise)" through an admin prompt until #225. Names, not
    // prose, are what brings that dialog back, so the names are what is
    // checked here.
    for (const file of ['src/lib/enterprise.ts', 'src/legacy/App.tsx', 'src/components/Toolbar.tsx']) {
      const source = readFileSync(join(ROOT, file), 'utf8');
      for (const symbol of ['LicenseSeat', 'licenseSeats', 'issueLicenseSeat', 'revokeLicenseSeat', 'LicenseTier']) {
        expect(source, `${file} brings back ${symbol}`).not.toContain(symbol);
      }
    }
  });
});
