// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// S5 — the UI walk, judged.
//
// docs/UI_REGISTER.md is generated from the source and says what the interface
// offers. Until now nothing compared that list to the thing people install: a
// control could be in the register, be proven by a unit test, and not exist in
// the artefact at all. S5 closes that by walking the built artefact through
// every control the register lists.
//
// The judgement is what these cases cover, through the fake driver, the same
// way the rest of the suite is tested: the walk output is a file, so what it
// MEANS can be decided on any machine, and a wrong reading is caught on a push
// instead of on a release evening.
//
// The rule the cases exist to pin down: a control the walk did not touch is a
// row that says so. Not a pass, and not an absence. An absent row is
// indistinguishable from a control that worked, which is the failure this whole
// suite is arranged against.

import { describe, it, expect } from "vitest";
import { runToFile } from "../ci/run";
import { REPO_ROOT, stageCase, suiteArgs, readReport, rows, type Row } from "./helpers";
import { walkTargets } from "../../scripts/quality/suite/ui_walk.mjs";
import { buildRegister } from "../../scripts/quality/ui-register.mjs";

const run = (args: string[], env: NodeJS.ProcessEnv = {}) =>
  runToFile("bash", args, { cwd: REPO_ROOT, env: { ...process.env, ...env } });

const TARGETS = walkTargets(REPO_ROOT);

/** A walk that reached every control the register lists. */
function fullWalk(edit: (w: WalkFile) => void = () => {}): string {
  const walk: WalkFile = {
    driver: "fake",
    walked: TARGETS.map((t) => ({ id: t.id, found: true, activated: true, reached: [...t.commands] })),
    not_probed: [],
  };
  edit(walk);
  return JSON.stringify(walk, null, 2) + "\n";
}

interface WalkFile {
  driver: string;
  walked: { id: string; found: boolean; activated: boolean; reached: string[] }[];
  not_probed: { id: string; reason: string }[];
}

/** The per-control rows, without the walk's own coverage row. */
const walkRows = (json: Record<string, unknown>): Row[] =>
  rows(json).filter((r) => r.id.startsWith("ui:") && r.id !== "ui:walk-coverage");
const walkRow = (json: Record<string, unknown>, id: string): Row | undefined =>
  rows(json).find((r) => r.id === `ui:${id}`);

const staged = (walk: string) => stageCase("good", { "ui_walk.out": walk, "ui_walk.rc": "0\n" });

describe("the register is the list the walk has to cover", () => {
  it("finds every control the register offers, and no dead one", () => {
    expect(TARGETS.length).toBeGreaterThan(100);
    for (const t of TARGETS) {
      expect(t.id, "a target id is <kind>:<control>").toContain(":");
      expect(t.state, "a control that reaches nothing is not walkable").not.toBe("NO ACTION");
      expect(t.state, "a control the app never renders is not walkable").not.toBe("UNREACHABLE");
    }
    expect(new Set(TARGETS.map((t) => t.id)).size, "duplicate target ids").toBe(TARGETS.length);
  });

  // The walk reads the committed markdown; the walker builds the list from the
  // source. Parsing is five seconds cheaper per suite run and the shapes can
  // drift apart, so the one place they are compared is here. A new section in
  // the register that this parse does not recognise would otherwise drop every
  // control in it, silently, and the coverage row would still say 100 %.
  it("reads the same controls the walker writes", () => {
    const live = buildRegister()
      .affordances.filter((a: { reachable: boolean; hasEffect: boolean }) => a.reachable && a.hasEffect)
      .map((a: { kind: string; id: string }) => `${a.kind}:${a.id}`)
      .sort();
    expect([...TARGETS.map((t) => t.id)].sort()).toEqual(live);
  });
});

