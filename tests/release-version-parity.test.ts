// SPDX-License-Identifier: LicenseRef-PDFluent-Proprietary
// Copyright (c) 2026 Innovation Trigger B.V.
//
// The version the app ships is written down in five places and nothing held
// them together. `repo-truth.mjs` compares `package.json` with
// `docs/SHIPPED.json`; every release script reads `src-tauri/tauri.conf.json`;
// the About dialog and the crash report read `CARGO_PKG_VERSION` out of
// `src-tauri/Cargo.toml`; `tests/sdk-pin-guard.test.ts` reads
// `src-tauri/Cargo.lock`. A bump that misses one of them is green everywhere
// and produces an installer whose file name, About box and update feed
// disagree about what the user has.
//
// The second half is the wording that goes with the number. Twenty-seven
// locales told the user "in this beta version" and the README's status line
// said "Public beta on macOS and Windows". Those are true of a `-beta.N`
// version and false of `1.0.0`, and nothing connected the two, so the release
// could ship as 1.0.0 while the shell still called itself a beta.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  BETA_WORDS,
  markdownSection,
  namesABeta,
  scanBetaWording,
  scanReleaseVersion,
} from './releaseVersionSites';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

describe('the version this checkout ships', () => {
  const scan = scanReleaseVersion(ROOT);

  it('is the same number in every file a build reads it from', () => {
    expect(scan.problems.join('\n'), 'the shipped version disagrees with itself').toBe('');
  });

  it('is written down in all five places, not four', () => {
    // Dropping a site would make the case above pass by measuring less.
    expect(scan.sites.map(s => s.file)).toEqual([
      'package.json',
      'package-lock.json',
      'package-lock.json (packages."")',
      'src-tauri/Cargo.toml',
      'src-tauri/Cargo.lock',
      'src-tauri/tauri.conf.json',
    ]);
  });

  it('is a version number, not a branch name or a placeholder', () => {
    expect(scan.sites[0].version).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
  });
});

describe('what the shell calls this release', () => {
  it('does not call a release without a pre-release label a beta', () => {
    expect(scanBetaWording(ROOT).join('\n'), 'the shipped copy contradicts the version').toBe('');
  });

  it('still says what text editing cannot do', () => {
    // Dropping the word is not the same as dropping the limitation, and the
    // limitation is the only reason the string exists.
    const files = ['en', 'nl', 'ja', 'ar'];
    for (const locale of files) {
      const tree = JSON.parse(
        readFileSync(join(ROOT, `src/i18n/locales/${locale}.json`), 'utf8'),
      ) as { textEdit?: { betaLimitHelp?: string } };
      const help = tree.textEdit?.betaLimitHelp ?? '';
      expect(help.length, `${locale}.json lost textEdit.betaLimitHelp`).toBeGreaterThan(20);
    }
  });
});

// ── The guards, on trees built here ─────────────────────────────────────────
//
// The cases above read this checkout, so they say nothing about what happens
// when a site does drift. These build the drift and assert on the message.

const scratch = mkdtempSync(join(tmpdir(), 'release-version-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
let treeCount = 0;

interface TreeSpec {
  pkg?: string;
  lock?: string;
  cargoToml?: string;
  cargoLock?: string;
  tauriConf?: string;
  readmeStatus?: string;
  locales?: Record<string, string>;
}

function tree(version: string, spec: TreeSpec = {}): string {
  const root = join(scratch, `tree-${(treeCount += 1)}`);
  mkdirSync(join(root, 'src-tauri'), { recursive: true });
  mkdirSync(join(root, 'src/i18n/locales'), { recursive: true });
  const at = (key: keyof TreeSpec): string => (spec[key] as string | undefined) ?? version;

  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'pdfluent', version: at('pkg') }, null, 2));
  writeFileSync(
    join(root, 'package-lock.json'),
    JSON.stringify({ name: 'pdfluent', version: at('lock'), packages: { '': { version: at('lock') } } }, null, 2),
  );
  writeFileSync(
    join(root, 'src-tauri/Cargo.toml'),
    ['[package]', 'name = "pdfluent-desktop"', `version = "${at('cargoToml')}"`, '', '[dependencies]', 'serde = { version = "1" }', ''].join('\n'),
  );
  writeFileSync(
    join(root, 'src-tauri/Cargo.lock'),
    [
      '[[package]]',
      'name = "serde"',
      'version = "1.0.0"',
      '',
      '[[package]]',
      'name = "pdfluent-desktop"',
      `version = "${at('cargoLock')}"`,
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(root, 'src-tauri/tauri.conf.json'),
    JSON.stringify({ productName: 'PDFluent', version: at('tauriConf') }, null, 2),
  );
  writeFileSync(
    join(root, 'README.md'),
    ['# PDFluent', '', '## Status', '', spec.readmeStatus ?? 'Available on macOS and Windows.', '', '## Install', '', 'Download it.', ''].join('\n'),
  );
  for (const [locale, help] of Object.entries(spec.locales ?? { en: 'Text editing replaces existing words.' })) {
    writeFileSync(join(root, `src/i18n/locales/${locale}.json`), JSON.stringify({ textEdit: { betaLimitHelp: help } }));
  }
  return root;
}

