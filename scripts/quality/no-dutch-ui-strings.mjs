// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * No Dutch sentence in a string literal of a shipped source file.
 *
 * The app speaks 27 languages through src/i18n/locales. A string the Rust side
 * or a component writes straight into the UI bypasses all of them: the native
 * capability list said "Bestandssysteem en mailto" and "Delen maakt lokale
 * bestanden of maildrafts zonder upload" to every user, in every locale, for
 * months, because the editor was written in Dutch first and nothing looked.
 *
 * What is scanned: string literals (not comments) in src-tauri/src/**.rs and
 * src/**.{ts,tsx}, minus the locale files, tests and test helpers. A literal
 * is Dutch when it contains a word from DUTCH_WORDS: words that are common in
 * Dutch UI text and are not English words, so an English sentence never trips
 * the check. Two-letter Dutch words that are also English or a language code
 * ("de", "en", "op", "met", "van") are left out on purpose: precision first, a
 * guard that cries wolf gets switched off.
 *
 * Exceptions live in EXCEPTIONS below, each with the reason it is allowed.
 * The literals that predate the guard are counted per file in BASELINE_PATH,
 * a ceiling that may only go down. An exception or a ceiling that no longer
 * matches the code fails the check, so both lists shrink with the code.
 *
 * Usage: node scripts/quality/no-dutch-ui-strings.mjs [--check | --baseline]
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve as resolvePath, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from '../lib/main-module.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolvePath(HERE, '..', '..');

export const ROOTS = [
  { dir: 'src-tauri/src', ext: ['.rs'] },
  { dir: 'src', ext: ['.ts', '.tsx'] },
];

/** Paths (repo-relative, '/'-separated) that are not shipped UI text. */
const EXCLUDED = [
  /^src\/i18n\/locales\//,
  /(^|\/)__tests__\//,
  /(^|\/)tests?\//,
  /\.test\.(ts|tsx)$/,
  /\.spec\.(ts|tsx)$/,
  /\.d\.ts$/,
];

/**
 * Dutch words that are not also English words. Matched whole-word and
 * case-insensitively, so "het" does not match "whether".
 */
export const DUTCH_WORDS = [
  'het', 'een', 'niet', 'geen', 'wordt', 'worden', 'zijn', 'deze', 'naar',
  'maakt', 'zonder', 'wanneer', 'totdat', 'beschikbaar', 'gevonden', 'blijft',
  'aanwezig', 'gebruiken', 'gebruikt', 'lokale', 'bestand', 'bestanden',
  'bestandssysteem', 'opslaan', 'openen', 'opgeslagen', 'mislukt', 'pagina',
  'paginas', "pagina's", 'kon', 'kan', 'moet', 'ondersteunde', 'ondersteund',
  'ongeldig', 'ongeldige', 'wachtwoord', 'handtekening', 'verwijderen',
  'toevoegen', 'annuleren', 'sluiten', 'bewerken', 'zoeken', 'instellingen',
  'alleen', 'tekst', 'afbeelding', 'geselecteerd', 'invoervelden', 'delen',
  'licentieopslag', 'dictatie', 'scanneradapter', 'voorlezen',
  'ingebouwde', 'herkenning', 'actief', 'wachten', 'bezig', 'klaar', 'fout',
  'vereist', 'scannen', 'wijzigingen', 'ongeldige', 'opnieuw', 'nogmaals',
  'taal', 'talen', 'volgende', 'vorige', 'terug',
  'lettertype', 'lettertypes', 'teken', 'tekens', 'vervangtekst', 'vervangende',
  'vervangingstekens', 'bewerking', 'bewerkbaar', 'bewerkingsmodus', 'tekstveld',
  'ingebed', 'ingebouwd', 'regels', 'beveiligd', 'vergrendeld', 'onbekende',
  'standaard', 'maximaal', 'verkort', 'verkleinen', 'vergroot',
];

const WORD_RE = new RegExp(
  `(^|[^\\p{L}'])(${DUTCH_WORDS.join('|')})(?=$|[^\\p{L}'])`,
  'iu',
);

/**
 * Allowed hits: literals that contain a Dutch word and are not UI text.
 * `literal` is matched exactly. An exception that matches nothing fails.
 */
