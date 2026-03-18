// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Interaction debug utilities.
 *
 * Dev-mode only. Provides structured logging of interaction state
 * transitions to aid in debugging hover, selection, cursor, and
 * contextual action behaviour.
 *
 * Production builds: this module is imported but all functions
 * are no-ops behind the `import.meta.env.DEV` guard, so the
 * tree-shaker can eliminate them entirely.
 */

import type { InteractionState } from './interactionState';
import type { ViewerCursor } from './cursorController';
import type { ContextTrigger, ActionContext } from './contextActions';
import type { HoverTarget } from './hoverController';

// ---------------------------------------------------------------------------
// Log record types
// ---------------------------------------------------------------------------

export type InteractionLogKind =
  | 'hover:enter'
  | 'hover:leave'
  | 'hover:clear'
  | 'state:change'
  | 'cursor:change'
  | 'action:fire'
  | 'action:register'
  | 'action:unregister';

export interface InteractionLogRecord {
  kind: InteractionLogKind;
  timestamp: number;
  payload: unknown;
}

// ---------------------------------------------------------------------------
// Logger class
// ---------------------------------------------------------------------------

const MAX_LOG_ENTRIES = 200;

/**
 * InteractionDebugLogger records interaction events in a ring buffer.
 * In dev mode it also prints to the browser console (at verbose level).
 *
 * One global instance is created and attached to `window.__pdfluent_test__`.
 */
export class InteractionDebugLogger {
  private _log: InteractionLogRecord[] = [];
  private _enabled = false;

  // ── Public API ────────────────────────────────────────────────────────────

  /** Enable/disable logging. Off by default to avoid noise. */
  enable(): void { this._enabled = true; }
  disable(): void { this._enabled = false; }
  get enabled(): boolean { return this._enabled; }

  /** Return a shallow copy of the recent log entries. */
  get entries(): ReadonlyArray<InteractionLogRecord> {
    return [...this._log];
  }

  /** Clear the log buffer. */
  clear(): void { this._log = []; }

  // ── Typed log helpers ─────────────────────────────────────────────────────

  logHoverEnter(target: HoverTarget, layer: number): void {
    this._record('hover:enter', { target, layer });
  }

  logHoverLeave(target: HoverTarget): void {
    this._record('hover:leave', { target });
  }

  logHoverClear(): void {
    this._record('hover:clear', {});
  }

  logStateChange(
    objectId: string,
    prev: InteractionState,
    next: InteractionState,
  ): void {
    if (prev === next) return;
    this._record('state:change', { objectId, prev, next });
  }

  logCursorChange(prev: ViewerCursor, next: ViewerCursor): void {
    if (prev === next) return;
    this._record('cursor:change', { prev, next });
  }

  logActionFire(trigger: ContextTrigger, context: ActionContext): void {
    this._record('action:fire', { trigger, contextKind: context.kind });
  }

  logActionRegister(actionId: string, trigger: ContextTrigger): void {
    this._record('action:register', { actionId, trigger });
  }

  logActionUnregister(actionId: string): void {
    this._record('action:unregister', { actionId });
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _record(kind: InteractionLogKind, payload: unknown): void {
    if (!this._enabled) return;
    const record: InteractionLogRecord = { kind, timestamp: Date.now(), payload };
    if (this._log.length >= MAX_LOG_ENTRIES) {
      this._log.shift();
    }
    this._log.push(record);
    // eslint-disable-next-line no-console
    console.debug(`[interaction] ${kind}`, payload);
  }
}

// ---------------------------------------------------------------------------
// Singleton (dev-only)
// ---------------------------------------------------------------------------

/**
 * The global debug logger.
 * In production, logging is disabled and the buffer stays empty.
 * Components and hooks import this directly — no context needed.
 */
export const interactionDebugLogger = new InteractionDebugLogger();

// ---------------------------------------------------------------------------
// window.__pdfluent_test__ extension helper
// ---------------------------------------------------------------------------

/**
 * Attach the debug logger to `window.__pdfluent_test__` so Playwright tests
 * and browser DevTools can inspect interaction state.
 *
 * Call this from ViewerApp's dev-only useEffect, after `__pdfluent_test__` is
 * already created.
 *
 * @example
 * // In ViewerApp's test-hook useEffect:
 * if (import.meta.env.DEV) {
 *   attachInteractionDebugToTestHook();
 * }
 */
export function attachInteractionDebugToTestHook(): void {
  if (!import.meta.env.DEV) return;
  const hook = window.__pdfluent_test__;
  if (!hook) return;
  // @ts-expect-error — extend existing type in dev only
  hook.interactionLogger = {
    enable: () => { interactionDebugLogger.enable(); },
    disable: () => { interactionDebugLogger.disable(); },
    clear: () => { interactionDebugLogger.clear(); },
    entries: () => interactionDebugLogger.entries,
    /** Last N entries (convenience for Playwright assertions). */
    last: (n: number) => [...interactionDebugLogger.entries].slice(-n),
  };
}
