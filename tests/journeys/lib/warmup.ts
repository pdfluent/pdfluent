// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Vitest global setup for the journey suite: start the freshly built app once
// and wait for its web view to load, then quit it. The first start of a new,
// unsigned binary waits while the OS scans it — on macOS that was 40 s to
// over two minutes in dyld — and that wait belongs to no journey. Said on
// stderr, with how long it took.

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resetLaunchLedger } from './launch-breaker';

export default async function warmup(): Promise<void> {
  resetLaunchLedger(process.env.PDFLUENT_JOURNEY_RESULTS);
  const app = process.env.PDFLUENT_E2E_APP;
  if (!app) return; // each journey reports the missing build itself
  const started = Date.now();
  const home = mkdtempSync(path.join(process.env.PDFLUENT_JOURNEY_TMP ?? os.tmpdir(), 'pdfluent-warmup-'));
  const env: NodeJS.ProcessEnv = { ...process.env, PDFLUENT_E2E_LANG: 'en' };
  if (process.platform !== 'win32') env.HOME = home;
  const child = spawn(app, [], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  const loaded = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), 300_000);
    const watch = (chunk: Buffer): void => {
      if (chunk.toString().includes('page_loaded')) { clearTimeout(timer); resolve(true); }
    };
    child.stdout?.on('data', watch);
    child.stderr?.on('data', watch);
    child.on('exit', () => { clearTimeout(timer); resolve(false); });
  });
  // The whole tree, and wait for it: a warm-up instance left running would
  // take the first journey's launch over (single-instance on Windows).
  if (process.platform === 'win32' && child.pid) spawnSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { timeout: 30_000 });
  else child.kill();
  await new Promise<void>((resolve) => {
    if (child.exitCode !== null) resolve();
    else { child.once('exit', () => resolve()); setTimeout(resolve, 10_000); }
  });
  const s = Math.round((Date.now() - started) / 1000);
  process.stderr.write(loaded
    ? `journeys: warm-up start of the e2e build took ${s} s\n`
    : `journeys: the e2e build did not load its web view within ${s} s; the first journey will say why\n`);
}
