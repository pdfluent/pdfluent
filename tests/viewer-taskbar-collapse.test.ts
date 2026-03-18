// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
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
    expect(taskBarSource).toContain('tasks.map(task =>');
  });

  it('passes dismiss to each TaskRow', () => {
    expect(taskBarSource).toContain('onDismiss={() => { dismiss(task.id); }}');
  });
});

// ---------------------------------------------------------------------------
// Container styling preserved
// ---------------------------------------------------------------------------

describe('BottomTaskBar — container styling unchanged', () => {
  it('still uses h-6 height', () => {
    expect(taskBarSource).toContain('h-6');
  });

  it('still has border-t', () => {
    expect(taskBarSource).toContain('border-t');
  });

  it('still has bg-muted/20', () => {
    expect(taskBarSource).toContain('bg-muted/20');
  });

  it('still uses shrink-0', () => {
    expect(taskBarSource).toContain('shrink-0');
  });
});

// ---------------------------------------------------------------------------
// TaskRow unchanged
// ---------------------------------------------------------------------------

describe('BottomTaskBar — TaskRow unchanged', () => {
  it('TaskRow still renders task label', () => {
    expect(taskBarSource).toContain('task.label');
  });

  it('TaskRow still shows progress bar for running tasks', () => {
    expect(taskBarSource).toContain("task.status === 'running'");
  });

  it('TaskRow still has dismiss button', () => {
    expect(taskBarSource).toContain('onDismiss');
  });

  it('TaskRow status colours still defined', () => {
    expect(taskBarSource).toContain("task.status === 'error'");
    expect(taskBarSource).toContain("task.status === 'done'");
  });
});
