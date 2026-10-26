// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.


// What a launch that did not finish leaves in the artifact.
//
// Before this, a journey whose window stayed blank ended with one line,
// "timed out waiting for [data-has-document=true]; visible test ids: ", and the
// job kept no screenshot, no app output and nothing about the web view. Two
// runs of the same three journeys could not be told from a slow runner, which
// is the explanation that was given and could not be checked. Now every launch
// that fails writes a folder next to the results:
//
//   <results>/launch-failures/<journey>-<n>/
//     summary.json        stall classification, timings, ping state, machine load
//     page.png            the web view as WebDriver sees it (when it answers)
//     desktop.png         the whole desktop (a modal, a second window, a blank frame)
//     driver.log          tail of tauri-driver.log: msedgedriver and the app's stderr
//     app.log             tail of the app's own PDFluent.log since this launch
//     processes.json      app, driver and web view processes, Defender, top CPU
//     profile.txt         the web view profile folder and WEBVIEW2_USER_DATA_FOLDER
//
// The judge reads <results>/<platform>/J-xx.json only, so this folder cannot
// change a verdict; it exists to be read.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SYNC_MS = 30_000;

/** The last `n` lines of `text`, so a log of megabytes becomes a page. */
export function tailLines(text: string, n: number): string {
  const lines = text.split(/\r?\n/);
  return lines.slice(Math.max(0, lines.length - n)).join('\n');
}

/** A folder as indented lines `name  size`, `depth` levels down, at most `max` entries. */
export function listTree(dir: string, depth = 2, max = 200): string[] {
  const out: string[] = [];
  const walk = (d: string, level: number, indent: string): void => {
    if (out.length >= max) return;
    let names: string[];
    try { names = readdirSync(d).sort(); } catch (e) { out.push(`${indent}(unreadable: ${e instanceof Error ? e.message : String(e)})`); return; }
    for (const name of names) {
      if (out.length >= max) { out.push(`${indent}... (more)`); return; }
      const p = path.join(d, name);
      let isDir = false;
      let size = 0;
      try { const st = statSync(p); isDir = st.isDirectory(); size = st.size; } catch { /* vanished */ }
      out.push(`${indent}${name}${isDir ? '/' : `  ${size}`}`);
      if (isDir && level < depth) walk(p, level + 1, `${indent}  `);
    }
  };
  if (!existsSync(dir)) return [`${dir} does not exist`];
  walk(dir, 1, '');
  return out;
}

/** Share of CPU time that was not idle between two `os.cpus()` samples, 0..100. */
export function cpuBusyPercent(a: os.CpuInfo[], b: os.CpuInfo[]): number {
  const sum = (c: os.CpuInfo[]): { idle: number; total: number } => c.reduce(
    (acc, x) => ({ idle: acc.idle + x.times.idle, total: acc.total + x.times.user + x.times.nice + x.times.sys + x.times.idle + x.times.irq }),
    { idle: 0, total: 0 },
  );
  const x = sum(a);
  const y = sum(b);
  const total = y.total - x.total;
  return total <= 0 ? 0 : Math.round((1 - (y.idle - x.idle) / total) * 100);
}

export interface MachineLoad {
  freeMemMB: number;
  totalMemMB: number;
  cpuBusyPercent: number;
  uptimeMin: number;
}

export async function machineLoad(): Promise<MachineLoad> {
  const a = os.cpus();
  await new Promise((r) => setTimeout(r, 1_000));
  const b = os.cpus();
  return {
    freeMemMB: Math.round(os.freemem() / 1048576),
    totalMemMB: Math.round(os.totalmem() / 1048576),
    cpuBusyPercent: cpuBusyPercent(a, b),
    uptimeMin: Math.round(os.uptime() / 60),
  };
}

/** The whole desktop to a PNG (Windows). A modal or a second window is visible here and not in the web view. */
export function desktopScreenshot(file: string): string {
  if (process.platform !== 'win32') return 'desktop screenshot: Windows only';
  const script =
    'Add-Type -AssemblyName System.Windows.Forms,System.Drawing; ' +
    '$b = [System.Windows.Forms.SystemInformation]::VirtualScreen; ' +
    '$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height; ' +
    '$g = [System.Drawing.Graphics]::FromImage($bmp); ' +
    '$g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size); ' +
    `$bmp.Save('${file.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png)`;
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: SYNC_MS });
  return r.status === 0 ? 'ok' : `desktop screenshot failed: ${(r.stderr || r.error?.message || `exit ${r.status}`).toString().slice(0, 300)}`;
}

