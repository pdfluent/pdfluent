// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Two ways into the running app behind one interface, so a journey is written
// once and runs on all three platforms (EDITOR-PLAN-2026-Q4 §4.2):
//
// * WebDriverSession — tauri-driver plus the platform's WebDriver
//   (msedgedriver for WebView2 on Windows, WebKitWebDriver on Linux). Clicks
//   and keys are real input events from the driver.
// * BridgeSession — macOS. WKWebView has no WebDriver, so the e2e build of
//   the app (`--features e2e`, src-tauri/src/e2e.rs) evaluates the scripts
//   this side drops into a directory and answers into another. Clicks and keys
//   are DOM events dispatched in the page.
//
// Both inject the same page agent (page-agent.js) and both are judged the same
// way: on the files the app writes, read back by pdfcheck.

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FAULT_WATCH_SOURCE } from '../../lib/fault-watch-source';
import { driverKind, type DriverKind } from './env';
import { describeLeftovers, isEmpty, killAndVerify, realProbes, webviewPidsOf } from './launch-hygiene';
import { writeFailureEvidence } from './launch-diagnostics';
import { PING_BUDGET_MS, shellBudgetMs, waitForShell, type PingState } from './launch-readiness';

/**
 * A synchronous child (tasklist, powershell, taskkill, ps) blocks the event loop,
 * so a vitest timeout cannot fire while one hangs: a journey run once sat for
 * 100 minutes after its first journey. Every one of them gets a deadline.
 */
const SYNC_MS = 30_000;
/** One ping into a freshly started web view. */
const PING_ATTEMPT_MS = 15_000;

// The fault watch goes first: every call carries it, it installs once per page
// load, and what it records (error toasts, console errors) is read back with
// `faults` after the journey (lib/journey.ts).
const AGENT = `${FAULT_WATCH_SOURCE}\n${readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'page-agent.js'), 'utf8')}`;

export type Modifier = 'ctrl' | 'meta' | 'shift' | 'alt';

export interface LaunchOptions {
  app: string;
  args: string[];
  env: Record<string, string>;
  /** Directory for this launch's driver files and logs. */
  workDir: string;
  /**
   * Folder for the web view's profile (WebView2: localStorage, cookies), the
   * same for every launch of one journey and a new one for the next journey.
   * Without it msedgedriver gives each WebDriver session a throw-away profile,
   * so nothing the app keeps there survives a restart (J-37). Windows only.
   */
  profileDir?: string;
  /**
   * Folder a failed launch writes its evidence into (screenshots, driver and
   * app output, processes, web view profile); see lib/launch-diagnostics.ts.
   */
  evidenceDir?: string;
  /** The app's own log lines since the journey began, for the evidence. */
  appLog?: () => string[];
}

/** Where a launch spent its time, written into the journey's result file. */
export interface LaunchTimings {
  /** msedgedriver started the app and returned a session. */
  sessionMs: number;
  /** The web view answered its first script. */
  pingMs: number;
  /** The editor shell was mounted (this is "ready"). */
  shellMs: number;
  /** The web view profile did not exist before this start. */
  coldProfile: boolean;
}

