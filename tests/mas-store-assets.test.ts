// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * The Mac App Store dossier, held against the app it describes.
 *
 * A store listing is the one piece of text about this product that a stranger
 * reads before running it, and it is written once and then left alone. The
 * Microsoft Store dossier drifted exactly that way: it still called the Partner
 * Center account "the gate" six weeks after the listing went live, and one
 * screenshot advertised a button that had been removed from the app.
 *
 * So the claims in `store/mas/listing.md` are not prose here. Every feature
 * bullet names its proof, and this file resolves each one against the generated
 * UI register or against the command table in the Rust backend. Unwire a tool and
 * this test names the sentence that has to come out of the listing.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  WIRED_TILES_ALL_RUNTIMES,
  WIRED_TILES_TAURI_ONLY,
} from '../src/viewer/tools/wiredTools.generated';

const ROOT = resolve(import.meta.dirname, '..');
const MAS = join(ROOT, 'store', 'mas');
const listing = readFileSync(join(MAS, 'listing.md'), 'utf8');

/** Width and height from a PNG's IHDR, without pulling in an image library. */
function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(file);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buf.subarray(0, 8).equals(signature)) throw new Error(`${file} is not a PNG`);
  if (buf.toString('latin1', 12, 16) !== 'IHDR') throw new Error(`${file} has no IHDR`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** The single-line value of a `| Field (n) | \`value\` |` row. */
function field(name: string): string {
  const row = listing.split('\n').find((l) => l.startsWith(`| ${name} `) || l.startsWith(`| ${name} |`));
  if (!row) throw new Error(`no '${name}' row in listing.md`);
  return (row.split('|')[2] ?? '').trim().replace(/^`|`$/g, '');
}

describe('MAS dossier is complete', () => {
  it.each([
    ['README.md', 'the state of the submission'],
    ['listing.md', 'every App Store Connect text field'],
    ['eula.md', 'the custom licence agreement and the free-for-business note'],
    ['privacy.md', 'the App Privacy declaration'],
    ['export-compliance.md', 'the encryption questions'],
    ['review-notes.md', 'the reviewer note and the TestFlight smoke'],
    ['UPLOAD-RUNBOOK.md', 'the two upload routes'],
    ['build-number', 'the build counter'],
  ])('has %s — %s', (file) => {
    const path = join(MAS, file);
    expect(existsSync(path), `${file} is missing from store/mas/`).toBe(true);
    expect(readFileSync(path, 'utf8').trim().length).toBeGreaterThan(0);
  });

  it('says in one place that the app is free for commercial use', () => {
    // The single fact a reviewer has to be able to find. It decides guideline
    // 2.4.5(vi) and every "how is this monetised" question on the form.
    expect(readFileSync(join(MAS, 'eula.md'), 'utf8')).toContain(
      'free for everyone, including commercial and business use',
    );
  });
});

describe('MAS listing fits the App Store fields', () => {
  it('keeps the name within 30 characters', () => {
    expect(field('Name (30)').length).toBeLessThanOrEqual(30);
  });

  it('keeps the subtitle within 30 characters', () => {
    expect(field('Subtitle (30)').length).toBeLessThanOrEqual(30);
  });

  it('keeps the keyword string within 100 characters', () => {
    const keywords = listing.split('```')[1]?.trim() ?? '';
    expect(keywords.length).toBeGreaterThan(0);
    expect(keywords.length).toBeLessThanOrEqual(100);
    // Apple splits on commas; a space after one wastes a character of the 100.
    expect(keywords).not.toMatch(/,\s/);
  });

  it('keeps the promotional text within 170 characters', () => {
    const promo = listing.split('## Promotional text (170)')[1]?.split('##')[0]?.trim() ?? '';
    expect(promo.length).toBeGreaterThan(0);
    expect(promo.length).toBeLessThanOrEqual(170);
  });

  it('promises nothing the app does not have', () => {
    for (const phrase of ['invite to sign', 'cloud sync', 'ai summary', 'subscription plan']) {
      const body = listing.split('## Description')[1]?.split('## Feature bullets')[0] ?? '';
      expect(body.toLowerCase()).not.toContain(phrase);
    }
  });
});

describe('every feature bullet rests on something that exists', () => {
  const wiredTiles = new Set([...WIRED_TILES_ALL_RUNTIMES, ...WIRED_TILES_TAURI_ONLY]);
  const backend = readFileSync(join(ROOT, 'src-tauri', 'src', 'lib.rs'), 'utf8');
  const handlerList = backend.slice(backend.indexOf('generate_handler!'));

  function frontendInvokes(command: string): boolean {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? e.name === '__tests__' || e.name === 'legacy'
            ? []
            : walk(join(dir, e.name))
          : /\.tsx?$/.test(e.name) && !e.name.includes('.test.')
            ? [join(dir, e.name)]
            : [],
      );
    return walk(join(ROOT, 'src', 'viewer')).some((f) =>
      readFileSync(f, 'utf8').includes(`invoke('${command}'`),
    );
  }

  const rows = listing
    .split('| Bullet | Proven by |')[1]
    .split('\n')
    .filter((l) => l.startsWith('|') && !l.startsWith('|---'))
    .map((l) => {
      const cells = l.split('|');
      return { bullet: (cells[1] ?? '').trim(), proofs: (cells[2] ?? '').trim() };
    })
    .filter((r) => r.bullet.length > 0);

  it('lists a bullet table at all', () => {
    expect(rows.length).toBeGreaterThanOrEqual(10);
  });

  it.each(rows.map((r) => [r.bullet, r.proofs] as const))('"%s"', (_bullet, proofs) => {
    const ids = [...proofs.matchAll(/`(tile|command):([A-Za-z0-9_.]+)`/g)];
    expect(ids.length, `no tile: or command: proof given`).toBeGreaterThan(0);
    for (const [, kind, id] of ids) {
      if (kind === 'tile') {
        expect(wiredTiles.has(id), `${id} is not a wired tile in the UI register`).toBe(true);
      } else {
        expect(handlerList.includes(id), `${id} is not registered in src-tauri/src/lib.rs`).toBe(true);
        expect(frontendInvokes(id), `nothing in the shipped shell invokes ${id}`).toBe(true);
      }
    }
  });
});

describe('MAS screenshots', () => {
  const dir = join(MAS, 'screenshots');
  const shots = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.png')).sort() : [];

  it('has six of them', () => {
    expect(shots).toHaveLength(6);
  });

  it('names them for the six scenes', () => {
    expect(shots).toEqual([
      '01-welcome.png',
      '02-reading.png',
      '03-edit.png',
      '04-convert.png',
      '05-tools.png',
      '06-sign.png',
    ]);
  });

  it.each(shots)('%s is 2880x1800, the largest size the Mac App Store takes', (name) => {
    // Apple accepts 1280x800, 1440x900, 2560x1600 and 2880x1800 for macOS. A
    // capture that is one pixel off is rejected at upload, after the build.
    expect(pngSize(join(dir, name))).toEqual({ width: 2880, height: 1800 });
  });

  it('describes where they came from', () => {
    const doc = join(dir, 'SCREENSHOTS.md');
    expect(existsSync(doc)).toBe(true);
    expect(readFileSync(doc, 'utf8')).toContain('2880');
  });
});
