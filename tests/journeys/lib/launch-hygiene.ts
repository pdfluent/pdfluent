// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.


// Leaving nothing behind between two launches.
//
// The suite starts and ends dozens of app instances on one Windows desktop. An
// instance that is still closing, a web view process that outlives its app, or
// a driver port that is still bound can swallow the next launch: the new app
// attaches to the old web view, or the driver dials a port nobody serves, and
// the window stays blank. `kill` alone says nothing about whether it worked.
// `killAndVerify` kills, looks again, and returns what is STILL there so the
// caller can fail the launch with a name instead of starting on top of it.
//
// The probes are injected so the loop is tested without a desktop
// (tests/journey-launch-hygiene.test.ts); `windowsProbes` / `posixProbes` below
// are the real ones.

import { spawnSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';

export interface Leftovers {
  /** App processes of this build still running. */
  app: number[];
  /** Web view processes started by this app (Windows: msedgewebview2.exe with its --webview-exe-name, or our profile). */
  webview: number[];
  /** The driver we started, when it is still running. */
  driver: number[];
  /** Ports we handed to the drivers that something still listens on. */
  ports: number[];
}

export interface Probes {
  app(): number[];
  webview(): number[];
  driver(): number[];
  listening(): Promise<number[]>;
  kill(pid: number): void;
}

export function isEmpty(l: Leftovers): boolean {
  return l.app.length + l.webview.length + l.driver.length + l.ports.length === 0;
}

export function describeLeftovers(l: Leftovers): string {
  const parts: string[] = [];
  if (l.app.length) parts.push(`app process ${l.app.join(', ')}`);
  if (l.webview.length) parts.push(`web view process ${l.webview.join(', ')}`);
  if (l.driver.length) parts.push(`driver process ${l.driver.join(', ')}`);
  if (l.ports.length) parts.push(`port ${l.ports.join(', ')} still listening`);
  return parts.join('; ');
}

export async function look(p: Probes): Promise<Leftovers> {
  return { app: p.app(), webview: p.webview(), driver: p.driver(), ports: await p.listening() };
}

/**
 * Kill what is left, look again, repeat until nothing is left or `ms` has
 * passed. Returns the leftovers of the last look (empty = verified gone). A
 * port that is still listening is only waited for: its owner is one of the
 * processes killed above, and the socket closes with it.
 */
export async function killAndVerify(
  p: Probes,
  ms: number,
  sleep: (ms: number) => Promise<void> = (n) => new Promise((r) => setTimeout(r, n)),
  now: () => number = Date.now,
): Promise<Leftovers> {
  const until = now() + ms;
  let left = await look(p);
  while (!isEmpty(left)) {
    for (const pid of new Set([...left.app, ...left.webview, ...left.driver])) p.kill(pid);
    if (now() >= until) return left;
    await sleep(250);
    left = await look(p);
  }
  return left;
}

// ─── Real probes ────────────────────────────────────────────────────────────

const SYNC_MS = 30_000;

export function killPid(pid: number): void {
  if (process.platform === 'win32') spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { timeout: SYNC_MS });
  else {
    try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
  }
}

function pidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/** Whether something accepts a connection on `port` (127.0.0.1). */
export function portListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1', () => { s.end(); resolve(true); });
    s.on('error', () => resolve(false));
    s.setTimeout(1_000, () => { s.destroy(); resolve(false); });
  });
}

/**
 * Process ids of web view processes that belong to `app`. WebView2 starts its
 * browser, GPU, renderer and crashpad processes with
 * `--webview-exe-name=<the host exe>` on the command line, which is how an
 * orphan of OUR app is told from the Widgets or Teams web views the desktop
 * runs anyway. `profileDir` catches the ones that carry our profile instead.
 */
export function webviewPidsOf(app: string, profileDir?: string): number[] {
  if (process.platform !== 'win32') return [];
  // tasklist answers in milliseconds; PowerShell takes seconds. Ask the second
  // only when a web view process exists at all.
  const quick = spawnSync('tasklist', ['/FI', 'IMAGENAME eq msedgewebview2.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8', timeout: SYNC_MS });
  if (quick.status === 0 && !quick.stdout.toLowerCase().includes('msedgewebview2')) return [];
  const exe = path.win32.basename(app).replace(/'/g, "''");
  const prof = (profileDir ?? '').replace(/'/g, "''");
  const script =
    "Get-CimInstance Win32_Process -Filter \"Name='msedgewebview2.exe'\" | " +
    "Where-Object { $c = [string]$_.CommandLine; $c -like ('*--webview-exe-name=' + '" + exe + "' + '*') " +
    (prof ? `-or $c -like ('*' + '${prof}' + '*') ` : '') +
    '} | ForEach-Object { $_.ProcessId }';
  const ps = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: SYNC_MS });
  return (ps.stdout ?? '').split(/\r?\n/).map((s) => Number(s.trim())).filter((n) => n > 0);
}

export interface RealProbeInput {
  app: string;
  appPids: () => number[];
  profileDir?: string;
  /** The driver processes we started, if any. */
  driverPid?: number;
  ports?: number[];
}

export function realProbes(i: RealProbeInput): Probes {
  return {
    app: i.appPids,
    webview: () => webviewPidsOf(i.app, i.profileDir),
    driver: () => (i.driverPid !== undefined && pidAlive(i.driverPid) ? [i.driverPid] : []),
    listening: async () => {
      const out: number[] = [];
      for (const port of i.ports ?? []) if (await portListening(port)) out.push(port);
      return out;
    },
    kill: killPid,
  };
}