export const EXCEPTIONS = [
  ...['het', 'een', 'zijn', 'niet', 'naar', 'pagina'].map((literal) => ({
    file: 'src/lib/textIntelligence.ts',
    literal,
    reason: 'Dutch stop-word list used to detect the language of document text; data, never displayed.',
  })),
  {
    file: 'src/viewer/components/AllToolsPanel.tsx',
    literal: 'bewerken',
    reason: 'Internal tab id (ToolTab union); the visible label comes from allTools.tabEdit.',
  },
];

/**
 * Dutch literals that were already in the tree when this guard landed, per
 * file. A ceiling, not an allowance: a file may hold at most this many, a file
 * not listed may hold none, and a ceiling above the real count fails too, so
 * whoever translates one lowers the number in the same change. The list can
 * only shrink.
 */
export const BASELINE_PATH = 'scripts/quality/no-dutch-ui-strings.baseline.json';

export function readBaseline(root = REPO) {
  try {
    return JSON.parse(readFileSync(join(root, BASELINE_PATH), 'utf8')).files ?? {};
  } catch {
    return {};
  }
}

/** Every string literal in a source file, with its 1-based line. Comments are skipped. */
export function stringLiterals(source, lang) {
  const out = [];
  let i = 0;
  let line = 1;
  const n = source.length;
  const push = (text, at) => out.push({ text, line: at });
  while (i < n) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '\n') { line++; i++; continue; }
    if (c === '/' && next === '/') {
      while (i < n && source[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) { if (source[i] === '\n') line++; i++; }
      i += 2;
      continue;
    }
    if (lang === 'rs' && c === 'r' && (next === '"' || next === '#') && !/[\w]/.test(source[i - 1] ?? '')) {
      // Raw string: r"..." or r#"..."#
      let j = i + 1;
      let hashes = 0;
      while (source[j] === '#') { hashes++; j++; }
      if (source[j] === '"') {
        const close = '"' + '#'.repeat(hashes);
        const end = source.indexOf(close, j + 1);
        const stop = end === -1 ? n : end;
        const text = source.slice(j + 1, stop);
        push(text, line);
        line += (text.match(/\n/g) ?? []).length;
        i = stop + close.length;
        continue;
      }
    }
    if (c === '"' || (lang === 'ts' && (c === "'" || c === '`'))) {
      const start = line;
      let j = i + 1;
      let text = '';
      while (j < n && source[j] !== c) {
        if (source[j] === '\\') { text += source[j + 1] ?? ''; j += 2; continue; }
        if (source[j] === '\n') {
          if (c !== '`' && lang === 'ts') break; // unterminated: not a string after all
          line++;
        }
        text += source[j];
        j++;
      }
      push(text, start);
      i = j + 1;
      continue;
    }
    if (lang === 'rs' && c === "'") {
      // Char literal ('a', '\n', '\u{1F600}') or a lifetime ('a): skip either.
      const m = /^'(\\u\{[0-9a-fA-F]+\}|\\.|[^\\'])'/u.exec(source.slice(i, i + 12));
      i += m ? m[0].length : 1;
      continue;
    }
    i++;
  }
  return out;
}

/**
 * Text between JSX tags in a .tsx file, with its 1-based line. A string
 * literal scan cannot see `<strong>XFA-formulier</strong>`: JSX text is not a
 * literal, and that is how a whole Dutch banner shipped past this guard.
 * Comments are blanked first (keeping line breaks) so commented-out markup
 * does not count.
 */
export function jsxTexts(source) {
  const blanked = source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, pre) => pre + ' '.repeat(m.length - pre.length));
  const out = [];
  const re = />([^<>{}]*\p{L}[^<>{}]*)</gu;
  let m;
  while ((m = re.exec(blanked))) {
    const text = m[1].replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const lead = m[1].length - m[1].trimStart().length;
    const line = blanked.slice(0, m.index + 1 + lead).split('\n').length;
    out.push({ text, line });
  }
  return out;
}

function walk(root, dir, exts, files) {
  for (const name of readdirSync(join(root, dir))) {
    const rel = `${dir}/${name}`;
    const st = statSync(join(root, rel));
    if (st.isDirectory()) walk(root, rel, exts, files);
    else if (exts.some((e) => name.endsWith(e))) files.push(rel);
  }
}

