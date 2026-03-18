// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Undo engine — command pattern for viewer edit history
//
// Each undoable operation is wrapped in a UndoCommand object that knows both
// how to execute (redo) and how to reverse itself (undo). The UndoStack
// manages two arrays: undoStack and redoStack.
//
// Unlike src/lib/undo-redo.ts (which stores metadata only), this module
// stores executable closures so callers do not need to re-implement reversal
// logic at the call site.
// ---------------------------------------------------------------------------

/** A single reversible command. */
export interface UndoCommand {
  /** Human-readable label shown in undo/redo tooltips. */
  readonly description: string;
  /** Re-executes the command (called on redo). */
  execute(): Promise<void>;
  /** Reverses the command (called on undo). */
  undo(): Promise<void>;
}

// ---------------------------------------------------------------------------
// UndoStack
// ---------------------------------------------------------------------------

/**
 * Command-pattern undo/redo stack.
 *
 * Stores UndoCommand instances. Pushing a new command clears the redo branch
 * (standard linear history). The stack has no built-in size cap — the session
 * is the lifetime.
 */
export class UndoStack {
  private undoStack: UndoCommand[] = [];
  private redoStack: UndoCommand[] = [];

  /** Returns true when there is at least one command that can be undone. */
  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** Returns true when there is at least one command that can be redone. */
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Label of the command that would be undone next, or null. */
  get undoLabel(): string | null {
    const top = this.undoStack[this.undoStack.length - 1];
    return top ? top.description : null;
  }

  /** Label of the command that would be redone next, or null. */
  get redoLabel(): string | null {
    const top = this.redoStack[this.redoStack.length - 1];
    return top ? top.description : null;
  }

  /**
   * Push a new command onto the undo stack.
   * The redo branch is cleared because history is now non-linear.
   */
  push(command: UndoCommand): void {
    this.undoStack.push(command);
    this.redoStack = [];
  }

  /**
   * Undo the most recent command.
   * Returns the undone command, or null if the stack was empty.
   */
  async undo(): Promise<UndoCommand | null> {
    const command = this.undoStack.pop() ?? null;
    if (command) {
      await command.undo();
      this.redoStack.push(command);
    }
    return command;
  }

  /**
   * Redo the most recently undone command.
   * Returns the redone command, or null if the redo stack was empty.
   */
  async redo(): Promise<UndoCommand | null> {
    const command = this.redoStack.pop() ?? null;
    if (command) {
      await command.execute();
      this.undoStack.push(command);
    }
    return command;
  }

  /** Remove all entries from both stacks. */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}

// ---------------------------------------------------------------------------
// Factory helpers — build UndoCommand from forward/inverse async functions
// ---------------------------------------------------------------------------

/**
 * Build a UndoCommand from a description and separate execute/undo functions.
 *
 * Usage:
 *   undoStack.push(makeCommand(
 *     'Delete annotation',
 *     () => engine.annotation.delete(pdfDoc, id),
 *     () => engine.annotation.create(pdfDoc, savedData),
 *   ));
 */
export function makeCommand(
  description: string,
  executeFn: () => Promise<void>,
  undoFn: () => Promise<void>,
): UndoCommand {
  return {
    description,
    execute: executeFn,
    undo: undoFn,
  };
}
