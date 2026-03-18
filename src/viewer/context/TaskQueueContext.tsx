// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useTaskQueue } from '../hooks/useTaskQueue';
import type { UseTaskQueueResult } from '../hooks/useTaskQueue';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const TaskQueueContext = createContext<UseTaskQueueResult | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function TaskQueueProvider({ children }: { children: ReactNode }) {
  const queue = useTaskQueue();
  return (
    <TaskQueueContext.Provider value={queue}>
      {children}
    </TaskQueueContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

export function useTaskQueueContext(): UseTaskQueueResult {
  const ctx = useContext(TaskQueueContext);
  if (ctx === null) {
    throw new Error('useTaskQueueContext must be used within a TaskQueueProvider');
  }
  return ctx;
}
