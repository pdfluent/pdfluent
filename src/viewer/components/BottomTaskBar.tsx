// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// =============================================================================
// BottomTaskBar — the quiet status strip at the foot of the editor.
//
// Surfaces in-flight or recently-completed background tasks (saving, OCR,
// page mutations, exports). Hidden when no tasks are active; a single 28 px
// strip when at least one is. Status colour is the only signal — text stays
// neutral so the strip doesn't shout.
// =============================================================================

import { memo, useCallback } from 'react';
import { XIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTaskQueueContext } from '../context/TaskQueueContext';
import type { Task } from '../hooks/useTaskQueue';

// ---------------------------------------------------------------------------
// Single task row
// ---------------------------------------------------------------------------

// TaskRow is memoised — task lists update on every TaskQueueContext
// dispatch (progress ticks, status changes). Memo lets unchanged rows
// skip re-render when only one row's status changes.
const TaskRow = memo(function TaskRow({ task, onDismiss }: { task: Task; onDismiss: () => void }) {
  const { t } = useTranslation();

  return (
    <div className="bottom-taskbar-row" data-status={task.status}>
      <span className="bottom-taskbar-dot" aria-hidden="true" />
      <span className="bottom-taskbar-label" title={task.label}>
        {task.label}
      </span>

      {task.progress !== null && task.status === 'running' && (
        <div
          className="bottom-taskbar-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(task.progress)}
        >
          <div
            className="bottom-taskbar-progress-fill"
            style={{ width: `${Math.min(100, Math.max(0, task.progress))}%` }}
          />
        </div>
      )}

      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('tasks.dismiss')}
        title={t('tasks.dismiss')}
        className="bottom-taskbar-dismiss"
      >
        <XIcon aria-hidden="true" />
      </button>
    </div>
  );
});

// ---------------------------------------------------------------------------
// BottomTaskBar
// ---------------------------------------------------------------------------

export function BottomTaskBar() {
  const { tasks, dismiss } = useTaskQueueContext();

  // Stable dismiss callback per task id so memoised TaskRow can skip
  // re-renders when other rows update.
  const makeDismiss = useCallback(
    (id: string) => () => {
      dismiss(id);
    },
    [dismiss],
  );

  if (tasks.length === 0) return null;

  return (
    <div
      data-testid="bottom-task-bar"
      className="bottom-taskbar"
      role="status"
      aria-live="polite"
    >
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} onDismiss={makeDismiss(task.id)} />
      ))}
    </div>
  );
}
