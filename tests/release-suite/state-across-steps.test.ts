// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// What a step learns has to reach the next step.
//
// release_suite.sh runs every step in its own subshell, on purpose: a step that
// dies takes its own rows with it instead of the run. The macOS driver found
// the application in S1 and kept the path in a shell variable, and a shell
// variable does not leave the subshell that set it. So S2 saw an empty APP,
// reported "the application was not started", and S3 skipped its offline run
// for the same reason -- on macOS those two steps had never once run, from the
// first release to 1.0.0, and the report said INCOMPLETE without saying why
// (#542, found in the 10-09 rehearsal on #427).
//
// The probes always crossed that boundary because they are files. These cases
// hold the rest of a driver's state to the same rule, by running the real
// macOS functions in the two-subshell shape the suite uses.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const SUITE_DIR = path.join(REPO_ROOT, "scripts", "quality", "suite");

const made: string[] = [];
function work(): string {
  const d = mkdtempSync(path.join(tmpdir(), "pdfluent-suite-state-"));
  made.push(d);
  return d;
}
afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

function sh(script: string): string {
  return execFileSync("bash", ["-c", script], { encoding: "utf8", cwd: REPO_ROOT });
}

/**
 * The macOS driver with everything that touches a disk image or a signature
 * replaced, so S1 can be run for real without an artefact: `_run` writes the
 * probe it was asked for, and the mounted volume is a directory that already
 * holds an application bundle.
 */
function stagedDriver(w: string): string {
  return `
    set -u
    WORK=${JSON.stringify(w)}; REPO_ROOT=${JSON.stringify(REPO_ROOT)}
    SUITE_DIR=${JSON.stringify(SUITE_DIR)}; ARTEFACT="\${WORK}/PDFluent_0.0.0_universal.dmg"
    export WORK REPO_ROOT SUITE_DIR ARTEFACT
    mkdir -p "\${WORK}/probes" "\${WORK}/numbers" "\${WORK}/ms" "\${WORK}/mnt/PDFluent.app/Contents/MacOS"
    : > "\${ARTEFACT}"
    . "\${SUITE_DIR}/state.sh"
    . "\${SUITE_DIR}/drivers/macos.sh"
    # hdiutil never runs: the mount point is already a directory with a bundle
    # in it, which is all driver_s1_probes reads it for.
    _run() { local p="\$1"; shift; case "\$p" in entitlements) printf 'app-sandbox\\n' ;; *) printf 'stub\\n' ;; esac > "\${WORK}/probes/\${p}.out"; echo 0 > "\${WORK}/probes/\${p}.rc"; }
    ditto() { cp -R "\$1" "\$2"; }
    hdiutil() { :; }
  `;
}

