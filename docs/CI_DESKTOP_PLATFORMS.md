# CI on the shipping platforms (macOS, Windows)

`quality.yml` has one job per shipping platform, `quality:macos` and
`quality:windows`. Each runs on a self-hosted runner on that platform and is a
hard gate: no `continue-on-error`, no `if:` that can turn it off.

## What each job does

1. `npm ci`, `npm run typecheck`, the whole vitest suite (unfiltered).
2. The engine pin through `.github/actions/sdk-pin`, then
   `cargo test -p pdfluent-desktop -p pdfluent-macos-secure` and clippy with
   `-D warnings` on the same two packages. This is the first place the
   `cfg(target_os = "macos")` / `cfg(windows)` code and the bookmark crate
   compile and run in a pipeline.
3. An unsigned CI build of the app: `tauri build --config src-tauri/tauri.ci.conf.json`
   (`.app` packed into a DMG with `hdiutil` on macOS, MSI on Windows).
4. The release suite's S1-S3 drivers against that build:
   `release_suite.sh --mode ci --steps s1,s2,s3`. It launches the real app,
   opens all 17 golden documents, waits for the app's own parse mark, checks it
   is alive with a window, quits it the way a person does, reads the session log
   for a clean quit and samples the app's sockets while it is open.
The report is uploaded as an artifact, also when red.

Not in these jobs: the four axes. `golden_axes` writes no run file on a machine
that has not settled (one-minute load above its bar), and both runners are
shared desktops, so an axes step there would be red whenever someone works on
the machine. The axes stay on `quality:axes` (Linux). Open item: a darwin and
windows axes run in a quiet slot (a scheduled night run on these runners), with
its own job so it can never make the platform gate depend on load.

## Why the CI build is a different app

`tauri.ci.conf.json` gives the CI build the identifier `com.pdfluent.app.ci`, no
signing and no updater artefacts. The runners are desktops on which PDFluent is
installed and may be open, and the shipped identifier would mean the same
sandbox container, the same AppleScript quit target and, on Windows, the same
WebView2 data directory. In `--mode ci` the drivers also find, quit and kill the app only by
the path of the copy under test, and on Windows the MSI is unpacked with an
administrative install (`msiexec /a`) instead of being installed, so a CI run
never upgrades or removes the installed copy.

What a CI run does not judge is a row, not an absence: the signature rows
(codesign, spctl, stapler, Authenticode) are `NOT_APPLICABLE` with the reason,
and S4/S5 get a `scope:` row because they are outside `--steps`. A ci report
carries `mode: ci`, and `require-report.mjs` refuses it at the publish gate.
The signed artefact is still judged by a release run.

## The Windows desktop

