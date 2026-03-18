// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Undo/redo stack — client-side operation tracking
//
// This module provides a generic undo/redo stack that records operations with
// their inverse (undo) counterparts. It is designed to be used alongside the
// existing byte-level undo/redo in App.tsx, providing operation metadata that
// can drive UI state while the heavy lifting (byte snapshots) continues to
// happen in App.tsx.
// ---------------------------------------------------------------------------

/** Supported operation types that can be tracked for undo/redo. */
export type OperationType =
  | "form_field_change"
  | "page_rotation"
  | "page_deletion"
  | "page_reorder"
  | "page_insertion"
  | "page_duplication"
  | "annotation_add"
  | "annotation_remove"
  | "text_edit"
  | "watermark_add"
  | "image_add"
  | "image_remove"
  | "redaction";

/** A single recorded operation. */
export interface UndoableOperation {
  /** Unique identifier for this operation entry. */
  readonly id: string;
  /** Human-readable label for the operation (e.g. "Rotate page 3"). */
  readonly label: string;
  /** Category of operation. */
  readonly type: OperationType;
  /** Arbitrary parameters that were used for the forward operation. */
  readonly params: Readonly<Record<string, unknown>>;
  /** Parameters needed to reverse the operation. */
  readonly reverseParams: Readonly<Record<string, unknown>>;
  /** ISO 8601 timestamp when the operation was recorded. */
  readonly createdAt: string;
}

/** Snapshot of the stack state, useful for React consumption. */
export interface UndoRedoState {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoLabel: string | null;
  readonly redoLabel: string | null;
  readonly undoCount: number;
  readonly redoCount: number;
}

type StateChangeListener = (state: UndoRedoState) => void;

let nextId = 0;

function generateId(): string {
  nextId += 1;
  return `op_${Date.now()}_${nextId}`;
}

/**
 * Client-side undo/redo stack.
 *
 * Records operations with forward and reverse metadata. Does not execute
 * operations itself — the caller is responsible for invoking the actual
 * mutation. This keeps the stack free of side effects and easy to test.
 */
export class UndoRedoStack {
  private undoStack: UndoableOperation[] = [];
  private redoStack: UndoableOperation[] = [];
  private readonly maxSize: number;
  private listeners: Set<StateChangeListener> = new Set();

  constructor(maxSize = 50) {
    this.maxSize = maxSize;
  }

  // ── Queries ──────────────────────────────────────────────────────────

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoCount(): number {
    return this.undoStack.length;
  }

  get redoCount(): number {
    return this.redoStack.length;
  }

  /** Label of the next operation that would be undone, or null. */
  get undoLabel(): string | null {
    const top = this.undoStack[this.undoStack.length - 1];
    return top ? top.label : null;
  }

  /** Label of the next operation that would be redone, or null. */
  get redoLabel(): string | null {
    const top = this.redoStack[this.redoStack.length - 1];
    return top ? top.label : null;
  }

  /** Return a snapshot of the current state. */
  getState(): UndoRedoState {
    return {
      canUndo: this.canUndo,
      canRedo: this.canRedo,
      undoLabel: this.undoLabel,
      redoLabel: this.redoLabel,
      undoCount: this.undoCount,
      redoCount: this.redoCount,
    };
  }

  // ── Commands ─────────────────────────────────────────────────────────

  /**
   * Record a new operation. Clears the redo stack (new branch).
   * Returns the created operation.
   */
  push(
    type: OperationType,
    label: string,
    params: Record<string, unknown>,
    reverseParams: Record<string, unknown>,
  ): UndoableOperation {
    const operation: UndoableOperation = {
      id: generateId(),
      label,
      type,
      params: { ...params },
      reverseParams: { ...reverseParams },
      createdAt: new Date().toISOString(),
    };

    this.undoStack.push(operation);

    // Trim oldest entries when the stack exceeds its limit.
    if (this.undoStack.length > this.maxSize) {
      this.undoStack = this.undoStack.slice(
        this.undoStack.length - this.maxSize,
      );
    }

    // New forward action invalidates the redo branch.
    this.redoStack = [];

    this.notifyListeners();
    return operation;
  }

  /**
   * Pop the most recent operation from the undo stack and move it to redo.
   * Returns the operation that should be reversed, or null if the stack is
   * empty.
   */
  undo(): UndoableOperation | null {
    const operation = this.undoStack.pop() ?? null;
    if (operation) {
      this.redoStack.push(operation);
      this.notifyListeners();
    }
    return operation;
  }

  /**
   * Pop the most recent operation from the redo stack and move it to undo.
   * Returns the operation that should be re-applied, or null if the stack
   * is empty.
   */
  redo(): UndoableOperation | null {
    const operation = this.redoStack.pop() ?? null;
    if (operation) {
      this.undoStack.push(operation);
      this.notifyListeners();
    }
    return operation;
  }

  /** Remove all entries from both stacks. */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.notifyListeners();
  }

  // ── Subscriptions ────────────────────────────────────────────────────

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: StateChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}

/**
 * Convenience helper: create an operation label from a type and optional
 * page number.
 */
export function formatOperationLabel(
  type: OperationType,
  pageNumber?: number,
): string {
  const labels: Record<OperationType, string> = {
    form_field_change: "Change form field",
    page_rotation: "Rotate page",
    page_deletion: "Delete page",
    page_reorder: "Reorder pages",
    page_insertion: "Insert page",
    page_duplication: "Duplicate page",
    annotation_add: "Add annotation",
    annotation_remove: "Remove annotation",
    text_edit: "Edit text",
    watermark_add: "Add watermark",
    image_add: "Add image",
    image_remove: "Remove image",
    redaction: "Redact content",
  };

  const base = labels[type];
  if (pageNumber !== undefined) {
    return `${base} ${pageNumber}`;
  }
  return base;
}
