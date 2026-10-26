#!/usr/bin/env node
// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// S5 — the UI walk: docs/UI_REGISTER.md against the artefact people install.
//
// The register is generated from the source and says, for every tile, panel,
// rail tool, palette command, button and advertised shortcut, that the shell
// offers it and what activating it reaches. Every word of that is a statement
// about a checkout. Nothing was comparing it to the bytes that ship, so a
// control could be registered, proven by a unit test, and absent from the
// installed application — which is the shape of every "the interface promised
// more than the code delivered" failure this register was written after.
//
// This file is the judgement half. A driver walks the artefact and writes what
// it saw as one JSON probe; here that is compared to the register, and the
// comparison is the point:
//
//   walked, activated, reached what the register says   → PASS
//   walked and the control was not on screen            → FAIL
//   walked and it reached none of its registered commands → FAIL
//   registered and the walk produced no result for it    → SKIPPED
//   the walk reported a control the register never listed → FAIL (coverage)
//
// A control the walk did not touch is SKIPPED and never absent. SKIPPED folds
// to INCOMPLETE and INCOMPLETE refuses the publish, so a walk that covers less
// than the register cannot certify a release. That is the whole rule: an absent
// row is indistinguishable from a control that worked.
//
// The targets are read from the committed register rather than rebuilt by the
// walker. Rebuilding takes about five seconds, the suite's own cases drive this
// fifteen times, and the `quality:ui-register` job already fails when the
// committed file has drifted from the source. `ui-walk.test.ts` checks the two
// agree, so the parse cannot quietly read a different list than the walker
// writes.
//
//   node ui_walk.mjs --targets            the list a driver has to cover, as JSON

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { KIND_TITLE, REGISTER_PATH } from "../ui-register.mjs";
import { isMainModule } from "../../lib/main-module.mjs";

/** Section heading → affordance kind, inverted from the renderer's own table. */
const KIND_OF_TITLE = new Map(Object.entries(KIND_TITLE).map(([kind, title]) => [title, kind]));

/** The states in which a control is on screen and does something. */
const WALKABLE = new Set(["wired", "UNTESTED", "NO CI JOB"]);

const unquote = (cell) => cell.trim().replace(/^`|`$/g, "");

/**
 * A `reaches` cell holds either Tauri command names or a description of a UI
 * effect ("onPanelToggle → togglePanel", "panel:edit (UNTESTED)"). Only the
 * commands are checkable from outside the app, so only they are asserted; a
 * control whose effect is internal is judged on having been activated at all.
 */
const isCommand = (s) => /^[a-z][a-z0-9_]*$/.test(s);

/**
 * Every control the walk has to cover, read from the committed register.
 *
 * `NO ACTION` and `UNREACHABLE` are left out on purpose: the first reaches
 * nothing to observe and the second is never rendered, so walking them would
 * measure the walker rather than the product. Both are already gated by
 * `ui-register.mjs --gate`, which fails on one that is not recorded with a
 * reason in docs/ui_register_exceptions.json.
 */
