// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.


// Kill-and-verify between two launches (tests/journeys/lib/launch-hygiene.ts)
// and the evidence a failed launch writes (launch-diagnostics.ts).

import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { describeLeftovers, isEmpty, killAndVerify, look, type Probes } from './journeys/lib/launch-hygiene';
import { cpuBusyPercent, listTree, tailLines, writeFailureEvidence } from './journeys/lib/launch-diagnostics';

/** A desktop with processes that die when killed (or do not), without a desktop. */
function fakeDesktop(o: { app?: number[]; webview?: number[]; driver?: number[]; ports?: number[]; immortal?: number[] }): Probes & { killed: number[] } {
  const live = { app: [...(o.app ?? [])], webview: [...(o.webview ?? [])], driver: [...(o.driver ?? [])], ports: [...(o.ports ?? [])] };
  const killed: number[] = [];
  return {
    killed,
    app: () => live.app.slice(),
    webview: () => live.webview.slice(),
    driver: () => live.driver.slice(),
    listening: async () => live.ports.slice(),
    kill(pid) {
      killed.push(pid);
      if (o.immortal?.includes(pid)) return;
      for (const k of ['app', 'webview', 'driver'] as const) live[k] = live[k].filter((p) => p !== pid);
      // The sockets close with their owner.
      if (live.app.length + live.webview.length + live.driver.length === 0) live.ports = [];
    },
  };
}

const clock = () => { let t = 0; return { now: () => t, sleep: async (ms: number) => { t += ms; } }; };

describe('killAndVerify', () => {
  it('kills the app, its orphaned web view and the driver, and reports nothing left', async () => {
    const d = fakeDesktop({ app: [10], webview: [11, 12], driver: [13], ports: [5000] });
    const c = clock();
    const left = await killAndVerify(d, 5_000, c.sleep, c.now);
    expect(isEmpty(left)).toBe(true);
    expect(d.killed.sort()).toEqual([10, 11, 12, 13]);
  });

  it('names what could not be killed instead of letting the next launch start on top of it', async () => {
    const d = fakeDesktop({ webview: [21], immortal: [21], ports: [5001] });
    const c = clock();
    const left = await killAndVerify(d, 2_000, c.sleep, c.now);
    expect(left.webview).toEqual([21]);
    expect(left.ports).toEqual([5001]);
    expect(describeLeftovers(left)).toBe('web view process 21; port 5001 still listening');
  });

  it('does nothing when nothing is there', async () => {
    const d = fakeDesktop({});
    expect(isEmpty(await look(d))).toBe(true);
    expect(isEmpty(await killAndVerify(d, 1_000))).toBe(true);
    expect(d.killed).toEqual([]);
  });

  it('is what close() and the pre-launch sweep use, and a close that leaves something fails the journey', () => {
    const driver = readFileSync('tests/journeys/lib/driver.ts', 'utf8');
    expect(driver).toMatch(/const left = await killAndVerify\(this\.probes\(\), 15_000\)/);
    expect(driver).toMatch(/the app could not be shut down cleanly/);
    expect(driver).toMatch(/clearStrayInstances[\s\S]*killAndVerify\([\s\S]*webview: \(\) => webviewPidsOf\(app\)/);
  });
});

describe('failure evidence', () => {
  it('tails a log, lists a folder, and measures CPU busy time', () => {
    expect(tailLines('a\nb\nc\nd', 2)).toBe('c\nd');
    expect(tailLines('a', 5)).toBe('a');
    const dir = mkdtempSync(path.join(os.tmpdir(), 'evidence-tree-'));
    mkdirSync(path.join(dir, 'EBWebView', 'Default'), { recursive: true });
    writeFileSync(path.join(dir, 'EBWebView', 'DevToolsActivePort'), '9222\n');
    expect(listTree(dir, 3)).toEqual(['EBWebView/', '  Default/', '  DevToolsActivePort  5']);
    expect(listTree(path.join(dir, 'nope'))[0]).toMatch(/does not exist/);
    const cpu = (idle: number, user: number): os.CpuInfo => ({ model: 'x', speed: 1, times: { user, nice: 0, sys: 0, idle, irq: 0 } });
    expect(cpuBusyPercent([cpu(0, 0)], [cpu(25, 75)])).toBe(75);
    expect(cpuBusyPercent([cpu(5, 5)], [cpu(5, 5)])).toBe(0);
  });

  it('writes the summary, the driver and app output, the processes and the profile listing, and never throws', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'evidence-'));
    const driverLog = path.join(root, 'tauri-driver.log');
    writeFileSync(driverLog, Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n'));
    mkdirSync(path.join(root, 'webview2', 'EBWebView'), { recursive: true });
    const dir = path.join(root, 'out');
    const where = await writeFailureEvidence({
      dir, label: 'pdfluent-J-21-x', error: 'the app started but its window never showed the editor', stage: 'shell',
      facts: { coldProfile: true, shellBudgetMs: 150_000 },
      pageState: { readyState: 'loading', href: 'about:blank' },
      app: path.join(root, 'pdfluent.exe'), profileDir: path.join(root, 'webview2'), driverLog,
      appLogLines: ['[1.0] PDFluent 1.1.0 starting', '[1.1] perf setup_done +4208ms'],
      pagePng: async () => Buffer.from('png').toString('base64'),
    });
    expect(where).toContain(dir);
    const summary = JSON.parse(readFileSync(path.join(dir, 'summary.json'), 'utf8')) as Record<string, any>;
    expect(summary).toMatchObject({ stage: 'shell', facts: { coldProfile: true }, pageState: { href: 'about:blank' } });
    expect(summary.machine.totalMemMB).toBeGreaterThan(0);
    expect(readFileSync(path.join(dir, 'page.png'), 'utf8')).toBe('png');
    expect(readFileSync(path.join(dir, 'driver.log'), 'utf8').split('\n')).toHaveLength(300);
    expect(readFileSync(path.join(dir, 'app.log'), 'utf8')).toContain('perf setup_done');
    expect(readFileSync(path.join(dir, 'profile.txt'), 'utf8')).toContain('EBWebView/');
    expect(existsSync(path.join(dir, 'processes.json'))).toBe(true);
  }, 30_000);

  it('survives a web view that takes no screenshot', async () => {
    const dir = path.join(mkdtempSync(path.join(os.tmpdir(), 'evidence-')), 'out');
    await writeFailureEvidence({
      dir, label: 'x', error: 'e', stage: 'ping', facts: {}, pageState: null, app: '/x/app',
      pagePng: async () => { throw new Error('target window already closed'); },
    });
    const summary = JSON.parse(readFileSync(path.join(dir, 'summary.json'), 'utf8')) as { notes: Record<string, string> };
    expect(summary.notes.page).toMatch(/target window already closed/);
  }, 30_000);
});