export interface Session {
  /** Timings of this launch; null for a driver that does not measure them. */
  readonly timings: LaunchTimings | null;
  readonly kind: DriverKind;
  /** Call a page-agent function: `window.__pj[name](...args)`. */
  call<T = unknown>(name: string, ...args: unknown[]): Promise<T>;
  click(selector: string): Promise<void>;
  doubleClick(selector: string): Promise<void>;
  /** Type into the focused element, key by key. */
  type(text: string): Promise<void>;
  press(key: string, mods?: Modifier[]): Promise<void>;
  /** The app's process id, when known. */
  pid(): Promise<number | null>;
  /** Whether the app process is still running. */
  alive(): Promise<boolean>;
  /** End the session and make sure the app is gone. */
  close(): Promise<void>;
  /** Kill the app without letting it run its exit path (a crash, a power cut). */
  kill(): Promise<void>;
  /**
   * Write what can be seen of the app right now (screenshots, driver and app
   * output, processes, web view profile) into `dir`, for a failure whose cause
   * is not on screen. Never throws; returns where it wrote.
   */
  evidence(dir: string, stage: 'ping' | 'shell' | 'document', error: string, facts?: Record<string, unknown>): Promise<string>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function agentCall(name: string, args: unknown[]): string {
  return `${AGENT}\n;return window.__pj[${JSON.stringify(name)}](...${JSON.stringify(args)});`;
}

/** Process ids whose executable is `exe`, by path. */
export function pidsOf(exe: string): number[] {
  if (process.platform === 'win32') {
    // Starting PowerShell and querying CIM costs seconds on the runner, and
    // this runs several times per journey. `tasklist` answers in milliseconds
    // when no process of that name exists, which is almost always. The path
    // check stays: an installed PDFluent has the same image name and is not
    // ours to kill.
    const base = path.win32.basename(exe);
    const quick = spawnSync('tasklist', ['/FI', `IMAGENAME eq ${base}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8', timeout: SYNC_MS });
    if (quick.status === 0 && !quick.stdout.toLowerCase().includes(base.slice(0, 25).toLowerCase())) return [];
    const ps = spawnSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq '${exe.replace(/'/g, "''")}' } | ForEach-Object { $_.ProcessId }`,
    ], { encoding: 'utf8', timeout: SYNC_MS });
    return (ps.stdout ?? '').split(/\r?\n/).map((s) => Number(s.trim())).filter((n) => n > 0);
  }
  const ps = spawnSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8', timeout: SYNC_MS });
  return (ps.stdout ?? '')
    .split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(.*)$/))
    .filter((m): m is RegExpMatchArray => !!m && (m[2] === exe || (m[2] ?? '').startsWith(`${exe} `)))
    .map((m) => Number(m[1]));
}

function killPid(pid: number): void {
  if (process.platform === 'win32') spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { timeout: SYNC_MS });
  else {
    try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
  }
}

// ─── Bridge (macOS) ─────────────────────────────────────────────────────────

class BridgeSession implements Session {
  readonly kind = 'bridge' as const;
  readonly timings = null;
  private seq = 0;
  private exited = false;

  private constructor(private readonly child: ChildProcess, private readonly dir: string) {
    child.on('exit', () => { this.exited = true; });
  }

  static async launch(o: LaunchOptions): Promise<BridgeSession> {
    const dir = path.join(o.workDir, 'bridge');
    mkdirSync(path.join(dir, 'in'), { recursive: true });
    mkdirSync(path.join(dir, 'out'), { recursive: true });
    const log = path.join(o.workDir, 'app-stdout.log');
    const out = (await import('node:fs')).openSync(log, 'a');
    const child = spawn(o.app, o.args, {
      env: { ...process.env, ...o.env, PDFLUENT_E2E_BRIDGE: dir },
      stdio: ['ignore', out, out],
      detached: false,
    });
    const session = new BridgeSession(child, dir);
    // The suite's global setup (warmup.ts) has already paid for the first
    // start of a fresh binary; this only waits for an ordinary one.
    const until = Date.now() + 120_000;
    let lastError = '';
    while (Date.now() < until) {
      if (session.exited) throw new Error(`the app exited during start-up; see ${log}`);
      try {
        // A ping into a web view that has not come up can hang for the whole
        // connectionRetryTimeout (120 s), which made the "60 s" budget here
        // longer than a journey's 300 s. Each attempt gets its own deadline.
        await Promise.race([
          session.call('ping'),
          sleep(PING_ATTEMPT_MS).then(() => { throw new Error(`no answer to ping within ${PING_ATTEMPT_MS} ms`); }),
        ]);
        return session;
      } catch (e) {
        lastError = String(e);
        await sleep(250);
      }
    }
    await session.kill();
    throw new Error(`the app never answered the bridge in time (${lastError}); see ${log}`);
  }

