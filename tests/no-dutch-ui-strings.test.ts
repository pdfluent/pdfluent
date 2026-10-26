// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * No new Dutch UI text in the shipped sources.
 *
 * The native capability list ("Bestandssysteem en mailto", "Delen maakt lokale
 * bestanden of maildrafts zonder upload") and the read-aloud errors were Dutch
 * in every one of the 27 locales, because they were written straight into
 * src-tauri/src/lib.rs instead of going through src/i18n. Red when: a Dutch
 * literal lands in a file that had none, a file grows past its ceiling in
 * scripts/quality/no-dutch-ui-strings.baseline.json, or a ceiling is left
 * above the real count after a translation.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  check,
  dutchWordIn,
  findings,
  jsxTexts,
  readBaseline,
  stringLiterals,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore -- plain ESM tool script, deliberately not part of the app build
} from '../scripts/quality/no-dutch-ui-strings.mjs';

interface Literal { text: string; line: number }
interface Hit { file: string; line: number; word: string; text: string }

function fixture(files: Record<string, string>, baseline?: Record<string, number>): string {
  const root = mkdtempSync(join(tmpdir(), 'no-dutch-'));
  mkdirSync(join(root, 'src-tauri', 'src'), { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'scripts', 'quality'), { recursive: true });
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  writeFileSync(
    join(root, 'scripts', 'quality', 'no-dutch-ui-strings.baseline.json'),
    JSON.stringify({ files: baseline ?? {} }),
  );
  return root;
}

describe('no Dutch UI strings in shipped sources', () => {
  it('the tree has no Dutch literal beyond the recorded ceilings', () => {
    expect(check()).toEqual([]);
  });

  it('the native capability list and read-aloud errors in lib.rs are English', () => {
    const { hits } = findings() as { hits: Hit[] };
    const libHits = hits.filter((h) => h.file === 'src-tauri/src/lib.rs');
    expect(libHits.map((h) => `${h.line}: ${h.text}`)).toEqual([]);
    expect(Object.keys(readBaseline() as Record<string, number>)).not.toContain('src-tauri/src/lib.rs');
    const webHits = hits.filter((h) => h.file === 'src/platform/native/nativeServices.ts');
    expect(webHits.map((h) => `${h.line}: ${h.text}`)).toEqual([]);
  });

  it('flags the strings that shipped, and not English or comments', () => {
    expect(dutchWordIn('Bestandssysteem en mailto')).toBe('Bestandssysteem');
    expect(dutchWordIn('Delen maakt lokale bestanden of maildrafts zonder upload.')).not.toBeNull();
    expect(dutchWordIn('PDFluent reageert niet')).toBe('niet');
    expect(dutchWordIn('File system and mailto')).toBeNull();
    expect(dutchWordIn('Whether the theme is set')).toBeNull();
    expect(dutchWordIn('Sharing creates local files or email drafts, without uploading anything.')).toBeNull();

    const rust = [
      '// Bestandssysteem en mailto, in a comment',
      'fn x() -> &\'static str { let c = \'a\'; "File system" }',
      'fn y<\'a>(s: &\'a str) -> &\'a str { r#"Geen secret store"# }',
    ].join('\n');
    const texts = (stringLiterals(rust, 'rs') as Literal[]).map((l) => l.text);
    expect(texts).toEqual(['File system', 'Geen secret store']);

    const ts = "const url = 'https://x.nl/a'; // geen tekst\n/* niet */ const s = `Geen ${x} tekst`;";
    expect((stringLiterals(ts, 'ts') as Literal[]).map((l) => l.text)).toEqual(['https://x.nl/a', 'Geen ${x} tekst']);
  });

  it('a new Dutch literal fails; English, tests and locales do not', () => {
    const root = fixture({
      'src-tauri/src/lib.rs': 'fn f() { native_feature("available", "Bestandssysteem en mailto", "ok", true); }\n',
      'src/ok.ts': "export const a = 'All changes saved';\n",
      'src/__tests__/x.test.ts': "expect('Geen tekst').toBe('x');\n",
      'src/i18n/locales/nl.json': '{"a": "Geen tekst"}',
    });
    const problems = check(root, []) as string[];
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('src-tauri/src/lib.rs');
    expect(problems[0]).toContain('Bestandssysteem');
  });

  it('reads JSX text too: the Dutch XFA banner was markup, not a literal', () => {
    const root = fixture({
      'src/viewer/Banner.tsx':
        'export const B = () => (\n  <div>\n    {/* <p>Dit is uitgecommentarieerd</p> */}\n    <p>\n      Dit XFA-formulier wordt weergegeven.\n    </p>\n    <button>{t("common.close")}</button>\n  </div>\n);\n',
      'src/viewer/Ok.tsx': 'export const O = () => <p>This XFA form is shown as it is.</p>;\n',
    });
    const problems = check(root, []) as string[];
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('src/viewer/Banner.tsx:5');
    expect((jsxTexts('<b>a</b>\n<i>Sluiten</i>') as Literal[]).map((t) => t.line)).toEqual([1, 2]);
  });

  it('the XFA banner, the form bar and the busy overlay are i18n now', () => {
    const { hits } = findings() as { hits: Hit[] };
    const files = new Set(hits.map((h) => h.file));
    for (const f of ['src/viewer/ViewerApp.tsx', 'src/viewer/components/FormBar.tsx', 'src/viewer/components/BusyStateOverlay.tsx', 'src/viewer/components/ShortcutSheet.tsx']) {
      expect(files.has(f), f).toBe(false);
    }
  });

  it('the ceiling is a ratchet: growing past it fails, and so does leaving it too high', () => {
    const body = "export const a = 'Geen tekst';\nexport const b = 'Niet gevonden';\n";
    expect(check(fixture({ 'src/a.ts': body }, { 'src/a.ts': 2 }), [])).toEqual([]);

    const grown = check(fixture({ 'src/a.ts': body }, { 'src/a.ts': 1 }), []) as string[];
    expect(grown.join('\n')).toMatch(/2 Dutch string literal\(s\), ceiling 1/);

    const stale = check(fixture({ 'src/a.ts': body }, { 'src/a.ts': 3 }), []) as string[];
    expect(stale.join('\n')).toMatch(/lower it to 2/);
  });

  it('an exception that matches nothing fails', () => {
    const root = fixture({ 'src/a.ts': "export const a = 'fine';\n" });
    const problems = check(root, [{ file: 'src/a.ts', literal: 'het', reason: 'test' }]) as string[];
    expect(problems.join('\n')).toMatch(/matches nothing any more/);
  });
});
