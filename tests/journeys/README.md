# Journeys on the real app

Each spec here is one user journey from the editor plan's catalogue
(EDITOR-PLAN-2026-Q4 §2), named `J-xx-<what>.e2e.ts`. It drives the built
Tauri app, not Vite with the mock engine, and it is judged on the file the app
writes, read back by `pdfcheck` (`src-tauri/examples/pdfcheck.rs`), not on the
DOM alone.

`docs/JOURNEY_TESTS.json` lists all 97 journeys, which spec proves each one,
on which platforms, and the known gaps with their owners. The feature gate
(`editor-features.json` v2) reads it. `scripts/quality/journey-map.mjs --write`
updates the `spec` fields after you add a spec; `tests/journey-map.test.ts`
fails if the mapping and the specs disagree.

## Running

```sh
npm run build
TAURI_CONFIG="$(cat src-tauri/tauri.e2e.conf.json)" \
  cargo build --release --manifest-path src-tauri/Cargo.toml \
  --features e2e --bin pdfluent-desktop --example pdfcheck
# or: scripts/ci/build-e2e.sh (prints the two paths below)
export PDFLUENT_E2E_APP=<target>/release/pdfluent-desktop
export PDFLUENT_PDFCHECK=<target>/release/examples/pdfcheck
npx vitest run --config vitest.journeys.config.ts [tests/journeys/J-81]
```