export function shippedSources(root = REPO) {
  const files = [];
  for (const { dir, ext } of ROOTS) walk(root, dir, ext, files);
  return files
    .map((f) => f.split(sep).join('/'))
    .filter((f) => !EXCLUDED.some((re) => re.test(f)))
    .sort();
}

/** The Dutch word a literal contains, or null. */
export function dutchWordIn(text) {
  const m = WORD_RE.exec(text);
  return m ? m[2] : null;
}

/** Every Dutch literal in the shipped sources that no exception allows. */
export function findings(root = REPO, exceptions = EXCEPTIONS) {
  const hits = [];
  const used = new Set();
  for (const file of shippedSources(root)) {
    const lang = file.endsWith('.rs') ? 'rs' : 'ts';
    const source = readFileSync(join(root, file), 'utf8');
    const texts = file.endsWith('.tsx') ? [...stringLiterals(source, lang), ...jsxTexts(source)] : stringLiterals(source, lang);
    for (const { text, line } of texts) {
      const word = dutchWordIn(text);
      if (!word) continue;
      const allowed = exceptions.findIndex((e) => e.file === file && text === e.literal);
      if (allowed !== -1) { used.add(allowed); continue; }
      hits.push({ file, line, word, text: text.length > 90 ? `${text.slice(0, 87)}...` : text });
    }
  }
  const stale = exceptions.filter((_, idx) => !used.has(idx));
  return { hits, stale };
}

export function check(root = REPO, exceptions = EXCEPTIONS, baseline = readBaseline(root)) {
  const { hits, stale } = findings(root, exceptions);
  const problems = [];
  const byFile = new Map();
  for (const h of hits) byFile.set(h.file, [...(byFile.get(h.file) ?? []), h]);
  for (const [file, list] of byFile) {
    const ceiling = baseline[file] ?? 0;
    if (list.length <= ceiling) continue;
    problems.push(
      `${file}: ${list.length} Dutch string literal(s), ceiling ${ceiling} -- write new UI text in English ` +
      'or put it in src/i18n/locales:\n' +
      list.map((h) => `      ${file}:${h.line}: "${h.word}" in ${JSON.stringify(h.text)}`).join('\n'),
    );
  }
  for (const [file, ceiling] of Object.entries(baseline)) {
    const actual = byFile.get(file)?.length ?? 0;
    if (actual < ceiling) {
      problems.push(`${file}: ceiling ${ceiling} in ${BASELINE_PATH}, but only ${actual} Dutch literal(s) left -- lower it to ${actual}`);
    }
  }
  for (const e of stale) {
    problems.push(`exception for ${e.file} (${JSON.stringify(e.literal)}) matches nothing any more -- remove it`);
  }
  return problems;
}

/** Write the current per-file counts as the ceiling. For the first landing only. */
export function writeBaseline(root = REPO) {
  const { hits } = findings(root);
  const files = {};
  for (const h of hits) files[h.file] = (files[h.file] ?? 0) + 1;
  const sortedFiles = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
  const doc = {
    reason: 'Dutch UI strings that predate scripts/quality/no-dutch-ui-strings.mjs. Each count is a ceiling ' +
      'that may only go down: translate a literal to English (or move it to src/i18n/locales) and lower the count.',
    files: sortedFiles,
  };
  writeFileSync(join(root, BASELINE_PATH), JSON.stringify(doc, null, 2) + '\n');
  return sortedFiles;
}

function main(argv) {
  if (argv.includes('--baseline')) {
    const files = writeBaseline();
    console.log('Wrote %d file ceiling(s) to %s.', Object.keys(files).length, BASELINE_PATH);
    return 0;
  }
  const problems = check();
  if (problems.length) {
    console.error('no-dutch-ui-strings: %d problem(s)\n', problems.length);
    for (const p of problems) console.error('  - ' + p);
    return 1;
  }
  const debt = Object.values(readBaseline()).reduce((n, c) => n + c, 0);
  console.log('no-dutch-ui-strings: %d shipped source files, no new Dutch string literals (%d known, listed in %s).',
    shippedSources().length, debt, BASELINE_PATH);
  return 0;
}

if (isMainModule(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
