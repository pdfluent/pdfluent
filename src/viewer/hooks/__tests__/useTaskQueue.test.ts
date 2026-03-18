// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Task } from '../useTaskQueue';

// ── Pure queue logic extracted for isolated testing ──────────────────────────
// Mirrors the reducer logic from useTaskQueue without React state.

function makeQueue(initial: Task[] = []) {
  let tasks = [...initial];
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const AUTO_DISMISS_MS = 3000;

  function dismiss(id: string) {
    tasks = tasks.filter(t => t.id !== id);
    const t = timers.get(id);
    if (t !== undefined) { clearTimeout(t); timers.delete(id); }
  }

  function scheduleAutoDismiss(id: string) {
    const existing = timers.get(id);
    if (existing !== undefined) clearTimeout(existing);
    const timer = setTimeout(() => { timers.delete(id); tasks = tasks.filter(t => t.id !== id); }, AUTO_DISMISS_MS);
    timers.set(id, timer);
  }

  function push(task: Task) {
    const exists = tasks.some(t => t.id === task.id);
    if (!exists) tasks = [...tasks, task];
    if (task.status === 'done') scheduleAutoDismiss(task.id);
  }

  function update(id: string, partial: Partial<Omit<Task, 'id'>>) {
    tasks = tasks.map(t => t.id === id ? { ...t, ...partial } : t);
    if (partial.status === 'done') scheduleAutoDismiss(id);
  }

  function getTimerCount() { return timers.size; }
  function getTasks() { return [...tasks]; }

  return { push, update, dismiss, getTasks, getTimerCount };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task_1',
    label: 'Test task',
    progress: null,
    status: 'running',
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useTaskQueue — push', () => {
  it('adds a task to an empty queue', () => {
    const q = makeQueue();
    q.push(makeTask({ id: 't1', label: 'Saving…' }));
    expect(q.getTasks()).toHaveLength(1);
    expect(q.getTasks()[0]?.label).toBe('Saving…');
  });

  it('does not add a duplicate task with the same id', () => {
    const q = makeQueue();
    q.push(makeTask({ id: 't1' }));
    q.push(makeTask({ id: 't1', label: 'duplicate' }));
    expect(q.getTasks()).toHaveLength(1);
  });

  it('adds multiple tasks with different ids', () => {
    const q = makeQueue();
    q.push(makeTask({ id: 't1' }));
    q.push(makeTask({ id: 't2' }));
    q.push(makeTask({ id: 't3' }));
    expect(q.getTasks()).toHaveLength(3);
  });

  it('preserves all task fields', () => {
    const q = makeQueue();
    q.push(makeTask({ id: 't1', label: 'Export PDF', progress: 42, status: 'running' }));
    const task = q.getTasks()[0]!;
    expect(task.label).toBe('Export PDF');
    expect(task.progress).toBe(42);
    expect(task.status).toBe('running');
  });
});

describe('useTaskQueue — update', () => {
  it('updates the matching task by id', () => {
    const q = makeQueue([makeTask({ id: 't1', progress: 10 })]);
    q.update('t1', { progress: 75 });
    expect(q.getTasks()[0]?.progress).toBe(75);
  });

  it('does not modify other tasks', () => {
    const q = makeQueue([
      makeTask({ id: 't1', label: 'Task A' }),
      makeTask({ id: 't2', label: 'Task B' }),
    ]);
    q.update('t1', { label: 'Task A updated' });
    expect(q.getTasks()[1]?.label).toBe('Task B');
  });

  it('can update status to done', () => {
    const q = makeQueue([makeTask({ id: 't1', status: 'running' })]);
    q.update('t1', { status: 'done' });
    expect(q.getTasks()[0]?.status).toBe('done');
  });

  it('can update status to error', () => {
    const q = makeQueue([makeTask({ id: 't1', status: 'running' })]);
    q.update('t1', { status: 'error' });
    expect(q.getTasks()[0]?.status).toBe('error');
  });

  it('ignores update for unknown id', () => {
    const q = makeQueue([makeTask({ id: 't1' })]);
    q.update('unknown', { label: 'ghost' });
    expect(q.getTasks()[0]?.label).toBe('Test task');
  });
});

describe('useTaskQueue — dismiss', () => {
  it('removes the task with the matching id', () => {
    const q = makeQueue([makeTask({ id: 't1' }), makeTask({ id: 't2' })]);
    q.dismiss('t1');
    expect(q.getTasks()).toHaveLength(1);
    expect(q.getTasks()[0]?.id).toBe('t2');
  });

  it('is a no-op for unknown id', () => {
    const q = makeQueue([makeTask({ id: 't1' })]);
    q.dismiss('unknown');
    expect(q.getTasks()).toHaveLength(1);
  });

  it('empties the queue when all tasks are dismissed', () => {
    const q = makeQueue([makeTask({ id: 't1' }), makeTask({ id: 't2' })]);
    q.dismiss('t1');
    q.dismiss('t2');
    expect(q.getTasks()).toHaveLength(0);
  });
});

describe('useTaskQueue — auto-dismiss on done', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('schedules auto-dismiss when a task is pushed with status done', () => {
    const q = makeQueue();
    q.push(makeTask({ id: 't1', status: 'done' }));
    expect(q.getTasks()).toHaveLength(1); // still present before timeout
    expect(q.getTimerCount()).toBe(1);   // timer registered

    vi.advanceTimersByTime(3000);
    expect(q.getTasks()).toHaveLength(0); // gone after 3 s
  });

  it('schedules auto-dismiss when a running task is updated to done', () => {
    const q = makeQueue([makeTask({ id: 't1', status: 'running' })]);
    q.update('t1', { status: 'done' });
    expect(q.getTasks()).toHaveLength(1);

    vi.advanceTimersByTime(3000);
    expect(q.getTasks()).toHaveLength(0);
  });

  it('does not auto-dismiss error tasks', () => {
    const q = makeQueue([makeTask({ id: 't1', status: 'running' })]);
    q.update('t1', { status: 'error' });
    vi.advanceTimersByTime(5000);
    expect(q.getTasks()).toHaveLength(1); // still present
    expect(q.getTimerCount()).toBe(0);    // no timer scheduled
  });

  it('manual dismiss cancels the pending auto-dismiss timer', () => {
    const q = makeQueue();
    q.push(makeTask({ id: 't1', status: 'done' }));
    expect(q.getTimerCount()).toBe(1);
    q.dismiss('t1');
    expect(q.getTimerCount()).toBe(0);
  });
});
