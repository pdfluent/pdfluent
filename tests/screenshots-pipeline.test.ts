// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.


// The store-screenshot pipeline (tests/screenshots/README.md) cannot run in CI:
// it needs a desktop, a built e2e app and, on Windows, a real display. What can
// run is everything that decides whether its output may be trusted: the layout
// points at scenes that exist, the sizes are ones the stores take, the demo
// text the scenes look for is in the demo document, and the compositor refuses
// a shot that shows a feature with a known gap.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script, no declaration file
import { plan } from '../scripts/screenshots/compose.mjs';
import { DEMO_IMAGE, DEMO_REPORT, FONT_PREFERENCE, LINE_OLD, SIGNER } from './screenshots/lib/demo';

const root = resolve(__dirname, '..');
const read = (rel: string): string => readFileSync(resolve(root, rel), 'utf8');
const layout = JSON.parse(read('store/screenshots/1.1.0/layout.json')) as {
  outputs: Record<string, { platform: string; width: number; height: number; max: number; captionMax: number | null }>;
  frames: Array<{ id: string; scene: string; shot: string | null; stores?: string[]; acceptedGaps?: unknown[] }>;
};
const sceneFiles = readdirSync(resolve(root, 'tests/screenshots/scenes')).filter((f) => f.endsWith('.shot.ts'));
const sceneSource = new Map(sceneFiles.map((f) => [f.replace('.shot.ts', ''), read(`tests/screenshots/scenes/${f}`)]));
const journeys = (JSON.parse(read('docs/JOURNEY_TESTS.json')) as { journeys: Record<string, unknown> }).journeys;

// Apple: 1280x800, 1440x900, 2560x1600, 2880x1800 (16:10).
// https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/
const APPLE_MAC = ['1280x800', '1440x900', '2560x1600', '2880x1800'];

const framesFor = (store: string) => layout.frames.filter((f) => !f.stores || f.stores.includes(store));

describe('store screenshot layout', () => {
  it('uses only sizes the stores take, and no more frames than they allow', () => {
    const mac = layout.outputs['mac-app-store'];
    expect(APPLE_MAC).toContain(`${mac.width}x${mac.height}`);
    expect(mac.max).toBe(10);
    // Microsoft: desktop 1366x768 or larger, up to 4K (3840x2160), up to 10.
    // https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/screenshots-and-images
    const ms = layout.outputs['microsoft-store'];
    expect(ms.width).toBeGreaterThanOrEqual(1366);
    expect(ms.height).toBeGreaterThanOrEqual(768);
    expect(ms.width).toBeLessThanOrEqual(3840);
    expect(ms.height).toBeLessThanOrEqual(2160);
    expect(ms.captionMax).toBe(200);
    for (const [store, o] of Object.entries(layout.outputs)) expect(framesFor(store).length).toBeLessThanOrEqual(o.max);
  });

  it('points every frame at a scene that exists and says that shot', () => {
    for (const store of Object.keys(layout.outputs)) {
      const ids = framesFor(store).map((f) => f.id);
      expect(new Set(ids).size, `ids in ${store}`).toBe(ids.length);
    }
    for (const f of layout.frames) {
      const src = sceneSource.get(f.scene);
      expect(src, `scene ${f.scene}`).toBeTruthy();
      if (f.shot) expect(src, `${f.scene} takes shot "${f.shot}"`).toContain(`'${f.shot}'`);
    }
  });

  it('maps every scene to a journey the mapping knows', () => {
    for (const [id, src] of sceneSource) {
      expect(src, id).toContain(`scene('${id}'`);
      const j = src.match(/journey: '(J-[0-9A-Z]+)'/)?.[1];
      expect(j, `${id} names a journey`).toBeTruthy();
      expect(journeys[j as string], `${j} is in docs/JOURNEY_TESTS.json`).toBeTruthy();
    }
  });

  it('keeps copy a draft until a person has approved it', () => {
    const file = 'store/screenshots/1.1.0/copy.json';
    if (!existsSync(resolve(root, file))) return;
    const copy = JSON.parse(read(file)) as { draft?: boolean; approvedBy?: string; approvedOn?: string };
    if (copy.draft === false) {
      expect(copy.approvedBy, 'approved copy names who approved it').toBeTruthy();
      expect(copy.approvedOn, 'and when').toMatch(/^\d{4}-\d{2}-\d{2}$/);
    } else {
      expect(copy.draft).toBe(true);
    }
  });
});

describe('demo content', () => {
  it('is fictitious and in step with what the scenes look for', () => {
    expect(existsSync(resolve(root, DEMO_REPORT))).toBe(true);
    expect(existsSync(resolve(root, DEMO_IMAGE))).toBe(true);
    expect(read('tests/screenshots/fixtures/make-demo-docs.py')).toContain(LINE_OLD);
    expect(SIGNER.length).toBeGreaterThan(3);
    expect(FONT_PREFERENCE.length).toBeGreaterThan(0);
  });
});

describe('compositor refuses what it must', () => {
  const args = { store: 'microsoft-store', variant: 'plain', theme: 'light', raw: resolve(root, 'tests/screenshots/fixtures/none'), allowDraft: false, allowGaps: false };
  it('reports a missing raw set instead of writing something', () => {
    const r = plan(layout, args, null);
    expect(r.jobs).toHaveLength(0);
    expect(r.problems.join(' ')).toContain('run the screenshot suite');
  });

  /** A raw set for one store with every frame present; `gap` is put on frame 05's journey. */
  function rawSet(gap: string[]): string {
    const raw = mkdtempSync(join(tmpdir(), 'shots-'));
    const dir = join(raw, 'windows-x64', 'light');
    mkdirSync(dir, { recursive: true });
    const manifest = layout.frames.map((f) => {
      const stem = f.shot ? `${f.scene}-${f.shot}` : f.scene;
      return { scene: f.scene, name: f.shot, file: `${stem}.png`, width: 3200, height: 1800, platform: 'windows-x64', theme: 'light', journey: 'J-10', knownGaps: f.scene === '08-ocr' ? gap : [] };
    });
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
    return raw;
  }

  it('refuses a shot whose journey has a known gap', () => {
    const r = plan(layout, { ...args, raw: rawSet(['ocr-text-layer']) }, null);
    expect(r.problems.join(' ')).toContain('ocr-text-layer');
  });

  it('lets the gap through only when the owner accepted it with name, day and reason', () => {
    const raw = rawSet(['ocr-text-layer']);
    const ocr = layout.frames.findIndex((f) => f.scene === '08-ocr');
    const bare = structuredClone(layout);
    bare.frames[ocr].acceptedGaps = [{ id: 'ocr-text-layer' }];
    expect(plan(bare, { ...args, raw }, null).problems.join(' ')).toContain('ocr-text-layer');
    const signed = structuredClone(layout);
    signed.frames[ocr].acceptedGaps = [{ id: 'ocr-text-layer', by: 'owner', on: '2026-10-20', why: 'test' }];
    expect(plan(signed, { ...args, raw }, null).problems).toEqual([]);
  });

  it('refuses the marketing variant while the copy is a draft', () => {
    const r = plan(layout, { ...args, variant: 'marketing', raw: rawSet([]) }, { draft: true, frames: {} });
    expect(r.problems.join(' ')).toContain('draft');
  });
});