describe("release suite — the UI walk", () => {
  it("passes with a row for every registered control", () => {
    const s = staged(fullWalk());
    const r = run(suiteArgs(s));
    expect(r.status, r.err.slice(-3000)).toBe(0);

    const { json, md } = readReport(s);
    expect(json.verdict).toBe("PASS");
    expect(walkRows(json).length, "one row per registered control").toBe(TARGETS.length);
    for (const row of walkRows(json)) expect(row.status).toBe("PASS");
    expect(rows(json).some((x) => x.step === "S5"), "no S5 rows in the report").toBe(true);
    expect(md).toContain("S5");
  });

  // The mutation the whole step exists for: take one control out of what the
  // walk covered. The report has to notice, and a run that measured less than
  // it claims cannot be a pass.
  it("returns INCOMPLETE when a control drops out of the walk", () => {
    const dropped = TARGETS[Math.floor(TARGETS.length / 2)];
    const s = staged(fullWalk((w) => { w.walked = w.walked.filter((x) => x.id !== dropped.id); }));
    const r = run(suiteArgs(s));

    expect(r.status).toBe(3);
    const { json } = readReport(s);
    expect(json.verdict).toBe("INCOMPLETE");
    const missed = walkRow(json, dropped.id);
    expect(missed, "the control vanished from the report instead of being reported").toBeDefined();
    expect(missed!.status).toBe("SKIPPED");
    expect(missed!.reason.length).toBeGreaterThan(10);
    expect(r.err).toContain(`SKIPPED (not a pass): ui:${dropped.id}`);
    // And the rest of the walk still reported.
    expect(walkRows(json).length).toBe(TARGETS.length);
  });

  it("says why a control was left out when the walk names a reason", () => {
    const dropped = TARGETS[0];
    const s = staged(fullWalk((w) => {
      w.walked = w.walked.filter((x) => x.id !== dropped.id);
      w.not_probed = [{ id: dropped.id, reason: "no probe is written for this control yet" }];
    }));
    expect(run(suiteArgs(s)).status).toBe(3);
    const missed = walkRow(readReport(s).json, dropped.id)!;
    expect(missed.status).toBe("SKIPPED");
    expect(missed.reason).toContain("no probe is written for this control yet");
  });

  it("fails a control the register offers and the artefact does not render", () => {
    const gone = TARGETS[1];
    const s = staged(fullWalk((w) => {
      const hit = w.walked.find((x) => x.id === gone.id)!;
      hit.found = false;
      hit.activated = false;
      hit.reached = [];
    }));
    expect(run(suiteArgs(s)).status).toBe(1);
    const bad = walkRow(readReport(s).json, gone.id)!;
    expect(bad.status).toBe("FAIL");
    expect(bad.reason).toMatch(/not on screen|did not render|was not found/i);
  });

  it("fails a control that reached none of the commands the register says it reaches", () => {
    const withCommand = TARGETS.find((t) => t.commands.length > 0)!;
    const s = staged(fullWalk((w) => {
      w.walked.find((x) => x.id === withCommand.id)!.reached = [];
    }));
    expect(run(suiteArgs(s)).status).toBe(1);
    const bad = walkRow(readReport(s).json, withCommand.id)!;
    expect(bad.status).toBe("FAIL");
    expect(bad.reason).toContain(withCommand.commands[0]);
  });

  // A walk is only worth its coverage claim. One that reports controls nobody
  // registered has drifted from the register, and the count it advertises is
  // then about something else.
  it("fails a walk that reports a control the register does not list", () => {
    const s = staged(fullWalk((w) => {
      w.walked.push({ id: "button:a-control-no-register-lists", found: true, activated: true, reached: [] });
    }));
    expect(run(suiteArgs(s)).status).toBe(1);
    const stranger = rows(readReport(s).json).find((x) => x.id === "ui:walk-coverage")!;
    expect(stranger, "nothing said the walk drifted from the register").toBeDefined();
    expect(stranger.status).toBe("FAIL");
    expect(stranger.reason).toContain("a-control-no-register-lists");
  });

  // What every macOS report says today: the walk has no way in. Every control
  // still gets a row, so the report cannot read as if the UI was judged.
  it("leaves a row per control when the walk did not run at all", () => {
    const s = stageCase("good");
    const r = run(suiteArgs(s), { FAKE_MISSING_PROBE: "ui_walk" });
    expect(r.status).toBe(3);
    const { json } = readReport(s);
    expect(json.verdict).toBe("INCOMPLETE");
    expect(walkRows(json).length).toBe(TARGETS.length);
    for (const row of walkRows(json)) expect(row.status).toBe("SKIPPED");
  });
});
