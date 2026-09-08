// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// The store screenshots must show the app the store will ship.
//
// The previous set went out with an "Invite to sign" button that has never
// existed, and nothing caught it: a screenshot is reviewed by eye, once, by
// whoever exported it. This reads docs/store_visuals_parity.json — every
// control the six renders show — and resolves each one against
// docs/UI_REGISTER.md, which is generated from the code and gated. A control
// that leaves the shell leaves the register, and this goes red.
//
// It is also the gate on uploading. A `blocked` row is a control the image
// promises and the app does not have; while an image has one, no derivative of
// it may enter docs/media/ and it does not go to a store.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');

/** Section heading in the register → the `kind` half of an affordance ref. */
const KIND_BY_HEADING: Record<string, string> = {
  'All-tools tiles': 'tile',
  'Right-hand panels': 'panel',
  'Mode tabs': 'mode-tab',
  'Left rail tools': 'rail-tool',
  'Command palette': 'palette',
  'Buttons with a test id': 'button',
  'Advertised keyboard shortcuts': 'shortcut',
  'LeftNavRail panels': 'rail-panel',
  'ModeSwitcher tabs': 'mode',
};

/** The two states the register itself says must not exist. */
const DEAD_STATES = new Set(['NO ACTION', 'UNREACHABLE']);

interface ShowsRow {
  control: string;
  affordance?: string;
  whyNoAffordance?: string;
}

interface BlockedRow {
  control: string;
  shipped: string;
  decision: string;
}

interface ImageEntry {
  id: string;
  headline: string;
  surface: string;
  shows: ShowsRow[];
  blocked: BlockedRow[];
}

/**
 * Read the generated register into `kind:id` → state.
 *
 * Parsing the markdown rather than re-running the walker is deliberate: the
 * markdown is the artefact people read and the artefact `quality:ui-register`
 * keeps honest, so a drift between the two cannot hide here.
 */
export function parseRegister(markdown: string): Map<string, string> {
  const states = new Map<string, string>();
  let kind: string | null = null;
  for (const line of markdown.split('\n')) {
    const heading = /^## (.+)$/.exec(line);
    if (heading) {
      kind = KIND_BY_HEADING[heading[1].trim()] ?? null;
      continue;
    }
    if (kind === null) continue;
    const row = /^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/.exec(line);
    if (row) states.set(`${kind}:${row[1]}`, row[2]);
  }
  return states;
}

const register = parseRegister(readFileSync(resolve(root, 'docs/UI_REGISTER.md'), 'utf8'));
const manifest = JSON.parse(
  readFileSync(resolve(root, 'docs/store_visuals_parity.json'), 'utf8'),
) as { checkedOn: string; images: ImageEntry[] };

describe('parseRegister', () => {
  it('reads a row under its section heading', () => {
    const states = parseRegister(
      ['## Mode tabs', '', '| affordance | state |', '|---|---|', '| `edit` | `wired` | x |'].join('\n'),
    );
    expect(states.get('mode-tab:edit')).toBe('wired');
  });

  it('ignores rows under a heading it does not know', () => {
    const states = parseRegister(
      ['## Components nothing renders', '', '| `TopBar.tsx` | `x` |'].join('\n'),
    );
    expect(states.size).toBe(0);
  });

  it('finds the real register non-empty, so an unreadable file cannot pass as clean', () => {
    expect(register.size).toBeGreaterThan(100);
  });
});

describe('store visuals parity', () => {
  it('covers all six renders, once each', () => {
    // Prefixed, not bare digits. The register walker proves a keyboard shortcut
    // by looking for its key, in quotes, beside the word keyboard -- and this
    // file has that word in the heading map above. A quoted single digit here
    // would record this test as proof of the mode shortcuts, which it does not
    // exercise: proof invented by coincidence is what the register exists to
    // catch. Hence the ids, and hence no digit in quotes anywhere in this file.
    expect(manifest.images.map((image) => image.id)).toEqual(
      [1, 2, 3, 4, 5, 6].map((n) => `store-${n}`),
    );
  });

  for (const image of manifest.images) {
    describe(`image ${image.id} — ${image.headline}`, () => {
      it('names at least one control', () => {
        expect(image.shows.length).toBeGreaterThan(0);
      });

      it('does not claim the same affordance twice', () => {
        const refs = image.shows.map((row) => row.affordance).filter(Boolean);
        expect(new Set(refs).size).toBe(refs.length);
      });

      for (const row of image.shows) {
        if (row.affordance === undefined) {
          it(`explains why "${row.control}" has no affordance`, () => {
            expect(row.whyNoAffordance ?? '').not.toBe('');
          });
          continue;
        }

        it(`"${row.control}" is still in the register as ${row.affordance}`, () => {
          expect(register.has(row.affordance as string)).toBe(true);
        });

        it(`"${row.control}" still reaches something`, () => {
          const state = register.get(row.affordance as string);
          expect(state === undefined || DEAD_STATES.has(state)).toBe(false);
        });
      }

      for (const row of image.blocked) {
        it(`"${row.control}" waits on an owner decision`, () => {
          expect(row.shipped).not.toBe('');
          expect(row.decision).toMatch(/^pdfluent-internal#\d+$/);
        });
      }
    });
  }

  it('keeps every blocked render out of docs/media/', () => {
    // The rule with teeth. A derivative in docs/media/ is a README hero and a
    // site hero: publishing one from an image that promises a control the app
    // does not have is the failure this whole file exists to stop, one step
    // further along than a store upload.
    const media = existsSync(resolve(root, 'docs/media')) ? readdirSync(resolve(root, 'docs/media')) : [];
    const published = new Set(
      media.map((name) => /^(store-[1-6])-/.exec(name)?.[1]).filter((id): id is string => Boolean(id)),
    );
    const wrong = manifest.images
      .filter((image) => image.blocked.length > 0 && published.has(image.id))
      .map((image) => image.id);
    expect(wrong).toEqual([]);
  });
});
