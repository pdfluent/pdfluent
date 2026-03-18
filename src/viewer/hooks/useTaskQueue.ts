// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useState, useCallback, useRef, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Task shape
// ---------------------------------------------------------------------------

export interface Task {
  id: string;
  label: string;
  /** 0–100, or null when progress is indeterminate */
  progress: number | null;
  status: 'running' | 'done' | 'error';
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseTaskQueueResult {
  tasks: Task[];
  push: (task: Task) => void;
  update: (id: string, partial: Partial<Omit<Task, 'id'>>) => void;
  dismiss: (id: string) => void;
}

const AUTO_DISMISS_MS = 3000;

export function useTaskQueue(): UseTaskQueueResult {
  const [tasks, setTasks] = useState<Task[]>([]);

  // Track pending auto-dismiss timers so they can be cleared on unmount
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Clean up all timers on unmount
  useEffect(() => {
    return () => {
      for (const t of timers.current.values()) clearTimeout(t);
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    const existing = timers.current.get(id);
    if (existing !== undefined) {
      clearTimeout(existing);
      timers.current.delete(id);
    }
  }, []);

  const scheduleAutoDismiss = useCallback((id: string) => {
    const existing = timers.current.get(id);
    if (existing !== undefined) clearTimeout(existing);
    const timer = setTimeout(() => {
      timers.current.delete(id);
      setTasks(prev => prev.filter(t => t.id !== id));
    }, AUTO_DISMISS_MS);
    timers.current.set(id, timer);
  }, []);

  const push = useCallback((task: Task) => {
    setTasks(prev => {
      const exists = prev.some(t => t.id === task.id);
      return exists ? prev : [...prev, task];
    });
    if (task.status === 'done') scheduleAutoDismiss(task.id);
  }, [scheduleAutoDismiss]);

  const update = useCallback((id: string, partial: Partial<Omit<Task, 'id'>>) => {
    setTasks(prev =>
      prev.map(t => t.id === id ? { ...t, ...partial } : t)
    );
    if (partial.status === 'done') scheduleAutoDismiss(id);
  }, [scheduleAutoDismiss]);

  return { tasks, push, update, dismiss };
}
