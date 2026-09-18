// SPDX-License-Identifier: LicenseRef-PDFluent-Proprietary
// Copyright (c) 2026 Innovation Trigger B.V.
//
// Where the shipped version number lives, and where the shell still calls the
// release a beta. Kept beside the test so both the checkout case and the
// fixture cases read the same code.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface VersionSite {
  file: string;
  line: number;
  version: string;
}

export interface VersionScan {
  sites: VersionSite[];
  problems: string[];
}

/** The line a literal first appears on, 1-based; 0 when it does not. */
function lineOf(text: string, needle: string): number {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) if (lines[i].includes(needle)) return i + 1;
  return 0;
}

function read(root: string, file: string): string | null {
  try {
    return readFileSync(join(root, file), 'utf8');
  } catch {
    return null;
  }
}

/**
 * Every file a build reads the version out of.
 *
 * `package.json` is the reference: `repo-truth.mjs` compares it with
 * `docs/SHIPPED.json`, and the release scripts read `tauri.conf.json`. When
 * those two disagree the pipeline is green and the installer carries a version
 * nothing else in the tree names.
 */
export function scanReleaseVersion(root: string): VersionScan {
  const sites: VersionSite[] = [];
  const problems: string[] = [];

  const pkgText = read(root, 'package.json');
  if (pkgText === null) return { sites, problems: ['package.json is missing'] };
  const pkgVersion = JSON.parse(pkgText).version as string;
  sites.push({ file: 'package.json', line: lineOf(pkgText, `"version": "${pkgVersion}"`), version: pkgVersion });

  const lockText = read(root, 'package-lock.json');
  if (lockText !== null) {
    const lock = JSON.parse(lockText) as { version?: string; packages?: Record<string, { version?: string }> };
    for (const [where, version] of [
      ['package-lock.json', lock.version],
      ['package-lock.json (packages."")', lock.packages?.['']?.version],
    ] as const) {
      if (version !== undefined) sites.push({ file: where, line: lineOf(lockText, `"version": "${version}"`), version });
    }
  }

  const cargoToml = read(root, 'src-tauri/Cargo.toml');
  if (cargoToml !== null) {
    // The `[package]` version, not a dependency's.
    const pkgSection = cargoToml.split(/^\[/m).find(s => s.startsWith('package]'));
    const version = pkgSection?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
    if (version !== undefined) {
      sites.push({ file: 'src-tauri/Cargo.toml', line: lineOf(cargoToml, `version = "${version}"`), version });
    }
  }

  const cargoLock = read(root, 'src-tauri/Cargo.lock');
  if (cargoLock !== null) {
    const entry = cargoLock
      .split(/\n\[\[package\]\]\n/)
      .find(block => /^name = "pdfluent-desktop"$/m.test(block));
    const version = entry?.match(/^version = "([^"]+)"$/m)?.[1];
    if (version !== undefined) {
      sites.push({
        file: 'src-tauri/Cargo.lock',
        line: lineOf(cargoLock, 'name = "pdfluent-desktop"') + 1,
        version,
      });
    }
  }

  const tauriConf = read(root, 'src-tauri/tauri.conf.json');
  if (tauriConf !== null) {
    const version = (JSON.parse(tauriConf) as { version?: string }).version;
    if (version !== undefined) {
      sites.push({ file: 'src-tauri/tauri.conf.json', line: lineOf(tauriConf, `"version": "${version}"`), version });
    }
  }

  for (const site of sites.slice(1)) {
    if (site.version !== pkgVersion) {
      problems.push(`${site.file}:${site.line} says ${site.version} but package.json:${sites[0].line} says ${pkgVersion}`);
    }
  }
  return { sites, problems };
}

/**
 * How "beta" is spelled in every script the editor ships a locale in.
 *
 * A guard that only knows the Latin spelling reads green on twenty-six locales
 * that still say it. The boundaries matter as much as the words: a bare
 * substring match flags the Swedish "Arbetar" and "bearbetar", so the Latin
 * form only counts at the start of a word, which still catches
 * "betaversionen", "Beta-Version" and "wersji beta".
 *
 * Arabic is the phrase, not the adjective: "تجريبي" on its own is how the XFA
 * badge says "experimental", which is a statement about XFA and not about the
 * release.
 */
export const BETA_WORDS: { script: string; pattern: RegExp }[] = [
  // en, cs, da, de, es, fi, fr, hu, id, it, nb, nl, pl, pt, ro, sv, tr, vi
  { script: 'Latin', pattern: /(?<!\p{L})b[eèê]ta/iu },
  { script: 'Greek', pattern: /β-έκδοση/u },
  { script: 'Cyrillic', pattern: /(?<!\p{L})бета/u },
  { script: 'Arabic', pattern: /الإصدار التجريبي/u },
  { script: 'Devanagari', pattern: /बीटा/u },
  { script: 'Japanese', pattern: /ベータ/u },
  { script: 'Hangul', pattern: /베타/u },
  { script: 'Han (simplified)', pattern: /测试版/u },
  { script: 'Han (traditional)', pattern: /測試版/u },
  { script: 'Thai', pattern: /เบต้า/u },
];

/** True when the string calls something a beta, in any of the shipped scripts. */
export function namesABeta(text: string): boolean {
  return BETA_WORDS.some(({ pattern }) => pattern.test(text));
}

/** The body of a `## <heading>` section of a markdown file, without its heading. */
export function markdownSection(markdown: string, heading: string): string {
  const parts = markdown.split(new RegExp(`^## ${heading}\\s*$`, 'm'));
  if (parts.length < 2) return '';
  return parts[1].split(/^## /m)[0];
}

/**
 * User-facing copy that calls the release a beta, when the version says it is
 * not one. A pre-release version may say beta as much as it likes.
 */
export function scanBetaWording(root: string): string[] {
  const problems: string[] = [];
  const pkgText = read(root, 'package.json');
  if (pkgText === null) return ['package.json is missing'];
  const version = JSON.parse(pkgText).version as string;
  if (version.includes('-')) return problems; // a pre-release; it is a beta

  const readme = read(root, 'README.md');
  if (readme !== null) {
    const status = markdownSection(readme, 'Status');
    for (const line of status.split('\n')) {
      if (namesABeta(line)) problems.push(`README.md Status calls ${version} a beta: ${line.trim()}`);
    }
  }

  const localesDir = join(root, 'src/i18n/locales');
  let files: string[] = [];
  try {
    files = readdirSync(localesDir).filter(f => f.endsWith('.json')).sort();
  } catch {
    return problems;
  }
  for (const file of files) {
    const tree = JSON.parse(readFileSync(join(localesDir, file), 'utf8')) as Record<string, unknown>;
    for (const [key, value] of Object.entries(flatten(tree))) {
      if (typeof value === 'string' && namesABeta(value)) {
        problems.push(`src/i18n/locales/${file} key ${key} calls ${version} a beta`);
      }
    }
  }
  return problems;
}

/** Every key of a locale tree as a dotted path. */
function flatten(tree: Record<string, unknown>, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value as Record<string, unknown>, path, out);
    } else out[path] = value;
  }
  return out;
}
