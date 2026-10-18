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
