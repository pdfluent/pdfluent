// SPDX-License-Identifier: LicenseRef-PDFluent-Proprietary
// Copyright (c) 2026 Innovation Trigger B.V.
//
// Where the engine pin is written down, and whether those places agree.
//
// The pin lives in more than one file by necessity: cargo reads it from
// src-tauri/Cargo.toml, and CI needs the same value before cargo runs so a
// lagging engine can be reported as such instead of dying somewhere inside a
// cargo fetch. Every workflow with a Rust job therefore declares XFA_SDK_REV
// and hands it to .github/actions/sdk-pin.
//
// Until 2026-09-16 the drift guard compared Cargo.toml with quality.yml and
// nothing else, while release.yml and golden-bless.yml carried the same
// variable. A bump that missed release.yml would have built the release
// against a different engine than everything the pipeline had tested, and
// nothing would have said so.
//
// So this collects the sites rather than naming them: every workflow under
// .github/workflows that declares XFA_SDK_REV, and every engine `rev = "…"`
// in the manifest. A workflow added tomorrow is covered the day it is added.
//
// It also reads where the deploy key that fetches the engine is removed. The
// action writes that key to $ENGINE_SSH_DIR and exports a GIT_SSH_COMMAND that
// points at it; until 2026-09-16 the action deleted the directory again in a
// final `if: always()` step of its own. A composite action has no post step, so
// that step ran when the action ended — before every cargo step in the job. The
// first pin bump after that (51f6f1b03) failed six jobs at once on "Identity
// file … not accessible" followed by a cargo git fetch with no credential left
// to offer; it had passed for months only because the previous pin was already
// in the runner's cargo git cache. The key belongs to the job now: every job
// that uses the action ends with a step that removes it, `if: always()`, and
// the action removes nothing.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The repository every engine crate is fetched from. */
export const ENGINE_GIT_URL = 'https://github.com/pdfluent/engine';

/** Repository-relative, forward-slashed, so messages read the same everywhere. */
export const MANIFEST = 'src-tauri/Cargo.toml';
export const WORKFLOW_DIR = '.github/workflows';
/** The composite action every Rust job resolves the pin through. */
export const SDK_PIN_ACTION = './.github/actions/sdk-pin';
/** That action's own file, repository-relative. */
export const SDK_PIN_ACTION_FILE = '.github/actions/sdk-pin/action.yml';
/** The step every job that uses the action has to end with. */
export const CLEANUP_STEP_NAME = 'Remove the engine deploy key';

/** One place the pinned revision is written down. */
export interface PinSite {
  /** Repository-relative path, forward slashes. */
  file: string;
  /** 1-based, so the message can be pasted into an editor. */
  line: number;
  value: string;
}

/** A job that resolves the engine pin through the composite action. */
export interface PinJob {
  /** Repository-relative path of the workflow, forward slashes. */
  file: string;
  /** The job key, as written under `jobs:`. */
  name: string;
  /** 1-based line of that key. */
  line: number;
  /** How many steps the job has. */
  steps: number;
  /** Where the cleanup step sits among them, 1-based; null when there is none. */
  cleanupAt: number | null;
}

export interface PinScan {
  sites: PinSite[];
  /** Workflows that resolve the pin through the composite action. */
  workflowsUsingAction: string[];
  /** Jobs that do, each with where it removes the deploy key. */
  jobsUsingAction: PinJob[];
  /** One line per disagreement, each naming its file and line. Empty is clean. */
  problems: string[];
}

/** `XFA_SDK_REV: <value>`, quoted or not, comment or not. Not `${{ env.… }}`. */
const DECLARATION = /^\s*XFA_SDK_REV\s*:\s*(?:"([^"]*)"|'([^']*)'|([^\s#]+))\s*(?:#.*)?$/;
const USES_ACTION = /uses\s*:\s*\.\/\.github\/actions\/sdk-pin(?![\w/-])/;
const FULL_SHA = /^[0-9a-f]{40}$/;

/** `- name: Remove the engine deploy key`, quoted or not. */
const CLEANUP_NAME = new RegExp(`^\\s*(?:-\\s+)?name:\\s*["']?${CLEANUP_STEP_NAME}["']?\\s*$`, 'm');
const IF_ALWAYS = /^\s*if:\s*always\(\)\s*$/m;
/** A removal of the key directory by the name the job knows it under. */
const REMOVES_KEY = /\brm\s+-[rRf]+\b[^\n]*ENGINE_SSH_DIR/;

