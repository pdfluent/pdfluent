// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Contextual action trigger registry.
 *
 * Defines the trigger vocabulary and action registry that contextual UI
 * (toolbars, popover menus, keyboard shortcuts) will use once implemented.
 *
 * Phase 1 prepares the data layer only:
 * - Trigger types and context payloads
 * - ActionRegistry class with subscribe/fire API
 * - React hook wrapping the registry
 *
 * No DOM side-effects. No action implementations yet.
 * Consumers register handlers; this module dispatches.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { Rect } from './selectionChrome';

// ---------------------------------------------------------------------------
// Context payloads — what triggered the action and on what
// ---------------------------------------------------------------------------

export interface AnnotationActionContext {
  kind: 'annotation';
  annotationId: string;
  pageIndex: number;
}

export interface FormFieldActionContext {
  kind: 'form-field';
  fieldId: string;
  pageIndex: number;
}

export interface TextSelectionActionContext {
  kind: 'text-selection';
  text: string;
  pageIndex: number;
  /** Bounding rects of the selected text spans in PDF-space coordinates. */
  rects: Rect[];
}

export interface TextBlockActionContext {
  kind: 'text-block';
  blockId: string;
  pageIndex: number;
}

export interface PageActionContext {
  kind: 'page';
  pageIndex: number;
}

/** Sentinel — no object is in context (selection cleared). */
export interface NoneActionContext {
  kind: 'none';
}

export type ActionContext =
  | AnnotationActionContext
  | FormFieldActionContext
  | TextSelectionActionContext
  | TextBlockActionContext
  | PageActionContext
  | NoneActionContext;

// ---------------------------------------------------------------------------
// Trigger names
// ---------------------------------------------------------------------------

/**
 * The set of trigger events that fire actions.
 *
 * Naming convention: `<object-kind>:<event>`.
 * Colon separates the subject from the event so that handlers can
 * subscribe to broad categories by prefix-matching if desired.
 */
export type ContextTrigger =
  | 'annotation:selected'
  | 'annotation:deselected'
  | 'annotation:hover-enter'
  | 'annotation:hover-leave'
  | 'form-field:selected'
  | 'form-field:editing-start'
  | 'form-field:editing-commit'
  | 'form-field:editing-cancel'
  | 'text:selected'
  | 'text:deselected'
  | 'text-block:hover-enter'
  | 'text-block:hover-leave'
  | 'page:focused';

// ---------------------------------------------------------------------------
// Action definitions
// ---------------------------------------------------------------------------

/** Extract the ActionContext type that matches a given trigger. */
export type ContextForTrigger<T extends ContextTrigger> =
  T extends 'annotation:selected' | 'annotation:deselected' | 'annotation:hover-enter' | 'annotation:hover-leave'
    ? AnnotationActionContext
    : T extends 'form-field:selected' | 'form-field:editing-start' | 'form-field:editing-commit' | 'form-field:editing-cancel'
    ? FormFieldActionContext
    : T extends 'text:selected' | 'text:deselected'
    ? TextSelectionActionContext
    : T extends 'text-block:hover-enter' | 'text-block:hover-leave'
    ? TextBlockActionContext
    : T extends 'page:focused'
    ? PageActionContext
    : ActionContext;

export interface ContextAction<T extends ContextTrigger = ContextTrigger> {
  /** Stable identifier — used for deduplication and unregistration. */
  id: string;
  /** Human-readable label (future: shown in contextual menus / tooltips). */
  label: string;
  /** The trigger that fires this action. */
  trigger: T;
  /**
   * Optional guard — return false to skip this action for the given context.
   * Evaluated before the handler is called.
   */
  predicate?: (context: ContextForTrigger<T>) => boolean;
  /**
   * The handler to call when the trigger fires and predicate passes.
   * Async handlers are fire-and-forget from the registry's perspective.
   */
  execute: (context: ContextForTrigger<T>) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// ActionRegistry class
// ---------------------------------------------------------------------------

type GenericAction = ContextAction<ContextTrigger>;
type TriggerMap = Map<ContextTrigger, Set<GenericAction>>;

/**
 * ActionRegistry coordinates contextual action registration and dispatch.
 *
 * Components register actions keyed by trigger; the registry dispatches
 * to all matching handlers when `fire()` is called.
 *
 * Design decisions:
 * - Actions are identified by `id` — re-registering with the same id
 *   replaces the previous registration.
 * - No ordering guarantees within a trigger group.
 * - Errors in individual handlers are caught and logged; they do not
 *   prevent other handlers from running.
 */
export class ActionRegistry {
  private _map: TriggerMap = new Map();
  private _byId = new Map<string, GenericAction>();

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Register an action.
   * If an action with the same `id` is already registered, it is replaced.
   * Returns an unregister function.
   */
  register<T extends ContextTrigger>(action: ContextAction<T>): () => void {
    const generic = action as GenericAction;

    // Replace existing registration with same id.
    if (this._byId.has(generic.id)) {
      this._unregisterById(generic.id);
    }

    this._byId.set(generic.id, generic);
    let set = this._map.get(generic.trigger);
    if (!set) {
      set = new Set();
      this._map.set(generic.trigger, set);
    }
    set.add(generic);

    return () => { this._unregisterById(generic.id); };
  }

