// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const bottomTaskBarSource = readFileSync(
  new URL('../src/viewer/components/BottomTaskBar.tsx', import.meta.url),
  'utf8'
);

const taskQueueContextSource = readFileSync(
  new URL('../src/viewer/context/TaskQueueContext.tsx', import.meta.url),
  'utf8'
);

const useTaskQueueSource = readFileSync(
  new URL('../src/viewer/hooks/useTaskQueue.ts', import.meta.url),
  'utf8'
);

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

describe('BottomTaskBar — rendering states', () => {
  it('renders nothing (null) when no tasks are queued', () => {
    expect(bottomTaskBarSource).toContain('if (tasks.length === 0) return null');
    expect(bottomTaskBarSource).not.toContain('Geen actieve taken');
  });

  it('reads tasks from TaskQueueContext', () => {
    expect(bottomTaskBarSource).toContain('useTaskQueueContext');
    expect(bottomTaskBarSource).toContain('tasks');
  });

  it('renders a task row per queued task', () => {
    expect(bottomTaskBarSource).toContain('tasks.map');
    expect(bottomTaskBarSource).toContain('task.label');
  });

  it('renders a progress bar for running tasks with numeric progress', () => {
    expect(bottomTaskBarSource).toContain('task.progress');
    expect(bottomTaskBarSource).toContain("status === 'running'");
  });

  it('provides a dismiss button per task', () => {
    expect(bottomTaskBarSource).toContain('dismiss');
    expect(bottomTaskBarSource).toContain('XIcon');
  });

  it('applies distinct colour for error tasks', () => {
    expect(bottomTaskBarSource).toContain("status === 'error'");
    expect(bottomTaskBarSource).toContain('text-destructive');
  });

  it('applies distinct colour for done tasks', () => {
    expect(bottomTaskBarSource).toContain("status === 'done'");
    expect(bottomTaskBarSource).toContain('text-green-500');
  });

  it('no longer contains TODO(pdfluent-viewer) markers', () => {
    expect(bottomTaskBarSource).not.toContain('TODO(pdfluent-viewer)');
  });
});

describe('Task type shape', () => {
  it('defines the four required fields', () => {
    expect(useTaskQueueSource).toContain('id: string');
    expect(useTaskQueueSource).toContain('label: string');
    expect(useTaskQueueSource).toContain('progress: number | null');
    expect(useTaskQueueSource).toContain("status: 'running' | 'done' | 'error'");
  });

  it('exports the Task interface', () => {
    expect(useTaskQueueSource).toContain('export interface Task');
  });

  it('exports the UseTaskQueueResult interface', () => {
    expect(useTaskQueueSource).toContain('export interface UseTaskQueueResult');
  });
});

describe('useTaskQueue hook', () => {
  it('exposes push, update, and dismiss', () => {
    expect(useTaskQueueSource).toContain('push:');
    expect(useTaskQueueSource).toContain('update:');
    expect(useTaskQueueSource).toContain('dismiss:');
  });

  it('schedules auto-dismiss after 3 seconds for done tasks', () => {
    expect(useTaskQueueSource).toContain('AUTO_DISMISS_MS = 3000');
    expect(useTaskQueueSource).toContain("status === 'done'");
    expect(useTaskQueueSource).toContain('scheduleAutoDismiss');
  });

  it('cleans up timers on unmount', () => {
    expect(useTaskQueueSource).toContain('clearTimeout');
  });
});

describe('TaskQueueContext', () => {
  it('exports TaskQueueProvider', () => {
    expect(taskQueueContextSource).toContain('export function TaskQueueProvider');
  });

  it('exports useTaskQueueContext consumer hook', () => {
    expect(taskQueueContextSource).toContain('export function useTaskQueueContext');
  });

  it('throws when used outside provider', () => {
    expect(taskQueueContextSource).toContain('must be used within a TaskQueueProvider');
  });
});

describe('ViewerApp — TaskQueueProvider wiring', () => {
  it('imports TaskQueueProvider', () => {
    expect(viewerAppSource).toContain('TaskQueueProvider');
  });

  it('wraps the viewer tree with TaskQueueProvider', () => {
    expect(viewerAppSource).toContain('<TaskQueueProvider>');
    expect(viewerAppSource).toContain('</TaskQueueProvider>');
  });
});