/** One step of a job: the `- ` line that opens it, plus everything under it. */
interface RawStep {
  text: string;
  /** 1-based line of that `- `. */
  line: number;
}

/**
 * The `- ` items under the job's `steps:` key, in order. Indentation-driven
 * rather than a YAML parse, which keeps this file dependency-free: the nested
 * lists inside a step (`runs-on`, `with`, a `run: |` block) sit deeper than the
 * item indent and are folded into the step they belong to.
 */
function stepsOf(lines: string[], from: number, to: number): RawStep[] {
  let at = -1;
  let keyIndent = 0;
  for (let i = from; i < to; i += 1) {
    const key = /^(\s*)steps:\s*$/.exec(lines[i]);
    if (!key) continue;
    at = i + 1;
    keyIndent = key[1].length;
    break;
  }
  if (at < 0) return [];

  const steps: RawStep[] = [];
  let open: RawStep | null = null;
  let itemIndent = -1;
  for (let i = at; i < to; i += 1) {
    const line = lines[i];
    if (line.trim() === '') {
      if (open) open.text += `\n${line}`;
      continue;
    }
    if (line.length - line.trimStart().length <= keyIndent) break;
    const item = /^(\s*)-\s/.exec(line);
    if (item && (itemIndent < 0 || item[1].length === itemIndent)) {
      itemIndent = item[1].length;
      if (open) steps.push(open);
      open = { text: line, line: i + 1 };
      continue;
    }
    // A comment between two steps belongs to the step above it here. That is
    // wrong on paper and harmless in practice: it changes no step's position.
    if (open) open.text += `\n${line}`;
  }
  if (open) steps.push(open);
  return steps;
}

/** Every job in a workflow: a key at indent 2 under `jobs:`, and its steps. */
function jobsOf(lines: string[]): { name: string; line: number; text: string; steps: RawStep[] }[] {
  const jobs: { name: string; line: number; text: string; steps: RawStep[] }[] = [];
  const start = lines.findIndex(l => /^jobs:\s*$/.test(l));
  if (start < 0) return jobs;

  let open: { name: string; line: number; from: number } | null = null;
  const close = (end: number) => {
    if (!open) return;
    jobs.push({
      name: open.name,
      line: open.line,
      text: lines.slice(open.from, end).join('\n'),
      steps: stepsOf(lines, open.from, end),
    });
    open = null;
  };

  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const key = /^ {2}([A-Za-z0-9_.-]+):\s*$/.exec(line);
    if (key) {
      close(i);
      open = { name: key[1], line: i + 1, from: i + 1 };
      continue;
    }
    if (!/^\s/.test(line)) {
      close(i);
      return jobs;
    }
  }
  close(lines.length);
  return jobs;
}