  async call<T>(name: string, ...args: unknown[]): Promise<T> {
    if (this.exited) throw new Error('the app is not running');
    this.seq += 1;
    const id = `${Date.now().toString(36)}-${this.seq}`;
    const body = `(function(){${agentCall(name, args)}})()`;
    const script = `(async () => { let r; try { const v = await ${body}; r = { ok: true, value: v === undefined ? null : v }; }
      catch (e) { r = { ok: false, error: String((e && e.message) || e) }; }
      await window.__TAURI_INTERNALS__.invoke('e2e_reply', { id: ${JSON.stringify(id)}, payload: JSON.stringify(r) }); })();`;
    const name0 = `${String(this.seq).padStart(8, '0')}-${id}`;
    const partial = path.join(this.dir, 'in', `${name0}.partial`);
    writeFileSync(partial, script);
    renameSync(partial, path.join(this.dir, 'in', `${name0}.js`));
    const reply = path.join(this.dir, 'out', `${id}.json`);
    // waitFor in the page has its own timeout; this one only catches a page
    // that never answers at all.
    const timeoutMs = name === 'waitFor' ? 120_000 : 30_000;
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      if (existsSync(reply)) {
        const r = JSON.parse(readFileSync(reply, 'utf8')) as { ok: boolean; value?: T; error?: string };
        if (!r.ok) throw new Error(`${name}: ${r.error}`);
        return r.value as T;
      }
      if (this.exited) throw new Error(`${name}: the app exited before answering`);
      await sleep(20);
    }
    const stuck = readdirSync(path.join(this.dir, 'in')).filter((f) => f.endsWith('.js')).length;
    throw new Error(`${name}: no answer from the page within ${timeoutMs} ms (${stuck} scripts not picked up)`);
  }

  async click(selector: string): Promise<void> { await this.call('click', selector); }
  async doubleClick(selector: string): Promise<void> { await this.call('doubleClick', selector); }
  async type(text: string): Promise<void> { await this.call('typeText', text); }
  async press(key: string, mods: Modifier[] = []): Promise<void> { await this.call('press', key, mods); }
  async evidence(dir: string, stage: 'ping' | 'shell' | 'document', error: string, facts: Record<string, unknown> = {}): Promise<string> {
    return writeFailureEvidence({
      dir, label: path.basename(path.dirname(this.dir)), error, stage, facts, pageState: null, app: String(this.child.spawnfile),
      driverLog: path.join(path.dirname(this.dir), 'app-stdout.log'),
    });
  }
  async pid(): Promise<number | null> { return this.child.pid ?? null; }
  async alive(): Promise<boolean> { return !this.exited; }

  async close(): Promise<void> {
    if (this.exited) return;
    this.child.kill('SIGTERM');
    const until = Date.now() + 5_000;
    while (!this.exited && Date.now() < until) await sleep(50);
    if (!this.exited) await this.kill();
  }

  async kill(): Promise<void> {
    if (this.exited || this.child.pid === undefined) return;
    killPid(this.child.pid);
    const until = Date.now() + 5_000;
    while (!this.exited && Date.now() < until) await sleep(50);
  }
}

/** End a driver we started, with the native driver it spawned (tauri-driver does not stop it on Windows). */
function killTree(child: ChildProcess): void {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { timeout: SYNC_MS });
  else child.kill();
}

// ─── WebDriver (Windows, Linux) ─────────────────────────────────────────────

type Browser = Awaited<ReturnType<typeof import('webdriverio').remote>>;

const KEY: Record<string, string> = {
  ctrl: 'Control', meta: 'Meta', shift: 'Shift', alt: 'Alt',
  Enter: 'Enter', Escape: 'Escape', Backspace: 'Backspace', Tab: 'Tab', Delete: 'Delete',
  ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown',
  Home: 'Home', End: 'End',
};

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/** WebDriver's default script timeout; the page agent's own waits stay below the one set per call. */
const SCRIPT_MS = 30_000;
/** A backend command may run up to this long; a journey's own cap (300 s) still ends a hung one. */
const INVOKE_MS = 240_000;
/** How long a closed session gets to end its app before the app is killed. */
const GRACEFUL_EXIT_MS = 5_000;
/** What a script may run past the wait it carries, so the page's own, more informative, timeout error comes first. */
const SCRIPT_MARGIN_MS = 15_000;

/** The WebDriver script timeout a page-agent call needs. */
export function scriptTimeoutFor(name: string, args: unknown[]): number {
  if (name === 'waitFor') return ((args[1] as { timeout?: number } | undefined)?.timeout ?? 15_000) + SCRIPT_MARGIN_MS;
  return name === 'invoke' ? INVOKE_MS : SCRIPT_MS;
}

