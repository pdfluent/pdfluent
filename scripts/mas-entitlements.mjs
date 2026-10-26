// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// mas-entitlements.mjs — prove that what was signed is what we asked for.
//
// The MAS build signs three times (Tauri during the build, once per nested
// helper, once more to re-seal the outer app). Any of those can be handed the
// wrong entitlements file, and the result still installs, still launches and
// still passes `codesign --verify`. App Store review is where it surfaces: a
// missing `app-sandbox` is an outright rejection, and a stray `cs.*` exception
// is a rejection with a justification request attached.
//
// So the signature is read back and compared, key by key, with the file we
// intended to sign with. Extra keys, missing keys and changed values all fail.
//
// usage:
//   node scripts/mas-entitlements.mjs --app <path.app> [--expected <plist>]
//   node scripts/mas-entitlements.mjs --pkg <path.pkg> [--expected <plist>]
//   node scripts/mas-entitlements.mjs --actual <plist> --expected <plist>
//   node scripts/mas-entitlements.mjs --pkg <path.pkg> --helpers
//
// --helpers: after the app itself, also read the signature of every nested
// Mach-O executable (the bundled Tesseract among them) and compare it with
// src-tauri/Entitlements.appstore.inherit.plist. A helper signed without
// `com.apple.security.inherit` is killed by the sandbox the first time the app
// starts it -- OCR would work on the build machine and nowhere else. The
// bundled OCR binary must be among the helpers found.
//
// --app/--pkg need macOS (codesign, pkgutil); --actual works anywhere, which is
// what the unit tests drive.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
export const DEFAULT_EXPECTED = join(ROOT, 'src-tauri', 'Entitlements.appstore.plist');
export const INHERIT_EXPECTED = join(ROOT, 'src-tauri', 'Entitlements.appstore.inherit.plist');
/** The bundled OCR binary, relative to the .app. */
export const OCR_HELPER = 'Contents/Resources/resources/ocr/bin/tesseract';

/**
 * Parse the flat entitlements dict of a plist into a Map of key -> value.
 *
 * Deliberately narrow: entitlements are a flat dict of booleans, strings,
 * integers and string arrays, and anything else means the input is not what
 * this comparison assumes. Such a value throws rather than being skipped —
 * a parser that silently drops what it does not recognise reports "equal" for
 * two files it never actually compared.
 */
export function parseEntitlements(xml) {
  const body = xml.replace(/<!--[\s\S]*?-->/g, '');
  const open = body.indexOf('<dict>');
  const close = body.lastIndexOf('</dict>');
  if (open === -1 || close === -1) throw new Error('no <dict> in plist');
  const inner = body.slice(open + '<dict>'.length, close);

  const TOKEN =
    /<key>([\s\S]*?)<\/key>|<(true|false)\s*\/>|<(string|integer|real|date|data)>([\s\S]*?)<\/\3>|<(string|integer|real|date|data)\s*\/>|<array\s*\/>|<(array|dict)>|<\/(array|dict)>/g;

  const unescape = (t) =>
    t
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&')
      .trim();

  const out = new Map();
  let key = null;
  let inArray = null;

  const put = (value) => {
    if (inArray !== null) {
      out.get(inArray).push(value);
      return;
    }
    if (key === null) throw new Error(`value ${JSON.stringify(value)} without a key`);
    out.set(key, value);
    key = null;
  };

  for (const m of inner.matchAll(TOKEN)) {
    const [tok, keyText, bool, scalarTag, scalarText, emptyScalarTag, openTag, closeTag] = m;
    if (keyText !== undefined) {
      if (inArray !== null) throw new Error(`<key> inside the array for '${inArray}'`);
      if (key !== null) throw new Error(`key '${key}' has no value`);
      key = unescape(keyText);
    } else if (bool !== undefined) {
      put(bool === 'true');
    } else if (scalarTag !== undefined) {
      if (scalarTag === 'data' || scalarTag === 'date' || scalarTag === 'real') {
        throw new Error(`unsupported entitlement value type <${scalarTag}>`);
      }
      put(scalarTag === 'integer' ? Number(unescape(scalarText)) : unescape(scalarText));
    } else if (emptyScalarTag !== undefined) {
      if (emptyScalarTag !== 'string') throw new Error(`unsupported empty value <${emptyScalarTag}/>`);
      put('');
    } else if (tok.startsWith('<array/') || tok.startsWith('<array /')) {
      if (key === null) throw new Error('empty array without a key');
      out.set(key, []);
      key = null;
    } else if (openTag !== undefined) {
      if (openTag === 'dict') throw new Error('nested dictionaries are not supported');
      if (inArray !== null) throw new Error('nested arrays are not supported');
      if (key === null) throw new Error('array without a key');
      inArray = key;
      out.set(key, []);
      key = null;
    } else if (closeTag !== undefined) {
      if (closeTag === 'dict') throw new Error('nested dictionaries are not supported');
      if (inArray === null) throw new Error('</array> without <array>');
      inArray = null;
    }
  }

  if (key !== null) throw new Error(`key '${key}' has no value`);
  if (inArray !== null) throw new Error(`unterminated array for '${inArray}'`);
  // Everything between the tokens must be whitespace. A plist element this
  // parser does not know would otherwise be skipped in silence, and two files
  // would compare equal on the strength of what neither of them was read for.
  const leftover = inner.replace(TOKEN, '').trim();
  if (leftover) throw new Error(`unrecognised content in the entitlements dict: ${leftover.slice(0, 80)}`);
  return out;
}

