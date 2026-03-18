// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A unique identifier for a hoverable element. */
export type HoverTarget = string;

export interface HoverEvent {
  target: HoverTarget;
  /** Layer precedence — higher wins when multiple layers overlap. */
  layer: number;
  /** Timestamp of the hover event. */
  timestamp: number;
}

export type HoverHandler = (event: HoverEvent | null) => void;

// ---------------------------------------------------------------------------
// HoverController class
// ---------------------------------------------------------------------------

/**
 * HoverController tracks which element is currently hovered across
 * multiple layers (text, annotation, form field, etc.).
 *
 * Hover enter/leave events are debounced to avoid flicker when the
 * pointer moves rapidly between adjacent elements.
 *
 * Design decisions:
 * - Does NOT modify DOM directly — reports state, components render.
 * - Does NOT interfere with existing AnnotationOverlay hover logic.
 * - Thread-safe: debounce timer is cleared on leave.
 */
export class HoverController {
  private _current: HoverEvent | null = null;
  private _debounceMs: number;
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _handlers = new Set<HoverHandler>();

  constructor(debounceMs = 30) {
    this._debounceMs = debounceMs;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Subscribe to hover changes. Returns an unsubscribe function. */
  subscribe(handler: HoverHandler): () => void {
    this._handlers.add(handler);
    return () => { this._handlers.delete(handler); };
  }

  /** Signal that the pointer entered an element. */
  enter(target: HoverTarget, layer = 0): void {
    this._clearDebounce();
    const event: HoverEvent = { target, layer, timestamp: Date.now() };
    // If already on the same target, skip re-emission.
    if (this._current?.target === target) return;
    this._current = event;
    this._emit(event);
  }

  /**
   * Signal that the pointer left an element.
   * Debounced — does not immediately clear if pointer enters another
   * element within the debounce window.
   */
  leave(target: HoverTarget): void {
    if (this._current?.target !== target) return;
    this._clearDebounce();
    this._debounceTimer = setTimeout(() => {
      if (this._current?.target === target) {
        this._current = null;
        this._emit(null);
      }
    }, this._debounceMs);
  }

  /** Forcibly clear hover state (e.g. when pointer leaves the viewer entirely). */
  clear(): void {
    this._clearDebounce();
    if (this._current !== null) {
      this._current = null;
      this._emit(null);
    }
  }

  /** Return the current hover target or null. */
  get current(): HoverEvent | null {
    return this._current;
  }

  /** True if the given target is currently hovered. */
  isHovered(target: HoverTarget): boolean {
    return this._current?.target === target;
  }

  /** Dispose the controller, clearing all timers and handlers. */
  dispose(): void {
    this._clearDebounce();
    this._handlers.clear();
    this._current = null;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _emit(event: HoverEvent | null): void {
    for (const handler of this._handlers) {
      handler(event);
    }
  }

  private _clearDebounce(): void {
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
  }
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

export interface UseHoverControllerResult {
  /** The current hover target, or null. */
  hoveredTarget: HoverTarget | null;
  /** Call on mouse enter for a target element. */
  onEnter: (target: HoverTarget, layer?: number) => void;
  /** Call on mouse leave for a target element. */
  onLeave: (target: HoverTarget) => void;
  /** Force-clear hover state (e.g. on pointer-leave for the whole surface). */
  clearHover: () => void;
  /** The underlying controller instance. */
  controller: HoverController;
}

/**
 * React hook wrapping HoverController.
 *
 * Creates a stable controller instance for the lifetime of the component.
 * Returns reactive `hoveredTarget` state that triggers re-renders on change.
 */
export function useHoverController(debounceMs = 30): UseHoverControllerResult {
  const controllerRef = useRef<HoverController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = new HoverController(debounceMs);
  }
  const controller = controllerRef.current;

  const [hoveredTarget, setHoveredTarget] = useState<HoverTarget | null>(null);

  useEffect(() => {
    const unsub = controller.subscribe((event) => {
      setHoveredTarget(event?.target ?? null);
    });
    return () => {
      unsub();
      controller.dispose();
    };
  }, [controller]);

  const onEnter = useCallback(
    (target: HoverTarget, layer = 0) => { controller.enter(target, layer); },
    [controller],
  );

  const onLeave = useCallback(
    (target: HoverTarget) => { controller.leave(target); },
    [controller],
  );

  const clearHover = useCallback(() => { controller.clear(); }, [controller]);

  return { hoveredTarget, onEnter, onLeave, clearHover, controller };
}
