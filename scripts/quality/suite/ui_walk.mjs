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
import path from "node:path";
import { KIND_TITLE, REGISTER_PATH } from "../ui-register.mjs";

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
    gap: typeof raw.gap === "string" ? raw.gap : "",
    walked: new Map(list(raw.walked).filter((w) => w && typeof w.id === "string").map((w) => [w.id, w])),
    notProbed: new Map(list(raw.not_probed).filter((w) => w && typeof w.id === "string").map((w) => [w.id, String(w.reason ?? "")])),
  };
}

function judgeTarget(target, walk) {
  const row = (status, reason, numbers = {}) => ({ status, reason, numbers });
  if (walk.error) return row("SKIPPED", walk.error);
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
 * One row per registered control, plus one for the walk's own coverage.
 *
 * The coverage row is not bookkeeping. A walk that reports controls nobody
 * registered has drifted from the register, and every count it prints is then
 * about a different set than the one the report claims to have judged.
 */
export function judgeWalk(targets, walkText, { missingProbe = false, missingReason = "" } = {}) {
  const walk = missingProbe
    ? { gap: missingReason || "the walk did not run on this platform", walked: new Map(), notProbed: new Map(), error: null }
    : readWalk(walkText);
  const known = new Set(targets.map((t) => t.id));
  const out = [];
  for (const t of targets) {
    const v = judgeTarget(t, walk);
    out.push({
      step: "S5", id: `ui:${t.id}`, capability: "ui", status: v.status, ms: 0,
      numbers: v.numbers, reason: v.reason, evidence: v.status === "SKIPPED" ? [] : ["probes/ui_walk.out"],
    });
  }
  const strangers = walk.error ? [] : [...walk.walked.keys()].filter((id) => !known.has(id));
  const covered = out.filter((r) => r.status !== "SKIPPED").length;
  out.push({
    step: "S5", id: "ui:walk-coverage", capability: "ui",
    status: strangers.length ? "FAIL" : covered === targets.length ? "PASS" : "SKIPPED",
    ms: 0,
    numbers: { registered: targets.length, walked: covered },
    reason: strangers.length
      ? `the walk reported ${strangers.length} control(s) the register does not list: ${strangers.slice(0, 5).join(", ")}`
      : covered === targets.length ? ""
      : `${targets.length - covered} of ${targets.length} registered controls were not walked`,
    evidence: [],
  });
  return out;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const root = path.resolve(process.argv[3] ?? path.join(path.dirname(new URL(import.meta.url).pathname), "..", "..", ".."));
  if (process.argv[2] === "--targets") {
    process.stdout.write(JSON.stringify(walkTargets(root), null, 2) + "\n");
  } else {
    process.stderr.write("usage: ui_walk.mjs --targets [repo-root]\n");
    process.exit(2);
  }
}