function workflowFiles(root: string): string[] {
  const dir = join(root, WORKFLOW_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(name => /\.ya?ml$/.test(name))
    .sort()
    .map(name => `${WORKFLOW_DIR}/${name}`);
}

/**
 * Every declaration of the engine revision in `root`, and every way they
 * disagree. Pure over the tree it is handed, so the fixtures in
 * tests/sdk-pin-guard.test.ts exercise the same code the repository does.
 */
export function scanSdkPin(root: string): PinScan {
  const sites: PinSite[] = [];
  const workflowsUsingAction: string[] = [];
  const jobsUsingAction: PinJob[] = [];
  const problems: string[] = [];

  // The action hands the key over; it does not take it back. A cleanup step
  // inside a composite action runs when the action ends, and every cargo step
  // in the job comes after that.
  const actionPath = join(root, SDK_PIN_ACTION_FILE);
  if (existsSync(actionPath)) {
    readFileSync(actionPath, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        // The header spells the step out for the reader, so a commented line is
        // documentation and not a deletion — in YAML and inside a `run: |` block
        // alike.
        if (/^\s*#/.test(line) || !REMOVES_KEY.test(line)) return;
        problems.push(
          `${SDK_PIN_ACTION_FILE}:${i + 1} removes ENGINE_SSH_DIR inside the composite action, which ends before the job's cargo steps run`,
        );
      });
  }

  for (const file of workflowFiles(root)) {
    const text = readFileSync(join(root, file), 'utf8');
    const declared: PinSite[] = [];
    text.split('\n').forEach((line, i) => {
      const m = DECLARATION.exec(line);
      if (!m) return;
      declared.push({ file, line: i + 1, value: m[1] ?? m[2] ?? m[3] ?? '' });
    });
    sites.push(...declared);

    if (!USES_ACTION.test(text)) continue;
    workflowsUsingAction.push(file);
    if (declared.length === 0) {
      // The action takes the revision as an input. A workflow that uses it
      // without the variable passes an empty string, and the pin check inside
      // the action then greps Cargo.toml for `rev = ""` — which fails, but on
      // a sentence about the manifest rather than about this workflow.
      problems.push(
        `${file} resolves the engine pin through ${SDK_PIN_ACTION} but declares no XFA_SDK_REV`,
      );
    }

    const jobs = jobsOf(text.split('\n')).filter(job => USES_ACTION.test(job.text));
    if (jobs.length === 0) {
      // The workflow uses the action somewhere this reader could not place. A
      // guard that has gone blind must say so rather than report a clean tree.
      problems.push(
        `${file} uses ${SDK_PIN_ACTION} but no job in it could be read`,
      );
    }
    for (const job of jobs) {
      const at = job.steps.findIndex(step => CLEANUP_NAME.test(step.text));
      jobsUsingAction.push({
        file,
        name: job.name,
        line: job.line,
        steps: job.steps.length,
        cleanupAt: at < 0 ? null : at + 1,
      });
      if (at < 0) {
        problems.push(
          `${file}:${job.line} job ${job.name} uses ${SDK_PIN_ACTION} but never removes the deploy key: it needs a final "${CLEANUP_STEP_NAME}" step`,
        );
        continue;
      }
      const cleanup = job.steps[at];
      if (!IF_ALWAYS.test(cleanup.text)) {
        problems.push(
          `${file}:${cleanup.line} the "${CLEANUP_STEP_NAME}" step in job ${job.name} is not "if: always()", so a failing job leaves the key on the runner`,
        );
      }
      if (!REMOVES_KEY.test(cleanup.text)) {
        problems.push(
          `${file}:${cleanup.line} the "${CLEANUP_STEP_NAME}" step in job ${job.name} does not remove ENGINE_SSH_DIR`,
        );
      }
      if (at !== job.steps.length - 1) {
        problems.push(
          `${file}:${cleanup.line} job ${job.name} removes the deploy key at step ${at + 1} of ${job.steps.length}; every step after it runs with a deleted identity`,
        );
      }
    }
  }

  const manifestPath = join(root, MANIFEST);
  if (existsSync(manifestPath)) {
    readFileSync(manifestPath, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (!line.includes(`git = "${ENGINE_GIT_URL}"`)) return;
        const rev = /\brev\s*=\s*"([^"]*)"/.exec(line);
        if (!rev) {
          problems.push(`${MANIFEST}:${i + 1} depends on the engine without pinning a revision`);
          return;
        }
        sites.push({ file: MANIFEST, line: i + 1, value: rev[1] });
      });
  }

  for (const site of sites) {
    if (!FULL_SHA.test(site.value)) {
      problems.push(
        `${site.file}:${site.line} names ${site.value || '(empty)'}, which is not a full 40-character commit sha`,
      );
    }
  }

  // The manifest is the source of truth — it is what cargo reads — so drift is
  // reported against it and every other site is measured from there.
  const reference = sites.find(s => s.file === MANIFEST) ?? sites[0];
  if (!reference) {
    problems.push(`no engine revision is pinned anywhere: ${MANIFEST} names none and no workflow declares XFA_SDK_REV`);
    return { sites, workflowsUsingAction, jobsUsingAction, problems };
  }
  for (const site of sites) {
    if (site.value === reference.value) continue;
    problems.push(
      `${site.file}:${site.line} pins ${site.value || '(empty)'} but ${reference.file}:${reference.line} pins ${reference.value}`,
    );
  }

  return { sites, workflowsUsingAction, jobsUsingAction, problems };
}
