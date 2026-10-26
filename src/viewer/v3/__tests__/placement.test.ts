// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-44, J-45, J-53, J-62: a placement armed in the V3 shell becomes a backend
// command with a rect in PDF space, not a React overlay. The command is
// recorded here; src-tauri/tests/annotations_persist.rs proves what the
// command writes into the file.

import { describe, it, expect } from 'vitest';
import {
  clickToPdfPoint,
  commitPlacement,
  localIsoDate,
  SIGNATURE_CAPTION_BAND,
  placementRect,
  strokesToInkPaths,
  type Placement,
} from '../placement';

const PAGE = { width: 612, height: 792 };

function recorder() {
  const calls: Array<{ command: string; args: Record<string, unknown> }> = [];
  const invoke = async (command: string, args: Record<string, unknown>) => { calls.push({ command, args }); };
  return { calls, invoke };
}

describe('clickToPdfPoint', () => {
  it('flips y and removes the zoom', () => {
    expect(clickToPdfPoint(200, 100, 2, PAGE)).toEqual({ x: 100, y: 742 });
  });
});

describe('placementRect', () => {
  it('starts a text box at the click and grows it for wrapped text', () => {
    const short = placementRect({ kind: 'text', text: 'hi' }, { x: 100, y: 700 }, PAGE);
    expect(short[0]).toBe(100);
    expect(short[3]).toBe(700);
    const long = placementRect({ kind: 'text', text: 'word '.repeat(60) }, { x: 100, y: 700 }, PAGE);
    expect(long[3] - long[1]).toBeGreaterThan(short[3] - short[1]);
  });

  it('centres a stamp on the click and keeps it on the page', () => {
    expect(placementRect({ kind: 'stamp', name: 'Draft' }, { x: 300, y: 400 }, PAGE)).toEqual([220, 375, 380, 425]);
    const corner = placementRect({ kind: 'stamp', name: 'Draft' }, { x: 5, y: 790 }, PAGE);
    expect(corner[0]).toBe(0);
    expect(corner[3]).toBe(792);
  });
});

describe('strokesToInkPaths', () => {
  it('maps pad strokes into the rect, upside up, with the aspect kept', () => {
    const paths = strokesToInkPaths([[[0, 0], [100, 50]]], 300, 150, [100, 100, 300, 200]);
    // 100x50 into 200x100: scale 2, fills the box exactly.
    expect(paths).toEqual([[[100, 200], [300, 100]]]);
  });

  it('turns a single tap into a dot rather than dropping it', () => {
    const paths = strokesToInkPaths([[[10, 10]]], 100, 100, [0, 0, 50, 50]);
    expect(paths[0]).toHaveLength(2);
  });
});

describe('commitPlacement', () => {
  it('writes a text box as a FreeText annotation', async () => {
    const { calls, invoke } = recorder();
    await commitPlacement(invoke, { kind: 'text', text: 'Hello' }, 2, { x: 100, y: 700 }, PAGE);
    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe('add_free_text_annotation');
    expect(calls[0].args).toMatchObject({ pageIndex: 2, text: 'Hello', fontSize: 12 });
  });

  it('writes an image, a stamp and a typed signature through their commands', async () => {
    const { calls, invoke } = recorder();
    const placements: Placement[] = [
      { kind: 'image', dataUrl: 'data:image/png;base64,AAAA' },
      { kind: 'stamp', name: 'Approved' },
      { kind: 'signature', role: 'initials', signerName: 'Jane Doe', date: '2026-10-18', text: 'JD' },
    ];
    for (const p of placements) await commitPlacement(invoke, p, 0, { x: 300, y: 400 }, PAGE);
    expect(calls.map(c => c.command)).toEqual(['add_image_annotation', 'add_stamp_annotation', 'add_signature_annotation']);
    expect(calls[0].args).toMatchObject({ imageBase64: 'data:image/png;base64,AAAA' });
    expect(calls[1].args).toMatchObject({ name: 'Approved' });
    expect(calls[2].args).toMatchObject({ text: 'JD', signer: 'Jane Doe', date: '2026-10-18', paths: null });
  });

  it('writes a drawn signature with name and date, the strokes above the caption', async () => {
    const { calls, invoke } = recorder();
    const sig: Placement = {
      kind: 'signature', role: 'signature', signerName: 'Jane Doe', date: '2026-10-18',
      strokes: [[[0, 0], [60, 30], [120, 0]]], padWidth: 400, padHeight: 160,
    };
    await commitPlacement(invoke, sig, 0, { x: 300, y: 400 }, PAGE);
    expect(calls[0].command).toBe('add_signature_annotation');
    expect(calls[0].args).toMatchObject({ signer: 'Jane Doe', date: '2026-10-18', text: null });
    const paths = calls[0].args.paths as Array<Array<[number, number]>>;
    const rect = placementRect(sig, { x: 300, y: 400 }, PAGE);
    for (const [x, y] of paths.flat()) {
      expect(x).toBeGreaterThanOrEqual(rect[0] - 1e-9);
      expect(x).toBeLessThanOrEqual(rect[2] + 1e-9);
      expect(y).toBeGreaterThanOrEqual(rect[1] + SIGNATURE_CAPTION_BAND - 1e-9);
      expect(y).toBeLessThanOrEqual(rect[3] + 1e-9);
    }
  });

  it('dates a signature today, in local time, when no date is given', async () => {
    const { calls, invoke } = recorder();
    await commitPlacement(invoke, { kind: 'signature', role: 'signature', signerName: 'Jane', text: 'Jane' }, 0, { x: 300, y: 400 }, PAGE);
    expect(calls[0].args.date).toBe(localIsoDate(new Date()));
    expect(localIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('refuses a signature without a signer', async () => {
    const { calls, invoke } = recorder();
    await expect(commitPlacement(invoke, { kind: 'signature', role: 'signature', signerName: ' ', text: 'x' }, 0, { x: 1, y: 1 }, PAGE)).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it('refuses an empty signature instead of placing nothing', async () => {
    const { calls, invoke } = recorder();
    await expect(commitPlacement(invoke, { kind: 'signature', role: 'signature', signerName: 'Jane', text: ' ' }, 0, { x: 1, y: 1 }, PAGE)).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});