/** Processes of the launch, Defender and the heaviest processes (Windows). */
export function processSnapshot(app: string): unknown {
  if (process.platform !== 'win32') {
    const ps = spawnSync('ps', ['-axo', 'pid=,ppid=,rss=,command='], { encoding: 'utf8', timeout: SYNC_MS });
    return { note: 'ps', lines: (ps.stdout ?? '').split('\n').filter((l) => l.includes(path.basename(app))).slice(0, 40) };
  }
  const base = path.win32.basename(app).replace(/\.exe$/i, '').replace(/'/g, "''");
  const script =
    "$p = Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(msedgedriver|msedgewebview2|tauri-driver)' -or $_.Name -like ('" + base + "*') } | " +
    'Select-Object ProcessId,ParentProcessId,Name,@{n="WorkingSetMB";e={[math]::Round($_.WorkingSetSize/1MB)}},CreationDate,CommandLine; ' +
    "$d = Get-Process MsMpEng -ErrorAction SilentlyContinue | Select-Object Name,CPU,@{n='WorkingSetMB';e={[math]::Round($_.WorkingSet64/1MB)}}; " +
    '$top = Get-Process | Sort-Object CPU -Descending | Select-Object -First 8 Name,CPU,@{n="WorkingSetMB";e={[math]::Round($_.WorkingSet64/1MB)}}; ' +
    '@{ launch = @($p); defender = @($d); topCpu = @($top) } | ConvertTo-Json -Depth 4 -Compress';
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: SYNC_MS });
  try { return JSON.parse(r.stdout); } catch { return { error: (r.stderr || r.stdout || `exit ${r.status}`).toString().slice(0, 500) }; }
}

export interface FailureEvidence {
  /** Folder to write into (created here). */
  dir: string;
  label: string;
  error: string;
  stage: 'session' | 'ping' | 'shell' | 'document';
  /** Free-form facts the caller has: timings, budgets, cold/warm profile. */
  facts: Record<string, unknown>;
  /** The page state the last ping reported, if one ever came back. */
  pageState: unknown;
  app: string;
  profileDir?: string;
  driverLog?: string;
  appLogLines?: string[];
  /** PNG bytes of the web view, when the driver could take one. */
  pagePng?: () => Promise<string | undefined>;
}

/** Write everything above; never throws (evidence gathering must not mask the failure it documents). */
export async function writeFailureEvidence(e: FailureEvidence): Promise<string> {
  const note: Record<string, string> = {};
  try {
    mkdirSync(e.dir, { recursive: true });
    if (e.pagePng) {
      try {
        const b64 = await Promise.race([
          e.pagePng(),
          new Promise<undefined>((r) => setTimeout(() => r(undefined), 10_000)),
        ]);
        if (b64) { writeFileSync(path.join(e.dir, 'page.png'), Buffer.from(b64, 'base64')); note.page = 'ok'; }
        else note.page = 'the web view took no screenshot within 10 s';
      } catch (err) { note.page = `no page screenshot: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300); }
    }
    note.desktop = desktopScreenshot(path.join(e.dir, 'desktop.png'));
    if (e.driverLog && existsSync(e.driverLog)) {
      writeFileSync(path.join(e.dir, 'driver.log'), tailLines(readFileSync(e.driverLog, 'utf8'), 300));
    }
    if (e.appLogLines) writeFileSync(path.join(e.dir, 'app.log'), `${e.appLogLines.join('\n')}\n`);
    writeFileSync(path.join(e.dir, 'processes.json'), `${JSON.stringify(processSnapshot(e.app), null, 2)}\n`);
    const profile = [
      `WEBVIEW2_USER_DATA_FOLDER=${process.env.WEBVIEW2_USER_DATA_FOLDER ?? '(unset)'}`,
      `profileDir=${e.profileDir ?? '(none)'}`,
      ...(e.profileDir ? ['--- profileDir', ...listTree(e.profileDir, 3)] : []),
      ...(process.env.WEBVIEW2_USER_DATA_FOLDER ? ['--- WEBVIEW2_USER_DATA_FOLDER', ...listTree(process.env.WEBVIEW2_USER_DATA_FOLDER, 2, 80)] : []),
    ];
    writeFileSync(path.join(e.dir, 'profile.txt'), `${profile.join('\n')}\n`);
    const load = await machineLoad();
    writeFileSync(path.join(e.dir, 'summary.json'), `${JSON.stringify({
      label: e.label, stage: e.stage, error: e.error, facts: e.facts, pageState: e.pageState, machine: load, notes: note,
    }, null, 2)}\n`);
    return `${e.dir} (machine: ${load.cpuBusyPercent}% CPU, ${load.freeMemMB} of ${load.totalMemMB} MB memory free)`;
  } catch (err) {
    return `${e.dir} (evidence incomplete: ${err instanceof Error ? err.message : String(err)})`;
  }
}