describe("suite state crosses the step boundary", () => {
  it("hands a value set in one subshell to another", () => {
    const w = work();
    const out = sh(`
      set -u
      WORK=${JSON.stringify(w)}; export WORK
      . ${JSON.stringify(path.join(SUITE_DIR, "state.sh"))}
      ( suite_state_set app "/Applications/PDFluent.app" )
      ( printf 'got=%s\\n' "$(suite_state_get app)" )
    `);
    expect(out.trim()).toBe("got=/Applications/PDFluent.app");
  });

  it("gives S2 the application S1 found, from a separate subshell", () => {
    // The regression itself: S1 and S2 in the shape release_suite.sh runs them.
    // A driver that keeps the path in a shell variable lists no documents here,
    // and a document list that is empty is the "application was not started"
    // skip that hid this for the whole life of the suite.
    const w = work();
    const out = sh(`
      ${stagedDriver(w)}
      ( driver_s1_probes ) >/dev/null 2>&1
      ( driver_documents )
    `);
    const docs = out.trim().split("\n").filter(Boolean);
    expect(docs.length, "S2 was handed no document to open").toBeGreaterThan(0);
    expect(docs).toContain("fixture-sample-text-3p");
  });

  it("gives S3 the sources and the binary to scan", () => {
    // Same boundary, the other consumer: without the app path S3 wrote no probe
    // at all and the report blamed the platform for having no sandbox.
    //
    // The scan gates what this repository writes and reports the executable
    // without gating it (#543), so both targets have to be on the line.
    const w = work();
    const out = sh(`
      ${stagedDriver(w)}
      ( driver_s1_probes ) >/dev/null 2>&1
      (
        _run() { printf '%s\\n' "\$*" >> "\${WORK}/asked"; echo 0 > "\${WORK}/probes/\$1.rc"; }
        driver_s3_probes
      ) >/dev/null 2>&1
      cat "\${WORK}/asked" 2>/dev/null || true
    `);
    expect(out, "S3 asked for no allow-list scan").toContain("offline_allowlist");
    expect(out, "the Rust sources are the gated half and were not scanned").toContain("--tree src-tauri/src");
    expect(out).toContain("PDFluent.app/Contents/MacOS/pdfluent-desktop");
    expect(out, "the sandbox run is gone; it measured the harness").not.toContain("net_denied_run");
  });

  it("starts and stops the socket sampler around the launch S2 already makes", () => {
    // S3 has no launch of its own on purpose: a second start would watch a
    // different run than the one every other row of the report is about. That
    // makes the sampler a wiring question, and wiring is what #542 was.
    const w = work();
    const out = sh(`
      ${stagedDriver(w)}
      ( driver_s1_probes ) >/dev/null 2>&1
      (
        open() { :; }
        # Gone straight away, so the quit wait does not sit out its 15 s.
        pgrep() { return 1; }
        pkill() { :; }
        osascript() { :; }
        # The parse mark, without an installed application to write one.
        _log_delta() { printf 'document parsed OK\\n'; }
        _app_pid() { echo 4711; }
        _net_observe_start() { printf 'start %s\\n' "\$1" >> "\${WORK}/sampler"; }
        _net_observe_stop() { printf 'stop\\n' >> "\${WORK}/sampler"; }
        driver_open_document fixture-sample-text-3p
      ) >/dev/null 2>&1
      cat "\${WORK}/sampler" 2>/dev/null || true
    `);
    expect(out, "S2 launched the app without starting the sampler").toContain("start 4711");
    expect(out, "the sampler was never stopped, so the probe never closed").toContain("stop");
  });

  it("holds the first document open past the startup update check, and only it", () => {
    // #551. The app's one outbound moment is a timer that fires a fixed delay
    // after the frontend loads, and S2 used to quit about a second after the
    // parse mark — before that timer, on every one of seventeen launches. So the
    // first launch is held; the other sixteen stay as fast as they were, because
    // holding all of them buys the same fact seventeen times and costs two
    // minutes of every release evening.
    //
    // The hold here is 2.5 s rather than the product's, so the case measures
    // the rule and not the constant.
    //
    // Neither half is asserted against a wall-clock ceiling, and both earlier
    // attempts to were red on a loaded gate while the rule they were about
    // still held. Two reasons, and they are properties of the hold rather than
    // of the machine. Timing anything from shell costs interpreter starts that
    // are not a constant when the rest of this suite runs beside it; and the
    // hold's deadline is absolute — `started` plus the hold — so a launch whose
    // own work already outran the deadline correctly sleeps for nothing.
    //
    // So: the hold is checked against its deadline, which only ever moves one
    // way, and "only the first" is checked against the marker the driver writes,
    // which is a fact and not a duration.
    const w = work();
    const out = sh(`
      ${stagedDriver(w)}
      printf '{"startup_check_delay_ms":2000,"s2_hold_ms":2500}' > "\${WORK}/meta.json"
      ( driver_s1_probes ) >/dev/null 2>&1
      (
        open() { :; }
        pgrep() { return 1; }
        pkill() { :; }
        osascript() { :; }
        _log_delta() { printf 'document parsed OK\\n'; }
        _app_pid() { echo 4711; }
        _net_observe_start() { :; }
        _net_observe_stop() { :; }
        now() { python3 -c 'import time;print(time.time())'; }
        driver_open_document first  >/dev/null 2>&1
        driver_open_document second >/dev/null 2>&1
        driver_s2_checks >/dev/null 2>&1
        printf 'held_document=%s\\n' "$(cat "\${WORK}/s2_held" 2>/dev/null)"
        # The hold itself, against the deadline it promises: started + 2.5 s.
        # Overhead can only push the finish later, never earlier, so this holds
        # on any machine.
        rm -f "\${WORK}/s2_held"
        a="\$(now)"; _hold_for_startup_check "\${a}" probe >/dev/null 2>&1; b="\$(now)"
        python3 -c "print('deadline_met=%d' % (1 if \${b} >= \${a} + 2.5 else 0))"
      )
      printf 'alive_numbers=%s\\n' "$(cat "\${WORK}/numbers/alive.json" 2>/dev/null)"
    `);
    expect(out, `the hold did not run to its deadline: ${out}`).toContain("deadline_met=1");
    // Only the first. The second document must not have overwritten the marker,
    // which is what it would do if the hold were taken on every launch.
    expect(out, `the hold was paid again on the second document: ${out}`).toContain("held_document=first");
    // What the step cost, and which launch paid for it, on a row. A hold nobody
    // prints is a cost nobody notices growing into seventeen of them.
    expect(out, "S2 reported no duration at all").toContain("s2_total_ms");
    expect(out).toContain('"hold_ms":2500');
    expect(out).toContain('"held":"first"');
  });

  it("writes the window it watched each document for", () => {
    // The row's per-document numbers come from these lines. Without them the
    // judge sees one cumulative span and cannot tell a launch that outlived the
    // update check from seventeen that did not.
    const w = work();
    const out = sh(`
      ${stagedDriver(w)}
      (
        printf -- '--- sample 1 ---\\n' > "\${WORK}/probes/net_observe.out"
        _NET_T0="$(python3 -c 'import time;print(time.time()-9)')"
        _NET_DOC_T0="$(python3 -c 'import time;print(time.time()-8)')"
        _NET_DOC=fixture-acroform-1p
        _net_observe_stop
      ) >/dev/null 2>&1
      cat "\${WORK}/probes/net_observe.out"
    `);
    expect(out, "no per-document window line was written").toMatch(
      /^--- document fixture-acroform-1p window \d+ ms ---$/m,
    );
    expect(out, "the cumulative span line is gone").toMatch(/^--- window \d+ ms ---$/m);
    const doc = Number.parseInt(/--- document \S+ window (\d+) ms/.exec(out)![1], 10);
    const all = Number.parseInt([...out.matchAll(/^--- window (\d+) ms/gm)].pop()![1], 10);
    expect(doc, "the document window is the launch, not the whole run").toBeLessThan(all);
    expect(doc).toBeGreaterThanOrEqual(7_000);
  });

  it("remembers where the application writes its logs", () => {
    // S2 reads the parse mark and the session pair out of the log directory,
    // and which directory that is depends on a probe S1 took.
    const w = work();
    const out = sh(`
      ${stagedDriver(w)}
      ( driver_s1_probes ) >/dev/null 2>&1
      ( printf '%s\\n' "$(suite_state_get log_dir)" )
    `);
    expect(out.trim()).toMatch(/Containers\/com\.pdfluent\.app\/.*Logs\/com\.pdfluent\.app$/);
  });
});