const show = (v) => (Array.isArray(v) ? `[${v.join(', ')}]` : String(v));

/** Differences between what we intended to sign with and what is in the signature. */
export function diffEntitlements(expected, actual) {
  const problems = [];
  for (const [k, v] of expected) {
    if (!actual.has(k)) problems.push(`missing: ${k} (expected ${show(v)})`);
    else if (show(actual.get(k)) !== show(v)) {
      problems.push(`changed: ${k} — expected ${show(v)}, signed ${show(actual.get(k))}`);
    }
  }
  for (const k of actual.keys()) {
    if (!expected.has(k)) problems.push(`extra: ${k} = ${show(actual.get(k))} — not in the expected file`);
  }
  return problems.sort();
}

/**
 * Whether this bundle carries an App Store signature.
 *
 * `scripts/build-mas.sh` and an ordinary release build put their .app at the
 * same path under target/, so finding one there says nothing about which build
 * made it. Judging a Developer ID build against the App Store entitlements
 * reports three cs.* exceptions and three missing App Store keys -- every line
 * true, and none of them a defect, because a Developer ID build is meant to
 * carry exactly that set. It turned the gate red on the release machine on
 * 2026-09-10, hours after a Developer ID build, with a message about
 * entitlements.
 *
 * The certificate is what tells the two builds apart, and it says so without
 * consulting the entitlements this file exists to judge -- which matters: the
 * App Store keys are among the things a bad MAS build gets wrong, so they
 * cannot also be what decides whether to look.
 */
export function signedForTheAppStore(
  app,
  // Injectable so the judgement is testable where codesign does not exist and a
  // stub script cannot be put on PATH (Windows, #731).
  describeSignature = (path) => spawnSync('codesign', ['-dvv', path], { encoding: 'utf8' }),
) {
  const run = describeSignature(app);
  // codesign writes its description to stderr.
  return /^Authority=(Apple Distribution|3rd Party Mac Developer Application)/m.test(
    `${run.stdout ?? ''}${run.stderr ?? ''}`,
  );
}

/**
 * Paths (relative to the .app) of every nested Mach-O the build signs with the
 * inherit entitlements: all executables and libraries under Contents except
 * the app's own main executable. `describe` is injectable for tests.
 */
export function nestedHelpers(
  app,
  list = (dir) =>
    execFileSync('/usr/bin/find', [dir, '-type', 'f', '(', '-perm', '-u+x', '-o', '-name', '*.dylib', '-o', '-name', '*.so', ')'], {
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean),
  isMachO = (path) => /Mach-O/.test(execFileSync('file', ['-b', path], { encoding: 'utf8' })),
) {
  // An app bundle is a POSIX tree whatever machine inspects it.
  const macos = posix.join(app, 'Contents', 'MacOS') + '/';
  return list(posix.join(app, 'Contents'))
    .filter((p) => !p.startsWith(macos) && isMachO(p))
    .map((p) => p.slice(app.length + 1))
    .sort();
}

/**
 * What is wrong with the helpers' signatures. `read(relPath)` returns the
 * entitlements XML of one helper.
 */
export function helperProblems(helpers, expected, read, required = [OCR_HELPER]) {
  const problems = [];
  for (const need of required) {
    if (!helpers.includes(need)) problems.push(`${need}: not in the app (the store build bundles OCR)`);
  }
  for (const h of helpers) {
    try {
      for (const p of diffEntitlements(expected, parseEntitlements(read(h)))) problems.push(`${h}: ${p}`);
    } catch (e) {
      problems.push(`${h}: ${e.message}`);
    }
  }
  return problems;
}

function entitlementsOfApp(app) {
  return execFileSync('codesign', ['-d', '--entitlements', '-', '--xml', app], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 8 * 1024 * 1024,
  });
}

