// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const taskBarSource = readFileSync(
  new URL('../src/viewer/components/BottomTaskBar.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// Collapse when empty
// ---------------------------------------------------------------------------

describe('BottomTaskBar — collapse when empty', () => {
  it('returns null when tasks.length === 0', () => {
    expect(taskBarSource).toContain('if (tasks.length === 0) return null');
  });

  it('the early-return guard comes before the JSX return', () => {
    const guardIdx = taskBarSource.indexOf('if (tasks.length === 0) return null');
    const jsxReturnIdx = taskBarSource.indexOf('return (', guardIdx);
    expect(guardIdx).toBeGreaterThan(-1);
    expect(jsxReturnIdx).toBeGreaterThan(guardIdx);
  });

  it('no longer renders a static empty-state label', () => {
    expect(taskBarSource).not.toContain('Geen actieve taken');
  });
});

// ---------------------------------------------------------------------------
// Still renders when tasks are present
// ---------------------------------------------------------------------------

describe('BottomTaskBar — renders task rows when non-empty', () => {
  it('renders TaskRow components', () => {
    expect(taskBarSource).toContain('TaskRow');
  });

  it('maps over tasks', () => {
    // The v2 refactor switched from `task =>` (no parens) to `(task) =>`
    // (parens around the param). Either is correct — match permissively.
    expect(taskBarSource).toMatch(/tasks\.map\(\(?task\)? =>/);
  });

  it('wires a dismiss handler per task row', () => {
    // v2 uses a `makeDismiss(task.id)` factory for stable callback identity
    // (perf opt: enables TaskRow memo). Either inline arrow or factory
    // satisfies the contract.
    expect(taskBarSource).toMatch(
      /onDismiss=\{(?:\(\) => \{ dismiss\(task\.id\); \}|makeDismiss\(task\.id\))\}/,
    );
  });
});

// ---------------------------------------------------------------------------
// Container styling — token-driven (was: hardcoded Tailwind)
// ---------------------------------------------------------------------------

describe('BottomTaskBar — container uses token-driven .bottom-taskbar class', () => {
  it('uses the .bottom-taskbar wrapper class', () => {
    expect(taskBarSource).toContain('className="bottom-taskbar"');
  });

  it('has role="status" for screen-reader live region', () => {
    expect(taskBarSource).toContain('role="status"');
  });

  it('has aria-live="polite" for non-intrusive announcement', () => {
    expect(taskBarSource).toContain('aria-live="polite"');
  });
});

// ---------------------------------------------------------------------------
// TaskRow contract
// ---------------------------------------------------------------------------

describe('BottomTaskBar — TaskRow renders task data', () => {
  it('renders task label', () => {
    expect(taskBarSource).toContain('task.label');
  });

  it('renders progress bar for running tasks', () => {
    // v2 uses data-status="running" attribute, but the underlying
    // running-state check still lives in code.
    expect(taskBarSource).toMatch(/task\.status === ['"]running['"]/);
  });

  it('has a dismiss button', () => {
    expect(taskBarSource).toContain('onDismiss');
  });

  it('exposes status via data-status attribute for CSS', () => {
    // v2 refactor: instead of branching colour in JS, expose
    // task.status via a data attribute and let CSS pick the colour.
    // This is the canonical way to test status states now.
    expect(taskBarSource).toContain('data-status={task.status}');
  });
});
