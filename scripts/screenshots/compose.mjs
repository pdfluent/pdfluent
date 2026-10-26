// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Place the raw window shots of the screenshot suite into the store frames.
//
//   node scripts/screenshots/compose.mjs [--store mac-app-store|microsoft-store|all]
//        [--variant plain|marketing] [--theme light|dark]
//        [--raw screenshots-out] [--out store/screenshots/1.1.0/out]
//        [--allow-draft] [--allow-gaps]
//
// Refuses, with the reason, instead of writing a doubtful image:
//  - a raw shot is missing, or its manifest says it came from another theme;
//  - the shot's journey still has a known gap (the screenshot would show
//    something the app cannot do yet: the "Invite to sign" lesson). A frame in
//    layout.json may list `acceptedGaps` only with {id, by, on, why};
//  - the marketing variant is asked for with copy that is still a draft;
//  - the finished image is not exactly the store's size, or has an alpha channel.
//
// "plain" has no headline: the window on a neutral background. Microsoft's own
// guidance says not to add marketing messages to screenshots, so plain is the
// variant that follows it to the letter; marketing matches the 2026-08 set.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = path.join(ROOT, 'store/screenshots/1.1.0');

function args() {
  const a = { store: 'all', variant: 'plain', theme: 'light', raw: 'screenshots-out', out: path.join(DIR, 'out'), allowDraft: false, allowGaps: false };
  const v = process.argv.slice(2);
  for (let i = 0; i < v.length; i += 1) {
    const k = v[i];
    if (k === '--allow-draft') a.allowDraft = true;
    else if (k === '--allow-gaps') a.allowGaps = true;
    else if (['--store', '--variant', '--theme', '--raw', '--out'].includes(k)) a[k.slice(2)] = v[++i];
    else throw new Error(`unknown argument ${k}`);
  }
  if (!['plain', 'marketing'].includes(a.variant)) throw new Error(`--variant ${a.variant}`);
  a.raw = path.resolve(ROOT, a.raw);
  a.out = path.resolve(ROOT, a.out);
  return a;
}

const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));

export function plan(layout, a, copy) {
  const problems = [];
  const jobs = [];
  const stores = a.store === 'all' ? Object.keys(layout.outputs) : [a.store];
  for (const store of stores) {
    const o = layout.outputs[store];
    if (!o) { problems.push(`unknown store ${store}`); continue; }
    const frames = layout.frames.filter((f) => !f.stores || f.stores.includes(store));
    if (frames.length > o.max) problems.push(`${store}: ${frames.length} frames, the store takes ${o.max}`);
    const rawDir = path.join(a.raw, o.platform, a.theme);
    const manifestFile = path.join(rawDir, 'manifest.json');
    if (!existsSync(manifestFile)) { problems.push(`${store}: no ${manifestFile}; run the screenshot suite on ${o.platform} first`); continue; }
    const manifest = readJson(manifestFile);
    for (const f of frames) {
      const stem = f.shot ? `${f.scene}-${f.shot}` : f.scene;
      const m = manifest.find((e) => e.file === `${stem}.png`);
      if (!m) { problems.push(`${store} frame ${f.id}: no raw shot ${stem}.png`); continue; }
      if (m.theme !== a.theme) problems.push(`${store} frame ${f.id}: ${stem}.png was taken in ${m.theme}`);
      const accepted = new Set((f.acceptedGaps ?? []).filter((g) => g.id && g.by && g.on && g.why).map((g) => g.id));
      const open = (m.knownGaps ?? []).filter((g) => !accepted.has(g));
      if (open.length > 0 && !a.allowGaps) {
        problems.push(`${store} frame ${f.id} (${stem}): journey ${m.journey} still has known gap(s) ${open.join(', ')}; the shot may show what the app cannot do`);
      }
      const c = copy?.frames?.[f.id] ?? {};
      if (a.variant === 'marketing' && !c.headline) problems.push(`${store} frame ${f.id}: no headline in copy.json`);
      if (a.variant === 'marketing' && o.captionMax && c.caption && c.caption.length > o.captionMax) {
        problems.push(`${store} frame ${f.id}: caption is ${c.caption.length} characters, the limit is ${o.captionMax}`);
      }
      jobs.push({ store, o, frame: f, stem, raw: path.join(rawDir, `${stem}.png`), shotW: m.width, shotH: m.height, copy: c });
    }
  }
  if (a.variant === 'marketing' && copy?.draft && !a.allowDraft) problems.push('copy.json is still a draft (draft: true); approve it or pass --allow-draft for a proof');
  return { jobs, problems };
}

async function main() {
  const a = args();
  const layout = readJson(path.join(DIR, 'layout.json'));
  const copyFile = path.join(DIR, 'copy.json');
  const copy = existsSync(copyFile) ? readJson(copyFile) : null;
  const { jobs, problems } = plan(layout, a, copy);
  if (problems.length > 0) {
    process.stderr.write(`compose: refused\n${problems.map((p) => `  - ${p}`).join('\n')}\n`);
    process.exit(1);
  }
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  const html = readFileSync(path.join(DIR, 'template.html'), 'utf8');
  const index = {};
  try {
    for (const j of jobs) {
      const { width: W, height: H } = j.o;
      const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
      await page.setContent(html);
      const marketing = a.variant === 'marketing';
      await page.evaluate((p) => window.render(p), {
        src: `data:image/png;base64,${readFileSync(j.raw).toString('base64')}`,
        w: W, h: H, shotW: j.shotW, shotH: j.shotH,
        headline: marketing ? j.copy.headline : '', sub: marketing ? j.copy.sub : '',
      });
      const dir = path.join(a.out, j.store, a.variant);
      mkdirSync(dir, { recursive: true });
      const tmp = path.join(dir, `.${j.frame.id}.rgba.png`);
      const dst = path.join(dir, `${j.frame.id}_${j.stem}.png`);
      await page.screenshot({ path: tmp });
      await page.close();
      const r = spawnSync('python3', [path.join(ROOT, 'scripts/screenshots/flatten.py'), tmp, dst, String(W), String(H), '0'], { encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`flatten: ${r.stderr || r.stdout}`);
      spawnSync('python3', ['-c', `import os;os.remove(${JSON.stringify(tmp)})`]);
      (index[j.store] ??= []).push({ id: j.frame.id, file: path.basename(dst), caption: marketing ? (j.copy.caption ?? null) : null });
      process.stdout.write(`${r.stdout}`);
    }
  } finally {
    await browser.close();
  }
  for (const [store, frames] of Object.entries(index)) {
    writeFileSync(path.join(a.out, store, a.variant, 'index.json'), `${JSON.stringify(frames, null, 2)}\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { process.stderr.write(`compose: ${e.message}\n`); process.exit(1); });
}
