// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.


// One scene = one store screenshot: the real app, driven into a fixed state
// with fixed fictitious documents, photographed at a fixed window size.
// Built on the journey suite's driver and steps (tests/journeys/lib), but not
// part of it: a scene proves nothing about the product, it only needs the app
// in a state worth showing. The product claims behind a scene are proven by
// the journey named in its `journey` field, and the scene refuses to run for a
// journey the mapping does not know (docs/JOURNEY_TESTS.json).
//
// Output (PDFLUENT_SHOTS_OUT, default <repo>/screenshots-out):
//   <platform>/<theme>/<scene>.png      raw window shot, exact size
//   <platform>/<theme>/manifest.json    what each file is, for the compositor
//
// Env: PDFLUENT_SHOT_SIZE=WxH (capture.ts), PDFLUENT_SHOT_THEME=light|dark
// (default light), PDFLUENT_SHOTS_REQUIRED=1 (a missing prerequisite fails
// instead of printing SKIPPED (not a pass)).

import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { it } from 'vitest';
import { launch, type Session } from '../../journeys/lib/driver';
import { missingPrerequisite, platform, repoFile } from '../../journeys/lib/env';
import { clickText, sleep, type UiCtx } from '../../journeys/lib/ui';
import { fitWindow, pngSize, shootWindow, windowSize } from './capture';

const REQUIRED = process.env.PDFLUENT_SHOTS_REQUIRED === '1';
const THEME = process.env.PDFLUENT_SHOT_THEME === 'dark' ? 'dark' : 'light';
const OUT = process.env.PDFLUENT_SHOTS_OUT ?? repoFile('screenshots-out');

export interface Scene extends UiCtx {
  readonly id: string;
  readonly work: string;
  /** Copy a repo file into the work folder; returns the copy's path. */
  fixture(rel: string, as?: string): string;
  file(name: string): string;
  /** Launch the app (fresh HOME, English, light), size the window, optionally open a document. */
  start(o?: { open?: string; as?: string; env?: Record<string, string> }): Promise<Session>;
  /** Let the screen settle, then photograph the window as `<scene>.png` (or `<scene>-<name>.png`). */
  shot(name?: string): Promise<string>;
}

interface ManifestEntry {
  scene: string;
  name: string | null;
  file: string;
  width: number;
  height: number;
  platform: string;
  theme: string;
  journey: string;
  /** Gap ids the mapping lists for that journey on this platform: features the shot may show that do not work yet. */
  knownGaps: string[];
  sha: string;
  at: string;
}

function readManifest(file: string): ManifestEntry[] {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as ManifestEntry[]) : [];
}

export interface SceneOptions {
  /** The journey in docs/JOURNEY_TESTS.json that proves what the scene shows. */
  journey: string;
}