export function walkTargets(root) {
  const text = readFileSync(path.join(root, REGISTER_PATH), "utf8");
  const targets = [];
  let kind = null;
  for (const line of text.split("\n")) {
    const heading = /^##\s+(.*?)\s*$/.exec(line);
    if (heading) {
      kind = KIND_OF_TITLE.get(heading[1]) ?? null;
      continue;
    }
    if (!kind || !line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1);
    if (cells.length < 5) continue;
    const control = unquote(cells[0]);
    const state = unquote(cells[1]);
    if (!WALKABLE.has(state)) continue;
    const commands = [...cells[2].matchAll(/`([^`]+)`/g)].map((m) => m[1]).filter(isCommand);
    targets.push({ id: `${kind}:${control}`, kind, control, state, commands, surface: unquote(cells[3]) });
  }
  return targets;
}

/** Parse what a driver wrote, without trusting its shape. */
export function readWalk(text) {
  let raw;
  try { raw = JSON.parse(text); } catch (e) { return { error: `the walk output is not JSON: ${String(e.message).split("\n")[0]}` }; }
  if (!raw || typeof raw !== "object") return { error: "the walk output is not an object" };
  const list = (v) => (Array.isArray(v) ? v : []);
  return {
    build: typeof raw.build === "string" ? raw.build : "",
    marker: typeof raw.marker === "string" ? raw.marker : "",
    builtFrom: typeof raw.built_from === "string" ? raw.built_from : "",
    gap: typeof raw.gap === "string" ? raw.gap : "",
    // null: the walk build did not watch for faults. That is "not measured", never "none".
    faults: Array.isArray(raw.faults)
      ? raw.faults.filter((f) => f && typeof f.text === "string").map((f) => ({
        control: String(f.control ?? ""), kind: String(f.kind ?? ""), text: f.text, command: typeof f.command === "string" ? f.command : "",
      }))
      : null,
    walked: new Map(list(raw.walked).filter((w) => w && typeof w.id === "string").map((w) => [w.id, w])),
    notProbed: new Map(list(raw.not_probed).filter((w) => w && typeof w.id === "string").map((w) => [w.id, String(w.reason ?? "")])),
  };
}

/**
 * The walk drives a build of the same commit with a walker compiled in (#471),
 * not the shipped bytes, and every row says so. A row that did not would read as
 * a statement about the artefact, which is worse than no row.
 */
export const WALK_BUILD_MARKER = "pdfluent-ui-walk-build";
export const walkLabel = (builtFrom) =>
  `measured on the ui-walk build of ${builtFrom ? builtFrom.slice(0, 12) : "an unrecorded commit"}, not on the shipped bytes`;

/** Why a probe cannot be trusted as a walk of this suite's commit, or "". */
function walkProvenanceProblem(walk, commit) {
  if (walk.error || walk.gap) return "";
  if (walk.build !== "ui-walk" || walk.marker !== WALK_BUILD_MARKER) {
    return "the probe does not say it was measured on the ui-walk build, so it cannot be read as a walk of anything";
  }
  if (commit && walk.builtFrom && !commit.startsWith(walk.builtFrom.slice(0, 7)) && !walk.builtFrom.startsWith(commit.slice(0, 7))) {
    return `the walk build is from ${walk.builtFrom.slice(0, 12)} and the artefact from ${commit.slice(0, 12)}; a walk against another commit proves nothing about this one`;
  }
  if (commit && !walk.builtFrom) return "the probe does not record which commit the walk build came from";
  return "";
}

function judgeTarget(target, walk, problem = "") {
  const row = (status, reason, numbers = {}) => ({ status, reason, numbers });
  if (walk.error) return row("SKIPPED", walk.error);
  if (problem) return row("SKIPPED", problem);
  const stated = walk.notProbed.get(target.id);
  if (stated !== undefined) return row("SKIPPED", stated || "the walk named no reason for leaving this control out");
  const hit = walk.walked.get(target.id);
  if (!hit) {
    return row("SKIPPED", walk.gap || "the register lists this control and the walk produced no result for it");
  }
  if (!hit.found) return row("FAIL", `the register offers this control and it was not found on screen in the artefact`);
  if (!hit.activated) return row("FAIL", "the control is on screen and activating it did nothing the walk could observe");
  const reached = Array.isArray(hit.reached) ? hit.reached : [];
  const missing = target.commands.filter((c) => !reached.includes(c));
  if (target.commands.length && missing.length === target.commands.length) {
    return row("FAIL", `activating it reached none of the commands the register says it reaches: ${target.commands.join(", ")}`);
  }
  return row("PASS", missing.length ? `reached ${reached.join(", ")}; the register also names ${missing.join(", ")}` : "", { reached: reached.length });
}

/**
 * Faults the walk is allowed to see, each with a reason in words. Empty, and it
 * stays empty for anything that is a bug: the walk drives the real controls on a
 * real document, so an error toast ("'<command>' did not complete"), a
 * console.error or an uncaught exception is something a person using the same
 * control would have seen. An entry names the control being walked and/or the
 * command and/or text, and says why that control is SUPPOSED to fail.
 * tests/release-suite/ui-walk.test.ts holds the rules.
 *
 *   { control: "button:x", command: "some_command", match: "text", reason: "..." }
 */
export const EXPECTED_WALK_FAULTS = [];

export const MIN_FAULT_REASON = 20;

/** Problems with the expectations themselves. */
export function checkExpectedFaults(expected) {
  const problems = [];
  expected.forEach((e, i) => {
    const where = `expected walk fault #${i + 1}`;
    if (typeof e.reason !== "string" || e.reason.trim().length < MIN_FAULT_REASON) problems.push(`${where}: needs a written reason`);
    if (!e.control && !e.command && !e.match) problems.push(`${where}: names no control, command or text, so it would allow every fault`);
  });
  return problems;
}

/** Split the walk's faults into the ones nothing expected and the ones something did. */
export function judgeWalkFaults(faults, expected = EXPECTED_WALK_FAULTS) {
  const unexpected = [];
  const allowed = [];
  for (const f of faults) {
    const hit = expected.find((e) => (!e.control || e.control === f.control)
      && (!e.command || e.command === f.command)
      && (!e.match || f.text.includes(e.match)));
    if (hit) allowed.push(f); else unexpected.push(f);
  }
  return { unexpected, allowed };
}