/**
 * tauri-driver's capability: which binary to start. No arguments here: the
 * WebDriver behind it (msedgedriver) turns every entry of `args` into a switch
 * (`C:\\a.pdf` reaches the app as `--c:\\a.pdf`, lower-cased and cut at a space),
 * so the app never found its file. The launch arguments travel in
 * PDFLUENT_E2E_ARGS instead, which the e2e build appends to its own.
 *
 * The profile is the exception, and it is not an app argument:
 * `webviewOptions.additionalBrowserArguments` reaches the web view itself.
 * msedgedriver starts WebView2 with `--user-data-dir=%TEMP%\scoped_dir<n>` for
 * every session, which is why a setting stored in localStorage was gone after
 * a restart; a later `--user-data-dir` replaces it.
 */
export function webdriverCapabilities(o: Pick<LaunchOptions, 'app' | 'profileDir'>): {
  'tauri:options': { application: string; webviewOptions?: { additionalBrowserArguments: string[] } };
} {
  const options: { application: string; webviewOptions?: { additionalBrowserArguments: string[] } } = { application: o.app };
  if (o.profileDir) options.webviewOptions = { additionalBrowserArguments: [`--user-data-dir=${o.profileDir}`] };
  return { 'tauri:options': options };
}

/**
 * The file msedgedriver reads the web view's debugging port from. A profile
 * that is reused keeps the one an earlier, killed, session wrote, and the next
 * session then dials a port nobody listens on ("chrome not reachable").
 */
export function staleDevToolsPortFile(profileDir: string): string {
  return path.join(profileDir, 'EBWebView', 'DevToolsActivePort');
}

/** Poll `running` until it reports nothing, or `ms` has passed; true when it did. */
export async function waitUntilGone(running: () => number[], ms: number, pollMs = 50): Promise<boolean> {
  const until = Date.now() + ms;
  for (;;) {
    if (running().length === 0) return true;
    if (Date.now() >= until) return false;
    await sleep(pollMs);
  }
}

/** The environment of the driver, and so of the app it starts. */
export function webdriverEnv(o: Pick<LaunchOptions, 'args' | 'env'>): Record<string, string> {
  return o.args.length > 0 ? { ...o.env, PDFLUENT_E2E_ARGS: JSON.stringify(o.args) } : { ...o.env };
}

class WebDriverSession implements Session {
  readonly kind = 'webdriver' as const;
  timings: LaunchTimings | null = null;
  private ended = false;
  private scriptMs = SCRIPT_MS;

  private constructor(
    private readonly browser: Browser,
    private readonly driver: ChildProcess,
    private readonly app: string,
    private readonly ports: number[],
    private readonly o: LaunchOptions,
  ) {}

  private get profileDir(): string | undefined { return this.o.profileDir; }

  async evidence(dir: string, stage: 'ping' | 'shell' | 'document', error: string, facts: Record<string, unknown> = {}): Promise<string> {
    let state: unknown = null;
    try {
      state = await Promise.race([this.call('ping'), sleep(5_000).then(() => 'the page did not answer a ping within 5 s')]);
    } catch (e) { state = `ping failed: ${String(e).slice(0, 300)}`; }
    return writeFailureEvidence({
      dir, label: path.basename(this.o.workDir), error, stage, facts: { ...this.timings, ...facts }, pageState: state,
      app: this.app, profileDir: this.o.profileDir, driverLog: path.join(this.o.workDir, 'tauri-driver.log'),
      appLogLines: this.o.appLog?.(), pagePng: () => this.pageScreenshot(),
    });
  }

  /** The web view as a PNG (base64), for the evidence of a launch that failed. */
  async pageScreenshot(): Promise<string | undefined> {
    return this.browser.takeScreenshot();
  }

