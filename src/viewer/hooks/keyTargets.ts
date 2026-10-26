// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Every single-key and edit-history shortcut asks this module whether the key
// belongs to the text the user is typing. Each handler used to carry its own
// copy of the guard, and the mode switch (1–8) forgot `isContentEditable`: the
// inline text editor is a contentEditable element, so typing "2026" in a line
// of text switched the viewer to Review, Edit and Read mode (#642). One helper
// means a new shortcut cannot forget it.

import type { ViewerMode } from '../types';

/** The parts of a KeyboardEvent the shortcut decisions read. */
export interface ShortcutKeyEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  defaultPrevented?: boolean;
  target: EventTarget | null;
}

interface TypingTargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
}

/**
 * True when the key goes to something the user is typing in: an input, a
 * textarea, a select, or any contentEditable element (the inline text editor).
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as TypingTargetLike;
  const tag = (el.tagName ?? '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable === true) return true;
  // A key event can target a node inside the editor whose own flag is unset
  // (a child span of the contentEditable root in some engines).
  if (typeof el.closest === 'function' && el.closest('[contenteditable=""],[contenteditable="true"]')) return true;
  return false;
}

export const MODE_KEYS: Readonly<Record<string, ViewerMode>> = {
  '1': 'read',
  '2': 'review',
  '3': 'edit',
  '4': 'sign',
  '5': 'organize',
  '6': 'forms',
  '7': 'protect',
  '8': 'convert',
};

/**
 * The viewer mode a plain digit key switches to, or null when the key is not a
 * mode shortcut here: a modifier is held, another handler already consumed it,
 * the key goes to a typing target, or inline text editing is active.
 */
export function modeForKeyEvent(e: ShortcutKeyEvent, editingTextTargetId: string | null): ViewerMode | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (e.defaultPrevented) return null;
  if (editingTextTargetId !== null) return null;
  if (isTypingTarget(e.target)) return null;
  return MODE_KEYS[e.key] ?? null;
}

export type HistoryAction = 'undo' | 'redo';

/**
 * Whether the key is the document's undo or redo. Inside a typing target the
 * field's own undo applies, so the document history is left alone. Redo is
 * ⌘⇧Z / Ctrl+Shift+Z (the key reads "Z" with Shift held) and Ctrl+Y.
 */
export function historyActionForKeyEvent(e: ShortcutKeyEvent, editingTextTargetId: string | null): HistoryAction | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return null;
  if (editingTextTargetId !== null) return null;
  if (isTypingTarget(e.target)) return null;
  const key = e.key.toLowerCase();
  if (key === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && e.ctrlKey && !e.metaKey && !e.shiftKey) return 'redo';
  return null;
}