/** Expand an installer .pkg and return the path of the single .app it carries. */
function appInsidePkg(pkg, into) {
  execFileSync('pkgutil', ['--expand-full', pkg, into], { stdio: ['ignore', 'ignore', 'pipe'] });
  const found = execFileSync('/usr/bin/find', [into, '-maxdepth', '6', '-name', '*.app', '-type', 'd'], {
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
    // Nested helper .apps sort deeper; the outermost path is the product.
    .sort((a, b) => a.split('/').length - b.split('/').length);
  if (!found.length) throw new Error(`no .app inside ${pkg}`);
  return found[0];
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
}

function main() {
  const expectedPath = arg('--expected') ?? DEFAULT_EXPECTED;
  const app = arg('--app');
  const pkg = arg('--pkg');
  const actualPath = arg('--actual');
  if (!app && !pkg && !actualPath) {
    console.error('usage: mas-entitlements.mjs (--app <a.app> | --pkg <a.pkg> | --actual <plist>) [--expected <plist>]');
    process.exit(2);
  }

  const checkHelpers = process.argv.includes('--helpers');
  let actualXml;
  let subject;
  let scratch = null;
  let helperApp = null;
  try {
    if (actualPath) {
      subject = actualPath;
      actualXml = readFileSync(actualPath, 'utf8');
    } else if (app) {
      if (!existsSync(app)) throw new Error(`no app bundle at ${app}`);
      subject = app;
      helperApp = app;
      actualXml = entitlementsOfApp(app);
    } else {
      if (!existsSync(pkg)) throw new Error(`no package at ${pkg}`);
      scratch = mkdtempSync(join(tmpdir(), 'mas-ent-'));
      const inner = appInsidePkg(pkg, join(scratch, 'x'));
      subject = `${pkg} → ${inner.slice(scratch.length)}`;
      helperApp = inner;
      actualXml = entitlementsOfApp(inner);
    }
  } catch (e) {
    console.error(`✘ MAS ENTITLEMENTS: ${e.message}`);
    if (scratch) rmSync(scratch, { recursive: true, force: true });
    process.exit(1);
  }

  let problems;
  try {
    problems = diffEntitlements(parseEntitlements(readFileSync(expectedPath, 'utf8')), parseEntitlements(actualXml));
  } catch (e) {
    console.error(`✘ MAS ENTITLEMENTS: could not compare — ${e.message}`);
    if (scratch) rmSync(scratch, { recursive: true, force: true });
    process.exit(1);
  }
  let helperIssues = [];
  if (checkHelpers) {
    if (!helperApp) {
      console.error('✘ MAS ENTITLEMENTS: --helpers needs --app or --pkg');
      process.exit(2);
    }
    try {
      helperIssues = helperProblems(
        nestedHelpers(helperApp),
        parseEntitlements(readFileSync(INHERIT_EXPECTED, 'utf8')),
        (h) => entitlementsOfApp(join(helperApp, h)),
      );
    } catch (e) {
      helperIssues = [`could not read the helpers: ${e.message}`];
    }
  }
  if (scratch) rmSync(scratch, { recursive: true, force: true });

  if (helperIssues.length) {
    console.error(`✘ MAS HELPER ENTITLEMENTS differ from ${INHERIT_EXPECTED.slice(ROOT.length + 1)}:`);
    for (const p of helperIssues) console.error(`   ${p}`);
    process.exit(1);
  }
  if (problems.length) {
    console.error(`✘ MAS ENTITLEMENTS differ from ${expectedPath.slice(ROOT.length + 1)}:`);
    for (const p of problems) console.error(`   ${p}`);
    process.exit(1);
  }
  console.log(`✅ MAS ENTITLEMENTS OK — signature of ${subject} equals ${expectedPath.slice(ROOT.length + 1)}${checkHelpers ? ' (nested helpers too)' : ''}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main();