WebView2 does not start in session 0. A runner installed as a Windows service,
and every ssh session, is in session 0: the app process starts, never shows its
frontend, the frontend never asks the backend to open the document, and every
open row times out. That is what the 1.0.0 Windows report shows (#427).

- The Windows CI runner therefore runs in the console session of the build
  account (a scheduled task at logon), not as a service. Its job-start hook
  refuses a job if it finds itself in session 0.
- `windows.ps1` (both lanes) now launches, checks and quits the app in that
  user's desktop session: directly when it already runs in one, through a
  one-shot interactive scheduled task when it runs in session 0 (the ssh-driven
  release lane). No desktop session is one `desktop` row that fails with the
  cause, not seventeen timeouts.
- `windows.ps1` also samples the TCP connections of the app and every process it
  started (the WebView2 processes do the frontend's networking) with
  `Get-NetTCPConnection`, in the same format as the macOS `lsof` sampler, and
  holds the first launch open past the startup update check. The
  `offline:observe` row was a permanent gap on Windows before this.

## The macOS runner

The macOS runner is the owner's MacBook. When it is closed, offline or busy the
job waits in the queue ("Waiting for a runner to come online"), visible as a
pending check; GitHub drops a job after 24 hours of waiting, which ends as a
failed check. The app is launched with `open -g`, so the windows open behind
whatever is in front.

## Runners

One runner per machine, registered for this repository only, beside the
engine's runners on the same hardware. Labels:

| job | labels |
|---|---|
| `quality:macos` | `self-hosted, macOS, pdfluent-editor-macos` |
| `quality:windows` | `self-hosted, Windows, pdfluent-editor-windows` |

Both job-start hooks wait (up to 90 minutes) while an engine job runs on the
same machine, so editor CI never takes a machine away from work already on it.
Both route every cache, the work directory, the cargo target directory and
temp onto the machine's build volume and refuse a job when a route is broken
or a volume is below its floor; the macOS hook runs the engine runner's storage
guard with a ledger of its own. The machine-specific runbook (paths, restart,
recovery) lives with each runner, not in this repository.

### The Windows desktop shares 16 GB between Windows and WSL

The Windows desktop runs the Windows editor runner, the engine's runners and
the editor's Linux runners (WSL distro `Ubuntu`) on 16 GB. On 20-10-2026 two
jobs (`journeys:windows`, `quality:windows`) lost their connection to GitHub
("the self-hosted runner lost communication with the server") while the WSL VM
held about 10 GB and Windows had 300 MB free; both coincided with Linux editor
jobs. Two measures, neither of which restarts WSL:

- **One editor Linux runner at a time.** `pdfluent-editor-desktop-wsl-2` is
  stopped (the systemd unit
  `actions.runner.pdfluent-pdfluent-internal.pdfluent-editor-desktop-wsl-2.service`
  inside the distro; not unregistered, not removed). It shows as offline in the
  runner list on purpose. Bring it back with `systemctl start <unit>` inside
  the distro, only when the Windows jobs are not running.
- **The Windows job-start hook yields to jobs in WSL.** While any runner in the WSL distro (the editor's or the engine's) has a job
  running, `hook-started.ps1` waits (up to 180 minutes,
  a log line every five minutes naming why), like it does for the session-0
  engine runners. The tracked copy is `scripts/runner/windows-editor/hook-started.ps1`;
  deploy by copying it to `E:\actions-runner-pdfluent-editor\hook-started.ps1`
  (read at every job start; the previous version is kept next to it as
  `hook-started.ps1.before-wsl-wait-20261020`). If WSL cannot be asked, the hook
  does not wait. A job that runs longer than the cap (the SDK's aarch64 wheel link takes about 2.5 h, under it; anything over
  3 h) does not hold the Windows job back beyond 180 minutes. The wait counts
  against the job's `timeout-minutes`, so those are sized with it.

Proposed, not done: lower `memory=` in `.wslconfig` (12 GB now; most of what
the VM holds is page cache) or set `autoMemoryReclaim=gradual`. It needs a WSL
restart and so belongs to a quiet moment; it is the owner's call.

### Editor runners parked for an SDK release (20-10-2026 night)

The desktop is reserved for the SDK release legs (the engine's Windows
`cargo test` and the aarch64 Linux wheel link, which needs the WSL VM's memory).
On 20-10 an editor Windows job was sent to its worker and the worker did not
answer within the runner's 30 s IPC timeout (the box was saturated); the job
then showed as "lost communication" 10 minutes later. So all editor
runners on this machine are stopped, and nothing is unregistered:

| runner | stop | start |
|---|---|---|
| `windows-editor` | `scripts/runner/windows-editor/runner-ctl.sh stop` from the Mac: refuses while a job runs, then sends Ctrl+C to the listener so it closes its session itself; **never kill the listener** | `scripts/runner/windows-editor/runner-ctl.sh start`: starts the task once and polls GitHub until the runner is `online` (max 5 min); on failure it exits 1 with the tail of the runner's diag log. Wait 2 to 3 minutes after a stop before starting. |
| `pdfluent-editor-desktop-wsl`, `pdfluent-editor-desktop-wsl-2` | `systemctl stop actions.runner.pdfluent-pdfluent-internal.<runner>.service` inside the Ubuntu distro | `systemctl start` the same unit |
| `mac-editor` (the owner's Mac; not a launchd unit, started by `run.sh`) | `scripts/runner/mac-editor/runner-ctl.sh stop`: refuses while a job runs, then SIGTERM to the listener | `scripts/runner/mac-editor/runner-ctl.sh start`: gives the runner the mktemp shim first on `PATH` and `TMPDIR` on the build volume (without them the storage guard refuses every job), then polls GitHub until the runner is `online` (max 5 min), else exit 1 with log tails |

Stop a runner only when no queued job can reach it: cancel (or let finish) the
runs that still have jobs for its labels first, then stop it with no worker
running. An idle gap proves nothing: after a job ends the runner can take 12 s
to 90 s to receive the next one, and a stop in that gap orphans the job. It
happened twice on 20-10-2026 (21:04Z `quality:golden-pdfa`, 21:37Z `playwright`):
the worker kept running without its listener until it was killed by hand, and
GitHub showed the job as lost.
A WSL restart starts every enabled unit again (21-10 04:39 CEST: `wsl-2` came
back by itself and a `cargo-test` job died with the VM). So `wsl-2` is also
`systemctl disable`d; when it is wanted back, `systemctl enable --now` its unit.

**A killed listener blocks the next start.** If the listener is killed instead of stopped, GitHub keeps its session for a while. The next start then logs `POST .../session failed. HTTP Status: Conflict ... A session for this runner already exists` every 30 s, GitHub shows the runner offline although its own log says "Listening", and queued jobs are not handed out (22-10: two Windows jobs waited more than an hour). It clears when the old session expires. Do not loop restarts: every abrupt kill makes a new stale session.

Queued jobs wait until the runners are started again; GitHub drops a job after
24 hours in the queue.

## S5, the UI walk: what it takes per platform

S5 compares `docs/UI_REGISTER.md` (130 walkable controls) against the running
artefact: for each control, was it on screen, did activating it do something,
did it reach the Tauri commands the register names. No driver exists on any
platform yet, so S5 is outside `--steps` in CI and every release report carries
it as SKIPPED.

- **Windows**: reachable with `tauri-driver` + `msedgedriver` (WebDriver over
  WebView2), matching the WebView2 runtime version on the runner. What is
  missing is the walker itself: a selector per register entry, an activation
  per kind (tile, panel, palette command, shortcut), and a way to observe which
  command was reached. The last needs an IPC trace from the app (for example a
  debug-only `invoke` log line), because a WebDriver session sees the DOM, not
  the IPC.
- **Linux**: the same `tauri-driver` route with `WebKitWebDriver`.
- **macOS**: no WebDriver for WKWebView, and the release build ships no
  inspectable web view (the `devtools` feature is off), so there is no way in
  from outside. The proposal: a CI-only debug build (`tauri build --debug
  --config src-tauri/tauri.ci.conf.json`, devtools on, CI identifier) whose web
  view is inspectable, driven over the Web Inspector protocol (or by the same
  walker running inside the page through a CI-only injected script), with the
  IPC trace above. It judges a debug build, not the shipped one, and the report
  must say so in the S5 rows.

Until a walker exists the honest state is the current one: S5 SKIPPED with the
reason in every release report, and outside the CI scope with a row that says
so.