  /** Unregister an action by id. No-op if not registered. */
  unregister(id: string): void {
    this._unregisterById(id);
  }

  /**
   * Fire a trigger with the given context.
   * Calls all registered actions for the trigger whose predicate passes.
   * Promise-returning handlers are not awaited — use `fireAsync` if needed.
   */
  fire<T extends ContextTrigger>(
    trigger: T,
    context: ContextForTrigger<T>,
  ): void {
    const handlers = this._map.get(trigger);
    if (!handlers) return;
    for (const action of handlers) {
      if (action.predicate) {
        try {
          if (!action.predicate(context as never)) continue;
        } catch (err) {
          console.error(`[ActionRegistry] predicate error in "${action.id}":`, err);
          continue;
        }
      }
      try {
        void action.execute(context as never);
      } catch (err) {
        console.error(`[ActionRegistry] handler error in "${action.id}":`, err);
      }
    }
  }

  /**
   * Fire a trigger and await all async handlers in parallel.
   */
  async fireAsync<T extends ContextTrigger>(
    trigger: T,
    context: ContextForTrigger<T>,
  ): Promise<void> {
    const handlers = this._map.get(trigger);
    if (!handlers) return;
    const promises: Promise<void>[] = [];
    for (const action of handlers) {
      if (action.predicate) {
        try {
          if (!action.predicate(context as never)) continue;
        } catch (err) {
          console.error(`[ActionRegistry] predicate error in "${action.id}":`, err);
          continue;
        }
      }
      try {
        const result = action.execute(context as never);
        if (result instanceof Promise) promises.push(result);
      } catch (err) {
        console.error(`[ActionRegistry] handler error in "${action.id}":`, err);
      }
    }
    await Promise.all(promises);
  }

  /** Return all registered action ids. */
  get registeredIds(): ReadonlyArray<string> {
    return Array.from(this._byId.keys());
  }

  /** Return all actions registered for a trigger. */
  actionsForTrigger(trigger: ContextTrigger): ReadonlyArray<GenericAction> {
    return Array.from(this._map.get(trigger) ?? []);
  }

  /** Remove all registrations. */
  dispose(): void {
    this._map.clear();
    this._byId.clear();
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _unregisterById(id: string): void {
    const action = this._byId.get(id);
    if (!action) return;
    this._byId.delete(id);
    this._map.get(action.trigger)?.delete(action);
  }
}

// ---------------------------------------------------------------------------
// Singleton registry (shared across the viewer)
// ---------------------------------------------------------------------------

/**
 * The viewer-global ActionRegistry instance.
 * Components import and use this directly — no context/provider needed
 * since the registry is stateless from React's perspective.
 */
export const viewerActionRegistry = new ActionRegistry();

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

export interface UseContextActionsResult {
  /** Register an action; automatically unregistered on component unmount. */
  registerAction: <T extends ContextTrigger>(action: ContextAction<T>) => void;
  /** Fire a trigger against the shared registry. */
  fire: <T extends ContextTrigger>(trigger: T, context: ContextForTrigger<T>) => void;
  /** The underlying registry (for direct access if needed). */
  registry: ActionRegistry;
}

/**
 * React hook for interacting with the shared viewer ActionRegistry.
 *
 * Registrations made via `registerAction` are automatically cleaned up
 * when the component unmounts.
 */
export function useContextActions(
  registry: ActionRegistry = viewerActionRegistry,
): UseContextActionsResult {
  const unsubsRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    return () => {
      // Unregister all actions registered by this component instance.
      for (const unsub of unsubsRef.current) {
        unsub();
      }
      unsubsRef.current = [];
    };
  }, [registry]);

  const registerAction = useCallback(
    <T extends ContextTrigger>(action: ContextAction<T>) => {
      const unsub = registry.register(action);
      unsubsRef.current.push(unsub);
    },
    [registry],
  );

  const fire = useCallback(
    <T extends ContextTrigger>(trigger: T, context: ContextForTrigger<T>) => {
      registry.fire(trigger, context);
    },
    [registry],
  );

  return { registerAction, fire, registry };
}
