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
//
// An owner may decide to ship a render with such a control in it anyway, and
// that is what an `ownerAccepted` row records. The escape hatch is the risk:
// moving a row from `blocked` to `ownerAccepted` is the shortest way to make
// this file stop complaining. So an acceptance has to say who decided, on what
// day and why, and one that does not keeps the render unpublished exactly as a
// `blocked` row does.

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

interface OwnerAcceptedRow {
  control: string;
  shipped: string;
  date: string;
  decidedBy: string;
  reason: string;
}

interface ImageEntry {
  id: string;
  headline: string;
  surface: string;
  shows: ShowsRow[];
  blocked: BlockedRow[];
  ownerAccepted?: OwnerAcceptedRow[];
}

/**
 * The fields an owner acceptance is missing, by name; empty when it is whole.
 *
 * An `ownerAccepted` entry is the one way a control the app does not have may
 * stay in a render that ships: the owner looked at it and decided the image
 * goes out as it stands. That is a legitimate answer, and it is also the
 * obvious way to make this whole file stop complaining -- move a row from
 * `blocked` to `ownerAccepted` and the render is publishable again. So the
 * entry has to carry what makes it auditable: who decided, on what day, and
 * why. An entry short of any of those is not a decision, it is a row that was
 * moved, and it keeps the render out of docs/media/ exactly as `blocked` does.
 */
export function ownerAcceptanceGaps(row: Partial<OwnerAcceptedRow>): string[] {
  const gaps: string[] = [];
  const filled = (value: string | undefined) => (value ?? '').trim() !== '';
  if (!filled(row.control)) gaps.push('control');
  if (!filled(row.shipped)) gaps.push('shipped');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date ?? '')) gaps.push('date');
  if (!filled(row.decidedBy)) gaps.push('decidedBy');
  if (!filled(row.reason)) gaps.push('reason');
  return gaps;
}

/** A render may reach docs/media/ only with nothing open against it. */
export function keepsRenderUnpublished(image: ImageEntry): boolean {
  return (
    image.blocked.length > 0 ||
    (image.ownerAccepted ?? []).some((row) => ownerAcceptanceGaps(row).length > 0)
  );
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

describe('ownerAcceptanceGaps', () => {
  const whole = {
    control: 'The Sign tab drawn active with no Sign panel open',
    shipped: 'a tab carries the active style only while its panel is the open one',
    date: '2026-09-16',
    decidedBy: 'owner',
    reason: 'accepted for the listing; not something to build',
  };

  it('finds nothing missing in a whole decision', () => {
    expect(ownerAcceptanceGaps(whole)).toEqual([]);
  });

  it('names the reason when it is gone', () => {
    expect(ownerAcceptanceGaps({ ...whole, reason: undefined })).toEqual(['reason']);
  });

  it('names the reason when it is only whitespace', () => {
    expect(ownerAcceptanceGaps({ ...whole, reason: '   ' })).toEqual(['reason']);
  });

  it('names the date when it is gone, and when it is not a day', () => {
    expect(ownerAcceptanceGaps({ ...whole, date: undefined })).toEqual(['date']);
    expect(ownerAcceptanceGaps({ ...whole, date: 'September' })).toEqual(['date']);
  });

  it('names who decided when nobody did', () => {
    expect(ownerAcceptanceGaps({ ...whole, decidedBy: '' })).toEqual(['decidedBy']);
  });

  it('keeps a render unpublished when its acceptance is short of a field', () => {
    const image = (accepted: Record<string, unknown>): ImageEntry => ({
      id: 'store-x',
      headline: 'x',
      surface: 'x',
      shows: [],
      blocked: [],
      ownerAccepted: [accepted as OwnerAcceptedRow],
    });
    expect(keepsRenderUnpublished(image(whole))).toBe(false);
    expect(keepsRenderUnpublished(image({ ...whole, reason: undefined }))).toBe(true);
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

      for (const row of image.ownerAccepted ?? []) {
        it(`"${row.control}" carries a traceable owner decision`, () => {
          expect(ownerAcceptanceGaps(row)).toEqual([]);
        });
      }
    });
  }

  it('keeps every unresolved render out of docs/media/', () => {
    // The rule with teeth. A derivative in docs/media/ is a README hero and a
    // site hero: publishing one from an image that promises a control the app
    // does not have is the failure this whole file exists to stop, one step
    // further along than a store upload. An open row bars it, and so does an
    // owner acceptance that cannot be traced back to a decision.
    const media = existsSync(resolve(root, 'docs/media')) ? readdirSync(resolve(root, 'docs/media')) : [];
    const published = new Set(
      media.map((name) => /^(store-[1-6])-/.exec(name)?.[1]).filter((id): id is string => Boolean(id)),
    );
    const wrong = manifest.images
      .filter((image) => keepsRenderUnpublished(image) && published.has(image.id))
      .map((image) => image.id);
    expect(wrong).toEqual([]);
  });
});