export function scene(id: string, opts: SceneOptions, body: (c: Scene) => Promise<void>, timeoutMs = 300_000): void {
  const map = JSON.parse(readFileSync(repoFile('docs/JOURNEY_TESTS.json'), 'utf8')) as {
    journeys: Record<string, { gaps?: Array<{ id: string; platforms?: string[] }> }>;
  };
  const entry = map.journeys[opts.journey];
  if (!entry) throw new Error(`scene ${id}: ${opts.journey} is not in docs/JOURNEY_TESTS.json`);
  // A screenshot must not promise what the app cannot do yet (the "Invite to
  // sign" button was exactly that). The gaps go into the manifest, and the
  // compositor refuses a shot whose journey still has one.
  const knownGaps = (entry.gaps ?? []).filter((g) => !g.platforms || g.platforms.includes(platform())).map((g) => g.id);

  it(`scene ${id}`, async (ctx) => {
    const missing = missingPrerequisite();
    if (missing) {
      if (REQUIRED) throw new Error(`scene ${id}: ${missing} (PDFLUENT_SHOTS_REQUIRED=1)`);
      process.stderr.write(`SKIPPED (not a pass): scene ${id} - ${missing}\n`);
      ctx.skip();
      return;
    }
    const work = mkdtempSync(path.join(process.env.PDFLUENT_JOURNEY_TMP ?? os.tmpdir(), `pdfluent-shot-${id}-`));
    const outDir = path.join(OUT, platform(), THEME);
    mkdirSync(outDir, { recursive: true });
    let session: Session | null = null;

    const c: Scene = {
      id,
      work,
      get s(): Session {
        if (!session) throw new Error(`scene ${id}: call start() first`);
        return session;
      },
      set s(v: Session) { session = v; },
      fixture(rel, as) {
        const dest = path.join(work, as ?? path.basename(rel));
        copyFileSync(repoFile(rel), dest);
        return dest;
      },
      file(name) { return path.join(work, name); },
      async waitFor(selector, o = {}) { await c.s.call('waitFor', selector, o); },
      async invoke<T>(cmd: string, args?: Record<string, unknown>) { return c.s.call<T>('invoke', cmd, args ?? {}); },
      async answerDialog(kind, value) { await c.s.call('queueDialog', kind, value); },
      async answerNativeDialogs(...answers) { await c.invoke('e2e_queue_dialog_answers', { answers }); },
      async start(o = {}) {
        if (session) await session.close();
        const args: string[] = [];
        if (o.open) args.push(o.open.startsWith(work) ? o.open : c.fixture(o.open, o.as));
        const home = path.join(work, 'home');
        mkdirSync(home, { recursive: true });
        const env: Record<string, string> = { PDFLUENT_E2E_LANG: 'en', ...(o.env ?? {}) };
        if (process.platform !== 'win32') env.HOME = home;
        session = await launch({ app: process.env.PDFLUENT_E2E_APP as string, args, env, workDir: work });
        if (o.open) await c.waitFor('[data-has-document="true"]', { state: 'attached', timeout: 60_000 });
        await setTheme(c);
        const pid = await session.pid();
        if (pid) fitWindow(pid, windowSize());
        await sleep(800); // the layout follows the resize
        return session;
      },
      async shot(name) {
        await sleep(700); // animations, caret blink, thumbnails still arriving
        const pid = await c.s.pid();
        if (!pid) throw new Error(`scene ${id}: cannot photograph an app without a process id`);
        const stem = name ? `${id}-${name}` : id;
        const file = path.join(outDir, `${stem}.png`);
        shootWindow(pid, file);
        const got = pngSize(file);
        const want = windowSize();
        if (Math.abs(got.w / got.h - want.w / want.h) > 0.01) {
          throw new Error(`${file} is ${got.w}x${got.h}, not the ${want.w}:${want.h} ratio asked for`);
        }
        const manifest = path.join(outDir, 'manifest.json');
        const rest = readManifest(manifest).filter((e) => e.file !== path.basename(file));
        rest.push({
          scene: id, name: name ?? null, file: path.basename(file), width: got.w, height: got.h,
          platform: platform(), theme: THEME, journey: opts.journey, knownGaps,
          sha: process.env.PDFLUENT_E2E_SHA ?? process.env.GITHUB_SHA ?? 'a local tree',
          at: new Date().toISOString(),
        });
        rest.sort((a, b) => a.file.localeCompare(b.file));
        writeFileSync(manifest, `${JSON.stringify(rest, null, 2)}\n`);
        return file;
      },
    };

    try {
      await body(c);
    } finally {
      if (session) await (session as Session).close().catch(() => undefined);
    }
  }, timeoutMs);
}

/** Light is the store set; dark is optional. The More menu holds the switch. */
async function setTheme(c: Scene): Promise<void> {
  const isDark = await c.s.call<boolean>('exists', '.pfv3.theme-dark');
  if (isDark === (THEME === 'dark')) return;
  await c.s.click('.more-trigger');
  await clickText(c, '.topbar-more-menu .dd-item', 'Dark mode', false);
  await sleep(300);
}
