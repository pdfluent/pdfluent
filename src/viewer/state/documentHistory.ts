// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Undo and redo of the open document (J-85). The history lives in the backend
// next to the document (src-tauri/src/history.rs): every mutating command keeps
// the state before it, so text edits, annotations, page operations, form
// fields and redaction marks are all undoable by one mechanism. This module is
// the webview's side of it.

import { invokeCommand } from '../../lib/commandBridge';

export interface DocumentHistoryState {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  /** The document differs from what was last opened or saved. */
  modified: boolean;
}

export interface HistoryStepDocument {
  pageCount: number;
  title: string | null;
  author: string | null;
}

export interface HistoryStepResult {
  applied: boolean;
  history: DocumentHistoryState;
  document: HistoryStepDocument;
}

/** The event the backend sends after every edit, undo, redo, save and open. */
export const DOCUMENT_HISTORY_EVENT = 'document-history';

export const EMPTY_HISTORY: DocumentHistoryState = {
  canUndo: false,
  canRedo: false,
  undoLabel: null,
  redoLabel: null,
  modified: false,
};

interface RawStep {
  applied: boolean;
  history: DocumentHistoryState;
  document: { page_count?: number; pageCount?: number; title?: string | null; author?: string | null };
}

function normaliseStep(raw: RawStep): HistoryStepResult {
  return {
    applied: raw.applied,
    history: raw.history,
    document: {
      pageCount: raw.document.pageCount ?? raw.document.page_count ?? 0,
      title: raw.document.title ?? null,
      author: raw.document.author ?? null,
    },
  };
}

export async function undoDocument(): Promise<HistoryStepResult> {
  return normaliseStep(await invokeCommand<RawStep>('undo_document'));
}

export async function redoDocument(): Promise<HistoryStepResult> {
  return normaliseStep(await invokeCommand<RawStep>('redo_document'));
}

export async function getDocumentHistory(): Promise<DocumentHistoryState> {
  return invokeCommand<DocumentHistoryState>('get_document_history');
}

/**
 * Run `fn` as one undo step: a text commit is a replacement, a size/colour
 * change and a weight change, and the user did one thing. The group is closed
 * even when `fn` throws.
 */
export async function withEditGroup<T>(label: string, fn: () => Promise<T>): Promise<T> {
  await invokeCommand<void>('begin_edit_group', { label });
  try {
    return await fn();
  } finally {
    await invokeCommand<void>('end_edit_group');
  }
}