  static async launch(o: LaunchOptions): Promise<WebDriverSession> {
    const { remote } = await import('webdriverio');
    const port = await freePort();
    const nativePort = await freePort();
    const tauriDriver = process.env.PDFLUENT_TAURI_DRIVER as string;
    const args = ['--port', String(port), '--native-port', String(nativePort)];
    if (process.env.PDFLUENT_NATIVE_DRIVER) args.push('--native-driver', process.env.PDFLUENT_NATIVE_DRIVER);
    const fs = await import('node:fs');
    const t0 = Date.now();
    // A profile that has no web view data yet is a cold start: WebView2 creates
    // it, and the runner scans what it creates (median 32 s against 3.5 s warm,
    // run 39889390284). It gets its own, measured, budget.
    const coldProfile = !o.profileDir || !existsSync(path.join(o.profileDir, 'EBWebView'));
    if (o.profileDir) {
      mkdirSync(o.profileDir, { recursive: true });
      rmSync(staleDevToolsPortFile(o.profileDir), { force: true });
    }
    const log = fs.openSync(path.join(o.workDir, 'tauri-driver.log'), 'a');
    // The app inherits tauri-driver's environment: that is how a launch gets
    // its PDFLUENT_E2E_* settings.
    const driver = spawn(tauriDriver, args, { env: { ...process.env, ...webdriverEnv(o) }, stdio: ['ignore', log, log] });
    const until = Date.now() + 30_000;
    for (;;) {
      const up = await new Promise<boolean>((resolve) => {
        const s = net.connect(port, '127.0.0.1', () => { s.end(); resolve(true); });
        s.on('error', () => resolve(false));
      });
      if (up) break;
      if (driver.exitCode !== null) throw new Error(`tauri-driver exited with ${driver.exitCode}; see ${o.workDir}/tauri-driver.log`);
      if (Date.now() > until) throw new Error('tauri-driver did not listen within 30 s');
      await sleep(200);
    }
    // connectionRetryCount 0: webdriverio retries every WebDriver error
    // response three times, which ran a failing wait four times over (a
    // 60 s wait became a 128 s "script timeout" with no message) and could
    // repeat a click that had already been delivered. Only the session
    // request, which starts the app, is retried, by hand below.
    let browser: Browser | undefined;
    let startError = '';
    for (let attempt = 1; attempt <= 2 && !browser; attempt += 1) {
      try {
        browser = await remote({
          hostname: '127.0.0.1',
          port,
          logLevel: 'warn',
          outputDir: o.workDir,
          connectionRetryTimeout: 120_000,
          connectionRetryCount: 0,
          capabilities: webdriverCapabilities(o) as unknown as WebdriverIO.Capabilities,
        });
      } catch (e) {
        startError = String(e);
        // A half-started app would take the next attempt over.
        for (const pid of pidsOf(o.app)) killPid(pid);
        if (o.profileDir) rmSync(staleDevToolsPortFile(o.profileDir), { force: true });
        await sleep(500);
      }
    }
    if (!browser) {
      killTree(driver);
      throw new Error(`no WebDriver session: ${startError}`);
    }
    const session = new WebDriverSession(browser, driver, o.app, [port, nativePort], o);
    const sessionMs = Date.now() - t0;
    const failWith = async (stage: 'ping' | 'shell', error: Error, extra: Record<string, unknown>): Promise<never> => {
      // Evidence first, while the app is still there to be looked at; only then is it killed.
      const where = o.evidenceDir
        ? await session.evidence(o.evidenceDir, stage, error.message, { sessionMs, coldProfile, ...extra })
        : '(no evidence folder)';
      await session.kill().catch(() => undefined);
      throw new Error(`${error.message}; evidence: ${where}`);
    };

    // 2. The web view answers a script. Each attempt has its own deadline: a
    // ping into a web view that has not come up can hang for the whole
    // connectionRetryTimeout (120 s).
    const pingUntil = Date.now() + PING_BUDGET_MS;
    let lastError = '';
    let pinged = false;
    while (Date.now() < pingUntil && !pinged) {
      try {
        await Promise.race([
          session.call('ping'),
          sleep(PING_ATTEMPT_MS).then(() => { throw new Error(`no answer to ping within ${PING_ATTEMPT_MS} ms`); }),
        ]);
        pinged = true;
      } catch (e) {
        lastError = String(e);
        await sleep(250);
      }
    }
    if (!pinged) {
      return failWith('ping', new Error(`the page never answered within ${Math.round(PING_BUDGET_MS / 1000)} s: ${lastError}`), {});
    }
    const pingMs = Date.now() - t0 - sessionMs;

    // 3. The editor shell is mounted. A ping is answered by any page, so on its
    // own it said "ready" for a window that was still blank.
    const budget = shellBudgetMs(coldProfile);
    try {
      const shell = await waitForShell(
        () => Promise.race([
          session.call<PingState>('ping'),
          sleep(PING_ATTEMPT_MS).then(() => { throw new Error(`no answer to ping within ${PING_ATTEMPT_MS} ms`); }),
        ]),
        budget,
      );
      session.timings = { sessionMs, pingMs, shellMs: shell.ms, coldProfile };
      return session;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      return failWith('shell', err, { pingMs, shellBudgetMs: budget });
    }
  }

