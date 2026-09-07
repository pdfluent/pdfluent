// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * Every locale carries every key, and the ones that are English say so.
 *
 * The editor ships 27 locales. Twenty-five of them were missing the same 64
 * keys -- the whole About dialog, the update prompts, the organise toasts, the
 * external-link consent -- and nothing failed, because i18next falls back to
 * English at runtime. A missing key and a translated key look identical to the
 * app and to the person adding the next one, so the gap grew with every
 * feature that landed.
 *
 * Two rules, both enforced by tests/i18n-key-parity.test.ts:
 *
 *  - Key parity. Every locale has exactly the keys en.json has. `--fill` closes
 *    a gap by copying the English string, which is what the user was already
 *    seeing, and drops a key en.json no longer has.
 *  - An honest backlog. Every key filled that way is listed in
 *    src/i18n/untranslated.json, so a translator has the worklist and nobody
 *    mistakes an English placeholder for a decision. Translate one and remove
 *    its entry; leave the entry behind and the check fails, the same way a
 *    stale exception fails the UI register.
 *
 * Usage: node scripts/quality/i18n-parity.mjs [--check | --fill]
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolvePath(HERE, '..', '..');

export const LOCALES_DIR = 'src/i18n/locales';
export const SOURCE_LOCALE = 'en';
export const UNTRANSLATED_PATH = 'src/i18n/untranslated.json';

/** Every key of a locale tree as a dotted path, with its string value. */
export function flatten(tree, prefix = '', out = new Map()) {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) flatten(value, path, out);
    else out.set(path, value);
  }
  return out;
}

/** Remove a dotted key, and any object it leaves empty behind it. */
function deletePath(tree, dotted) {
  const parts = dotted.split('.');
  const chain = [tree];
  for (const part of parts.slice(0, -1)) {
    const next = chain[chain.length - 1]?.[part];
    if (next === undefined || typeof next !== 'object') return;
    chain.push(next);
  }
  delete chain[chain.length - 1][parts[parts.length - 1]];
  for (let i = chain.length - 1; i > 0; i--) {
    if (Object.keys(chain[i]).length) break;
    delete chain[i - 1][parts[i - 1]];
  }
}

function setPath(tree, dotted, value) {
  const parts = dotted.split('.');
  let cur = tree;
  for (const part of parts.slice(0, -1)) {
    if (cur[part] === undefined || typeof cur[part] !== 'object') cur[part] = {};
    cur = cur[part];
  }
  cur[parts[parts.length - 1]] = value;
}

/** Rebuild the tree with every object's keys in sorted order, as the files are written. */
function sorted(tree) {
  if (tree === null || typeof tree !== 'object' || Array.isArray(tree)) return tree;
  const out = {};
  for (const key of Object.keys(tree).sort()) out[key] = sorted(tree[key]);
  return out;
}

export function localeNames(root = REPO) {
  return readdirSync(join(root, LOCALES_DIR))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
}

export function readLocale(name, root = REPO) {
  return JSON.parse(readFileSync(join(root, LOCALES_DIR, `${name}.json`), 'utf8'));
}

export function readUntranslated(root = REPO) {
  try {
    return JSON.parse(readFileSync(join(root, UNTRANSLATED_PATH), 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Everything wrong with the locale set right now, as sentences.
 *
 * An empty array is the only acceptable result on a release branch.
 */
export function check(root = REPO) {
  const problems = [];
  const source = flatten(readLocale(SOURCE_LOCALE, root));
  const backlog = readUntranslated(root);

  for (const name of localeNames(root)) {
    if (name === SOURCE_LOCALE) continue;
    const locale = flatten(readLocale(name, root));

    const missing = [...source.keys()].filter((k) => !locale.has(k));
    if (missing.length) {
      problems.push(
        `${name}: ${missing.length} key(s) missing (${missing.slice(0, 5).join(', ')}` +
        `${missing.length > 5 ? ', …' : ''}) — run \`node scripts/quality/i18n-parity.mjs --fill\``
      );
    }

    const extra = [...locale.keys()].filter((k) => !source.has(k));
    if (extra.length) {
      problems.push(
        `${name}: ${extra.length} key(s) that ${SOURCE_LOCALE}.json does not have ` +
        `(${extra.slice(0, 5).join(', ')}${extra.length > 5 ? ', …' : ''}) — a rename or a removal ` +
        'left them behind; run `node scripts/quality/i18n-parity.mjs --fill`'
      );
    }

    for (const key of backlog[name] ?? []) {
      if (!source.has(key)) {
        problems.push(`${name}: ${UNTRANSLATED_PATH} lists ${key}, which no longer exists — remove it`);
        continue;
      }
      if (locale.get(key) !== source.get(key)) {
        problems.push(`${name}: ${key} is translated now — remove it from ${UNTRANSLATED_PATH}`);
      }
    }
  }
  return problems;
}

/**
 * Make every locale carry exactly en.json's keys, and record the copies.
 *
 * Both directions, because the check reports both: a missing key gets the
 * English string, and a key en.json no longer has is removed. Removing a
 * control used to leave an orphan in 25 locales that `--fill` could not clear,
 * so the only advice the red check gave did not work.
 */
export function fill(root = REPO) {
  const source = flatten(readLocale(SOURCE_LOCALE, root));
  const backlog = readUntranslated(root);
  const filled = {};

  for (const name of localeNames(root)) {
    if (name === SOURCE_LOCALE) continue;
    const tree = readLocale(name, root);
    const locale = flatten(tree);
    const missing = [...source.keys()].filter((k) => !locale.has(k));
    for (const key of missing) setPath(tree, key, source.get(key));
    for (const key of locale.keys()) if (!source.has(key)) deletePath(tree, key);

    const stillEnglish = new Set([...(backlog[name] ?? []), ...missing]).values();
    const kept = [...stillEnglish]
      .filter((k) => source.has(k) && flatten(tree).get(k) === source.get(k))
      .sort();
    if (kept.length) filled[name] = kept;

    // Existing key order is left alone: a re-sort would bury the fill in a
    // rename of every line and make the diff unreadable.
    writeFileSync(join(root, LOCALES_DIR, `${name}.json`), JSON.stringify(tree, null, 2) + '\n');
  }

  writeFileSync(join(root, UNTRANSLATED_PATH), JSON.stringify(sorted(filled), null, 2) + '\n');
  return filled;
}

function main(argv) {
  if (argv.includes('--fill')) {
    const filled = fill();
    const total = Object.values(filled).reduce((n, keys) => n + keys.length, 0);
    console.log('Filled from %s and recorded %d key(s) across %d locale(s) in %s.',
      SOURCE_LOCALE, total, Object.keys(filled).length, UNTRANSLATED_PATH);
    return 0;
  }
  const problems = check();
  if (problems.length) {
    console.error('i18n parity: %d problem(s)\n', problems.length);
    for (const p of problems) console.error('  - ' + p);
    return 1;
  }
  console.log('i18n parity: %d locales, all carrying the same keys.', localeNames().length);
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith('i18n-parity.mjs')) {
  process.exit(main(process.argv.slice(2)));
}
