// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { XIcon } from 'lucide-react';
import { useTaskQueueContext } from '../context/TaskQueueContext';
import type { Task } from '../hooks/useTaskQueue';

// ---------------------------------------------------------------------------
// Single task row
// ---------------------------------------------------------------------------

function TaskRow({ task, onDismiss }: { task: Task; onDismiss: () => void }) {
  const statusColor =
    task.status === 'error' ? 'text-destructive' :
    task.status === 'done'  ? 'text-green-500' :
    'text-muted-foreground';

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className={`text-[10px] truncate ${statusColor}`}>
        {task.label}
      </span>

      {task.progress !== null && task.status === 'running' && (
        <div className="w-16 h-1 bg-muted rounded-full overflow-hidden shrink-0">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(0, task.progress))}%` }}
          />
        </div>
      )}

      <button
        onClick={onDismiss}
        aria-label={`Taak sluiten: ${task.label}`}
        className="shrink-0 p-0.5 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
      >
        <XIcon className="w-2.5 h-2.5" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BottomTaskBar
// ---------------------------------------------------------------------------

export function BottomTaskBar() {
  const { tasks, dismiss } = useTaskQueueContext();

  if (tasks.length === 0) return null;

  return (
    <div className="h-6 flex items-center px-3 gap-4 border-t border-border bg-muted/20 shrink-0 overflow-hidden">
      {tasks.map(task => (
        <TaskRow
          key={task.id}
          task={task}
          onDismiss={() => { dismiss(task.id); }}
        />
      ))}
    </div>
  );
}