function faultsRow(walk, problem, expected) {
  const row = (status, reason, numbers = {}) => ({ status, reason, numbers });
  if (walk.error) return row("SKIPPED", walk.error);
  if (problem) return row("SKIPPED", problem);
  if (walk.faults === null) {
    return row("SKIPPED", walk.gap || "the walk build did not report the errors it saw (no `faults` in the probe), so a clean walk cannot be told from a blind one");
  }
  const { unexpected, allowed } = judgeWalkFaults(walk.faults, expected);
  if (unexpected.length === 0) return row("PASS", "", { faults: 0, expected: allowed.length });
  const shown = unexpected.slice(0, 5).map((f) => `${f.control}: ${f.kind}${f.command ? ` [${f.command}]` : ""} ${f.text.slice(0, 200)}`);
  return row("FAIL", `the walk saw ${unexpected.length} error(s) a person using the same controls would have seen: ${shown.join(" | ")}${unexpected.length > 5 ? " | ..." : ""}`, { faults: unexpected.length, expected: allowed.length });
}

/**
 * One row per registered control, plus one for the walk's own coverage.
 *
 * The coverage row is not bookkeeping. A walk that reports controls nobody
 * registered has drifted from the register, and every count it prints is then
 * about a different set than the one the report claims to have judged.
 */
export function judgeWalk(targets, walkText, { missingProbe = false, missingReason = "", commit = "", expectedFaults = EXPECTED_WALK_FAULTS } = {}) {
  const walk = missingProbe
    ? { gap: missingReason || "the walk did not run on this platform", walked: new Map(), notProbed: new Map(), faults: null, error: null }
    : readWalk(walkText);
  const known = new Set(targets.map((t) => t.id));
  const problem = walkProvenanceProblem(walk, commit);
  const label = walkLabel(walk.builtFrom);
  const said = (reason) => (reason ? `${label} — ${reason}` : label);
  const out = [];
  for (const t of targets) {
    const v = judgeTarget(t, walk, problem);
    out.push({
      step: "S5", id: `ui:${t.id}`, capability: "ui", status: v.status, ms: 0,
      numbers: v.numbers, reason: said(v.reason), evidence: v.status === "SKIPPED" ? [] : ["probes/ui_walk.out"],
    });
  }
  const strangers = walk.error ? [] : [...walk.walked.keys()].filter((id) => !known.has(id));
  const covered = out.filter((r) => r.status !== "SKIPPED").length;
  out.push({
    step: "S5", id: "ui:walk-coverage", capability: "ui",
    status: strangers.length ? "FAIL" : covered === targets.length ? "PASS" : "SKIPPED",
    ms: 0,
    numbers: { registered: targets.length, walked: covered },
    reason: said(strangers.length
      ? `the walk reported ${strangers.length} control(s) the register does not list: ${strangers.slice(0, 5).join(", ")}`
      : covered === targets.length ? ""
      : `${targets.length - covered} of ${targets.length} registered controls were not walked`),
    evidence: [],
  });
  // The walk presses every control the register lists; whatever the app answered
  // with an error on screen or in the console is a finding, however the control's
  // own row came out.
  const fv = faultsRow(walk, problem, expectedFaults);
  out.push({
    step: "S5", id: "ui:walk-faults", capability: "ui", status: fv.status, ms: 0,
    numbers: fv.numbers, reason: said(fv.reason), evidence: fv.status === "SKIPPED" ? [] : ["probes/ui_walk.out"],
  });
  return out;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
// Run directly, not imported -- compared as paths, both resolved.
//
// Why this is not a comparison of two path strings: scripts/lib/main-module.mjs.
// Three separate spellings of it are wrong here, and every one of them ends in
// a module that loads, runs nothing, prints nothing and exits 0.
if (isMainModule(import.meta.url)) {
  // fileURLToPath, not `.pathname`: a URL percent-encodes a space and a
  // checkout under a path with one would look for a register that is not there.
  const root = path.resolve(process.argv[3] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", ".."));
  if (process.argv[2] === "--targets") {
    process.stdout.write(JSON.stringify(walkTargets(root), null, 2) + "\n");
  } else {
    process.stderr.write("usage: ui_walk.mjs --targets [repo-root]\n");
    // exitCode, not exit(): a write to a pipe is asynchronous, and process.exit()
    // drops whatever libuv has not handed to the kernel yet. See
    // tests/ci/guards-flush-before-exit.test.ts.
    process.exitCode = 2;
  }
}
