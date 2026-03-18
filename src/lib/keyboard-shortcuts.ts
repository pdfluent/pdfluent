// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Keyboard shortcuts — centralised shortcut registry
//
// Registers global keyboard event handlers for common PDF viewer operations.
// Designed to be imported and activated by the main App component without
// modifying App.tsx directly — the consumer calls `registerKeyboardShortcuts`
// and receives an unsubscribe callback.
// ---------------------------------------------------------------------------

/** Actions the keyboard shortcut system can dispatch. */
export interface KeyboardShortcutActions {
  openFile: () => void;
  save: () => void;
  saveAs: () => void;
  print: () => void;
  undo: () => void;
  redo: () => void;
  search: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  actualSize: () => void;
  previousPage: () => void;
  nextPage: () => void;
  firstPage: () => void;
  lastPage: () => void;
  closeFile: () => void;
}

interface ShortcutDefinition {
  /** The `event.key` value to match (case-insensitive comparison). */
  key: string;
  /** Requires Ctrl (Windows/Linux) or Meta/Cmd (macOS). */
  meta: boolean;
  /** Requires Shift. */
  shift: boolean;
  /** Action name to fire. */
  action: keyof KeyboardShortcutActions;
  /** Human-readable label for UI display. */
  label: string;
}

/**
 * Full list of registered shortcuts. Exported so the UI can render a
 * shortcut reference panel if needed.
 */
export const SHORTCUT_DEFINITIONS: readonly ShortcutDefinition[] = [
  { key: "o", meta: true, shift: false, action: "openFile", label: "Open file" },
  { key: "s", meta: true, shift: false, action: "save", label: "Save" },
  { key: "s", meta: true, shift: true, action: "saveAs", label: "Save As" },
  { key: "p", meta: true, shift: false, action: "print", label: "Print" },
  { key: "z", meta: true, shift: false, action: "undo", label: "Undo" },
  { key: "z", meta: true, shift: true, action: "redo", label: "Redo" },
  { key: "f", meta: true, shift: false, action: "search", label: "Search" },
  { key: "=", meta: true, shift: false, action: "zoomIn", label: "Zoom in" },
  { key: "+", meta: true, shift: false, action: "zoomIn", label: "Zoom in" },
  { key: "-", meta: true, shift: false, action: "zoomOut", label: "Zoom out" },
  { key: "0", meta: true, shift: false, action: "actualSize", label: "Actual size" },
  { key: "w", meta: true, shift: false, action: "closeFile", label: "Close file" },
  { key: "PageUp", meta: false, shift: false, action: "previousPage", label: "Previous page" },
  { key: "PageDown", meta: false, shift: false, action: "nextPage", label: "Next page" },
  { key: "Home", meta: false, shift: false, action: "firstPage", label: "First page" },
  { key: "End", meta: false, shift: false, action: "lastPage", label: "Last page" },
] as const;

/**
 * Detect whether the current platform uses Meta (Cmd) as the primary
 * modifier. Falls back to Ctrl on non-macOS.
 */
function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /mac|iphone|ipad|ipod/i.test(navigator.userAgent);
}

function matchesShortcut(
  event: KeyboardEvent,
  definition: ShortcutDefinition,
): boolean {
  const primaryModifier = isMac() ? event.metaKey : event.ctrlKey;

  if (definition.meta && !primaryModifier) return false;
  if (!definition.meta && primaryModifier) return false;
  if (definition.shift !== event.shiftKey) return false;

  // Alt/Option should not be pressed unless we explicitly want it.
  if (event.altKey) return false;

  return event.key.toLowerCase() === definition.key.toLowerCase();
}

/**
 * Register global keyboard shortcut handlers.
 *
 * @param actions  Object mapping action names to handler functions.
 * @param options  Optional configuration.
 * @returns An unsubscribe function that removes the event listener.
 *
 * @example
 * ```ts
 * const unsubscribe = registerKeyboardShortcuts({
 *   openFile: () => handleOpen(),
 *   save: () => handleSave(),
 *   // ... remaining actions
 * });
 *
 * // Later, to clean up:
 * unsubscribe();
 * ```
 */
export function registerKeyboardShortcuts(
  actions: KeyboardShortcutActions,
  options?: { enabled?: boolean },
): () => void {
  const enabled = options?.enabled ?? true;

  function handleKeyDown(event: KeyboardEvent): void {
    if (!enabled) return;

    // Skip shortcuts when the user is typing in an input, textarea, or
    // contentEditable element — unless the shortcut requires a modifier.
    const target = event.target as HTMLElement | null;
    if (target) {
      const tagName = target.tagName.toLowerCase();
      const isInput = tagName === "input" || tagName === "textarea" || target.isContentEditable;
      if (isInput) {
        // Still allow modifier-based shortcuts (Cmd+S, Cmd+Z, etc.) inside inputs.
        const hasMeta = isMac() ? event.metaKey : event.ctrlKey;
        if (!hasMeta) return;
      }
    }

    for (const definition of SHORTCUT_DEFINITIONS) {
      if (matchesShortcut(event, definition)) {
        event.preventDefault();
        event.stopPropagation();
        const handler = actions[definition.action];
        handler();
        return;
      }
    }
  }

  window.addEventListener("keydown", handleKeyDown, { capture: true });

  return () => {
    window.removeEventListener("keydown", handleKeyDown, { capture: true });
  };
}

/**
 * Format a shortcut definition into a human-readable accelerator string
 * (e.g. "Cmd+S" on macOS, "Ctrl+S" on Windows).
 */
export function formatShortcut(definition: ShortcutDefinition): string {
  const mac = isMac();
  const parts: string[] = [];

  if (definition.meta) {
    parts.push(mac ? "\u2318" : "Ctrl");
  }
  if (definition.shift) {
    parts.push(mac ? "\u21E7" : "Shift");
  }

  // Display-friendly key names.
  const keyMap: Record<string, string> = {
    pageup: "Page Up",
    pagedown: "Page Down",
    home: "Home",
    end: "End",
    "=": "+",
    "-": "\u2013",
  };

  const displayKey =
    keyMap[definition.key.toLowerCase()] ?? definition.key.toUpperCase();
  parts.push(displayKey);

  return parts.join(mac ? "" : "+");
}

/**
 * Build a lookup object from action name to formatted accelerator string.
 * Useful for displaying hints in tooltips.
 */
export function getShortcutHints(): Record<
  keyof KeyboardShortcutActions,
  string
> {
  const hints = {} as Record<keyof KeyboardShortcutActions, string>;

  for (const definition of SHORTCUT_DEFINITIONS) {
    // Only record the first match per action (avoids duplicates like = and +
    // both mapping to zoomIn).
    if (!(definition.action in hints)) {
      hints[definition.action] = formatShortcut(definition);
    }
  }

  return hints;
}