describe('the version parity guard, on fixtures', () => {
  it('passes when all five agree', () => {
    expect(scanReleaseVersion(tree('1.0.0')).problems).toEqual([]);
  });

  it('names the file and line of a manifest the bump forgot', () => {
    // The shape this landing could have taken: everything to 1.0.0 except the
    // file every release script reads.
    expect(scanReleaseVersion(tree('1.0.0', { tauriConf: '1.0.0-beta.21' })).problems).toEqual([
      'src-tauri/tauri.conf.json:3 says 1.0.0-beta.21 but package.json:3 says 1.0.0',
    ]);
  });

  it('catches a lockfile left behind', () => {
    const problems = scanReleaseVersion(tree('1.0.0', { lock: '0.9.0', cargoLock: '0.9.0' })).problems;
    expect(problems).toHaveLength(3);
    expect(problems[0]).toContain('package-lock.json:3 says 0.9.0');
    expect(problems[2]).toContain('src-tauri/Cargo.lock:7 says 0.9.0');
  });

  it('reads the [package] version and not a dependency version', () => {
    // `serde = { version = "1" }` sits in the same file; a looser reader takes
    // the first `version = ` it finds and compares the wrong number.
    const scan = scanReleaseVersion(tree('1.0.0'));
    expect(scan.sites.find(s => s.file === 'src-tauri/Cargo.toml')?.version).toBe('1.0.0');
  });
});

describe('the beta-wording guard, on fixtures', () => {
  it('leaves a pre-release alone', () => {
    const root = tree('1.0.0-beta.21', {
      readmeStatus: 'Public beta on macOS and Windows.',
      locales: { en: 'Note: In this beta version, text editing is limited.' },
    });
    expect(scanBetaWording(root)).toEqual([]);
  });

  it('flags the README status line of a release that is not a beta', () => {
    const root = tree('1.0.0', { readmeStatus: 'Public beta on macOS and Windows.' });
    expect(scanBetaWording(root)).toEqual([
      'README.md Status calls 1.0.0 a beta: Public beta on macOS and Windows.',
    ]);
  });

  it('flags a locale in every script, not only the Latin ones', () => {
    const root = tree('1.0.0', {
      locales: {
        ar: 'ملاحظة: في هذا الإصدار التجريبي، يقتصر تعديل النص.',
        el: 'Σημείωση: Σε αυτή τη β-έκδοση, η επεξεργασία κειμένου περιορίζεται.',
        fr: 'Remarque: Dans cette version bêta, la modification est limitée.',
        hi: 'नोट: इस बीटा संस्करण में, टेक्स्ट संपादन सीमित है।',
        ja: '注記: このベータバージョンでは、テキスト編集は限定されています。',
        ko: '참고: 이 베타 버전에서는 텍스트 편집이 제한됩니다.',
        nl: 'Let op: In deze bèta-versie is tekstbewerking beperkt.',
        ru: 'Примечание: в этой бета-версии редактирование текста ограничено.',
        sv: 'Obs: I den här betaversionen är textredigering begränsad.',
        th: 'หมายเหตุ: ในเวอร์ชันเบต้านี้ การแก้ไขข้อความจำกัด',
        'zh-CN': '注意：在此测试版中，文本编辑仅限于替换现有单词。',
        'zh-TW': '注意：在此測試版中，文字編輯僅限於取代現有單字。',
      },
    });
    // Every script the fixture names, and no locale left unread.
    expect(scanBetaWording(root)).toHaveLength(12);
    expect(BETA_WORDS.map(w => w.script)).toContain('Thai');
  });

  it('does not mistake a Swedish verb for a release label', () => {
    // "Arbetar…" and "bearbetar" both contain the four letters. A substring
    // match flagged two real strings in sv.json.
    expect(namesABeta('Arbetar…')).toBe(false);
    expect(namesABeta('PDFluent bearbetar dokumentet på denna enhet.')).toBe(false);
    expect(namesABeta('I den här betaversionen är textredigering begränsad.')).toBe(true);
  });

  it('does not mistake the Arabic word for experimental for a beta label', () => {
    // `xfa.experimentalBadge` is "تجريبي": a statement about XFA support, not
    // about the release. The phrase is what names a beta.
    expect(namesABeta('تجريبي')).toBe(false);
    expect(namesABeta('دعم XFA تجريبي.')).toBe(false);
    expect(namesABeta('في هذا الإصدار التجريبي، يقتصر تعديل النص.')).toBe(true);
  });

  it('reads only the Status section of the README', () => {
    const markdown = ['# PDFluent', '', '## Status', '', 'Available.', '', '## History', '', 'The beta ran for a year.', ''].join('\n');
    expect(markdownSection(markdown, 'Status').trim()).toBe('Available.');
    expect(namesABeta(markdownSection(markdown, 'Status'))).toBe(false);
  });
});
