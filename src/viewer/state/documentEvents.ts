// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Document Event Log
//
// Lightweight in-memory audit trail for document mutations performed during
// the current editing session. Events are appended by ViewerApp whenever
// an annotation, redaction, metadata, form, or page action is executed.
// ---------------------------------------------------------------------------

export type DocumentEventType =
  | 'annotation_created'
  | 'annotation_updated'
  | 'annotation_deleted'
  | 'redaction_created'
  | 'redaction_applied'
  | 'metadata_changed'
  | 'form_field_updated'
  | 'page_mutated'
  /** Text edit successfully persisted to the PDF content stream. */
  | 'text_edit_committed'
  /** Text edit attempted but rejected (backend or validation failure). */
  | 'text_edit_rejected'
  /** Text edit session cancelled by the user without committing. */
  | 'text_edit_cancelled';

export interface DocumentEvent {
  /** Unique event identifier. */
  readonly id: string;
  /** Type of action that triggered this event. */
  readonly type: DocumentEventType;
  /** Wall-clock time the event occurred. */
  readonly timestamp: Date;
  /** Reviewer / author who performed the action. */
  readonly user: string;
  /** 0-based page index the action affected (−1 = document-level). */
  readonly page: number;
  /** ID of the affected annotation, redaction, field, or other object. */
  readonly objectId: string;
  /** Human-readable description of the action. */
  readonly description: string;
}

/** Maximum number of events retained in the log before the oldest are dropped. */
export const DOCUMENT_EVENT_LOG_MAX = 1000;

/** Build a new DocumentEvent with an auto-generated id and current timestamp. */
export function makeDocumentEvent(
  type: DocumentEventType,
  user: string,
  page: number,
  objectId: string,
  description: string,
): DocumentEvent {
  return {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    timestamp: new Date(),
    user,
    page,
    objectId,
    description,
  };
}

/**
 * Append a new event to the log, enforcing the maximum size.
 * When the log exceeds DOCUMENT_EVENT_LOG_MAX the oldest entries are discarded.
 */
export function appendEvent(
  log: readonly DocumentEvent[],
  event: DocumentEvent,
): DocumentEvent[] {
  const next = [...log, event];
  if (next.length > DOCUMENT_EVENT_LOG_MAX) {
    return next.slice(next.length - DOCUMENT_EVENT_LOG_MAX);
  }
  return next;
}