On Windows, also run `scripts/ci/journey-tools.sh` first (it installs
tauri-driver and the msedgedriver that matches the machine's WebView2) and set
`PDFLUENT_TAURI_DRIVER` / `PDFLUENT_NATIVE_DRIVER` the way it does. Set
`PDFLUENT_JOURNEY_RESULTS=<dir>` to get one result file per journey, then judge
the run with `node scripts/quality/journey-results.mjs --platform <p>`.

CI runs this in `journeys:macos` and `journeys:windows` (`quality.yml`), with
`PDFLUENT_JOURNEYS_REQUIRED=1`.

## How the app is driven

- **Windows**: WebdriverIO against `tauri-driver` and `msedgedriver`. Clicks and
  keys are real input from the driver.
- **macOS**: WKWebView has no WebDriver. The e2e build (`--features e2e`,
  `src-tauri/src/e2e.rs`) evaluates the scripts the harness drops into
  `$PDFLUENT_E2E_BRIDGE/in/` and the page answers into `out/`. Files, no port.
  Clicks and keys are DOM events dispatched in the page, key by key.
- Both inject `lib/page-agent.js` and use the same steps (`lib/ui.ts`).

The e2e build differs from the shipped one in four seams, all behind the
feature: native dialogs opened from Rust take queued answers
(`e2e_queue_dialog_answers`), the print copy is captured instead of shown
(`PDFLUENT_E2E_PRINT_CAPTURE`), the UI language is seeded
(`PDFLUENT_E2E_LANG=en`), and the macOS bridge. Dialogs opened from JavaScript
are answered by the page agent at the IPC layer. A dialog nobody queued an
answer for is cancelled and fails the journey with its name. The feature never
ships: `tests/e2e-build-is-never-shipped.test.ts`.

Each launch gets a fresh working folder. On macOS that folder is also `HOME`,
so app data, recent files and recovery copies never carry from one journey
into the next. Windows shares the app data folder, and the launch dismisses
what an earlier run left behind.

## The store sandbox

`j.start({ sandbox: true })` (macOS) runs the e2e build inside a bundle signed ad
hoc with the Mac App Store entitlements (`src-tauri/Entitlements.appstore.plist`,
minus the two keys only a provisioning profile can vouch for). The sandbox is the
kernel's. The app can then touch the document it is asked to open, the bridge
folder, and the paths a journey answers a dialog with, and nothing else: before a
panel answer reaches the app the harness issues the grant the panel would have
(`src-tauri/examples/sandbox_grant.rs`), the app takes it (`e2e_sandbox_grant`).
Use `j.allow(path)` for a drop. A path nobody granted is refused as in the store
build. This is how GOV-001 (Save As to a new file, #998) is kept from coming back:
J-A3 saves, saves as and reopens inside it, J-B1 and J-B2 run the folder and
failure cases in it, J-13 drops files into it. `lib/sandbox.ts` has the details and
`tests/journeys-sandbox.test.ts` pins that the entitlements stay the store's.

Windows has no equivalent: the MSI is a plain Win32 install and the Microsoft Store
listing points at the same MSI (`store/packaging-route.md`), so there is no MSIX
virtualisation. J-B1 and J-B2 use the profile's real folders there instead.

`e2e_inject_write_failure(name, count)` makes the next writes of a file called
`name` fail halfway with "No space left on device", through the real save path.

## Errors fail the journey

Every journey is also judged on what the app showed that nobody asked for: an
error toast (`data-testid="app-error-toast"`, `data-severity="error"`, e.g.
"'ocr_component_status' did not complete"), a `console.error`, an uncaught
exception, an unhandled rejection. `tests/lib/fault-watch.js` records them in
the page (it travels with the page agent), `lib/journey.ts` reads them back
before each relaunch and after the body, and the journey fails with the text.
J-A9 is the plain statement of it: start with and without a file, wait five
seconds, expect nothing.

A journey about a failure path lists the failure in `lib/expected-faults.ts`,
with a command or message pattern and a written reason. Nothing else belongs
there: an error toast in a journey about something else is a bug in the app.
An entry nothing matched is said as `STALE-EXPECTATION` (stderr and the result
file). The result file also carries every fault under `faults`.
`tests/fault-guard.test.ts` runs the guard against a fake window and against
broken copies of itself. The Playwright suite uses the same watch through
`tests/e2e/helpers/guarded-test.ts`, and the UI walk reports faults per control
(`ui:walk-faults`).

## Time, retries and shards

- WebDriver calls are never retried (`connectionRetryCount: 0` in `lib/driver.ts`):
  webdriverio retried every error response three times, so a failing wait cost
  four times its length and a click could be delivered twice. The driver's
  script timeout is set per call to outlast the wait it carries, so the page's
  own error (with the visible test ids) arrives instead of "script timeout".
- Every result file has a `launch the app (until ready)` step with the launch
  time; `launchMs` is the driver and app start alone. Read them first when a
  runner is slow.
- `PDFLUENT_JOURNEYS_BAIL=<n>` stops the run after n red journeys. The jobs do
  not set it: vitest counts a failed journey twice, so a bail of 10 ended the
  Windows run at 16 of 63 journeys. What stops a run early is a dead app: after
  four launches in a row that did not start (`lib/launch-breaker.ts`) the rest
  of the suite fails at once with that reason. The judge lists what did not run.
- Windows: each journey gets its own WebView2 profile (`<work>/webview2`),
  kept across the restarts inside the journey. Without it msedgedriver starts
  every session on a throw-away profile and nothing stored in localStorage (the
  theme, J-37) survives a restart. A session is closed by letting the app leave
  (the web view commits localStorage as its window closes), then killed.
- The app's startup watchdog (25 s; it swaps the window when the page has not
  reported in) is set to 150 s under WebDriver (`watchdogEnv` in `lib/env.ts`).
  On a loaded runner a start sometimes takes over 50 s, and at 25 s the app
  replaced the window under the driver: "target window already closed".
- Shards: `npx vitest run --config vitest.journeys.config.ts --shard=<i>/<n>`
  (or `PDFLUENT_JOURNEY_SHARD=<i>/<n>` in the Windows job). Each shard writes
  its own `journey-results`; judge them together with
  `node scripts/quality/journey-results.mjs --platform <p> --results <dir1> --results <dir2> ...`.
  A journey in no shard, a red one, a shard that did not report and a journey
  in two shards all fail the judge (`tests/journey-map.test.ts`). Do not run
  shards at the same time on one Windows desktop: the app data folder is the
  user's profile, and the shards would share recent files, recovery copies and
  settings.

## When the app does not start

A launch is three questions with three budgets (`tests/journeys/lib/launch-readiness.ts`):
the WebDriver session exists, the web view answers a script, and the editor shell is
mounted. Only the third is "ready"; a ping is answered by a blank page too. The document
opening is a fourth, separate wait in the journey. A cold start (a web view profile that
does not exist yet) has a budget derived from the measured p99, a warm one a shorter one.
Each launch's phases are in the result file (`steps[].phases`: `sessionMs`, `pingMs`,
`shellMs`, `coldProfile`).

A launch or document wait that fails writes `launch-failures/<journey>-<stage>-<n>/` next
to the results (screenshot of the web view and of the desktop, tails of the driver and app
output, the processes, the web view profile, machine load). Read `summary.json` first: its
`error` names where start-up stopped. Between launches the suite kills the app, its web
view processes and the driver and checks they are gone and their ports closed
(`lib/launch-hygiene.ts`); a journey that leaves something behind fails by name.

## Rules

- A journey asserts what the user sees **and** what is in the saved file.
- A step the product cannot do yet stays in the spec, wrapped in
  `j.gap('<id>', ...)`, with the same id under that journey's `gaps` in
  `docs/JOURNEY_TESTS.json`, with an owner and a reason. Inside a listed gap
  the step must fail. When it starts passing the test goes red until the entry
  is removed. A gap is printed as `KNOWN-GAP (not a pass)` and is never counted
  as proven.
- Nothing is skipped quietly. A missing build or driver prints
  `SKIPPED (not a pass): <reason>` locally and fails under
  `PDFLUENT_JOURNEYS_REQUIRED=1`. A journey the mapping scopes to another
  platform says so the same way.
- Fixtures are the repository's own files, or files made at test time by
  `pdfcheck make-*` (encrypted, signed, AcroForm, scan). Nothing of unknown
  licence.