  async call<T>(name: string, ...args: unknown[]): Promise<T> {
    // A waitFor carries its own timeout; the driver's script timeout must
    // outlast it, or the wait ends as an opaque "script timeout".
    // A backend command (export, OCR, compress) answers when it is done.
    const want = scriptTimeoutFor(name, args);
    if (want !== this.scriptMs) {
      await this.browser.setTimeout({ script: want });
      this.scriptMs = want;
    }
    return (await this.browser.execute(agentCall(name, args))) as T;
  }

  async click(selector: string): Promise<void> {
    await this.call('scrollIntoView', selector);
    await (await this.browser.$(selector)).click();
  }

  async doubleClick(selector: string): Promise<void> {
    await this.call('scrollIntoView', selector);
    await (await this.browser.$(selector)).doubleClick();
  }

  async type(text: string): Promise<void> {
    await this.browser.keys(Array.from(text));
  }

  async press(key: string, mods: Modifier[] = []): Promise<void> {
    await this.browser.keys([...mods.map((m) => KEY[m] as string), KEY[key] ?? key]);
  }

  async pid(): Promise<number | null> {
    return pidsOf(this.app)[0] ?? null;
  }

  async alive(): Promise<boolean> {
    return pidsOf(this.app).length > 0;
  }

  async close(): Promise<void> {
    if (!this.ended) {
      this.ended = true;
      try { await this.browser.deleteSession(); } catch { /* the app may already be gone */ }
      // deleteSession asks the app to close its window and answers at once;
      // the app is still writing its state (the web view's localStorage is
      // committed to disk as the window closes). Killing it here lost the
      // theme a journey had just set (J-37). Give it time to leave by itself;
      // a hung app is killed below.
      await waitUntilGone(() => pidsOf(this.app), GRACEFUL_EXIT_MS);
    }
    // Kill, then look: a web view or a driver that outlives its journey is what
    // the next launch would attach to or collide with. What cannot be killed
    // fails the journey that left it, by name, instead of the one after it.
    killTree(this.driver);
    const left = await killAndVerify(this.probes(), 15_000);
    if (!isEmpty(left)) throw new Error(`the app could not be shut down cleanly: ${describeLeftovers(left)}`);
  }

  private probes(): ReturnType<typeof realProbes> {
    return realProbes({
      app: this.app, appPids: () => pidsOf(this.app), profileDir: this.profileDir,
      driverPid: this.driver.pid, ports: this.ports,
    });
  }

  async kill(): Promise<void> {
    for (const pid of pidsOf(this.app)) killPid(pid);
    await this.close();
  }
}

/**
 * No PDFluent process of this build may be running when a session starts: a
 * stray instance (the warm-up, a journey that crashed) would take the launch
 * over through single-instance and the driver would lose its window.
 */
export async function clearStrayInstances(app: string): Promise<void> {
  // The app, and any web view process that still carries its name: an orphan
  // would be picked up by the new instance and keep its window blank.
  const left = await killAndVerify(
    { app: () => pidsOf(app), webview: () => webviewPidsOf(app), driver: () => [], listening: async () => [], kill: killPid },
    15_000,
  );
  if (!isEmpty(left)) throw new Error(`PDFluent processes are still running before the launch: ${describeLeftovers(left)}`);
}

export async function launch(o: LaunchOptions): Promise<Session> {
  await clearStrayInstances(o.app);
  if (driverKind() === 'bridge') return BridgeSession.launch(o);
  try {
    return await WebDriverSession.launch(o);
  } catch (e) {
    // A web view that starts but never answers (seen on the Windows runner on
    // a restart inside a journey: J-99, J-72) is a launch failure, not a
    // verdict on the journey. One fresh start; a second failure is reported.
    if (!String(e).includes('the page never answered')) throw e;
    console.error(`journeys: the page never answered, starting the app once more (${String(e).slice(0, 200)})`);
    await clearStrayInstances(o.app);
    return WebDriverSession.launch({ ...o, evidenceDir: o.evidenceDir ? `${o.evidenceDir}-retry` : undefined });
  }
}
