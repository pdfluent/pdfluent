// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// TimelinePanel — chronological document activity feed.
//
// Displays the in-session event log in reverse-chronological order.
// Each entry shows the action type, reviewer name, page reference, and
// timestamp. Clicking a page-level event navigates to that page.
// ---------------------------------------------------------------------------

import { useTranslation } from 'react-i18next';
import type { DocumentEvent } from '../state/documentEvents';

interface TimelinePanelProps {
  /** The full event log to render. */
  events: DocumentEvent[];
  /** Called when the user clicks an event to navigate to its page. */
  onNavigate?: (pageIndex: number) => void;
}

const EVENT_LABEL_KEYS: Record<string, string> = {
  annotation_created:   'timeline.annotationCreated',
  annotation_updated:   'timeline.annotationUpdated',
  annotation_deleted:   'timeline.annotationDeleted',
  redaction_created:    'timeline.redactionCreated',
  redaction_applied:    'timeline.redactionApplied',
  metadata_changed:     'timeline.metadataChanged',
  form_field_updated:   'timeline.formFieldUpdated',
  page_mutated:         'timeline.pageMutated',
  text_edit_committed:  'timeline.textEditCommitted',
  text_edit_rejected:   'timeline.textEditRejected',
  text_edit_cancelled:  'timeline.textEditCancelled',
};

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function TimelinePanel({ events, onNavigate }: TimelinePanelProps) {
  const { t } = useTranslation();

  if (events.length === 0) {
    return (
      <div data-testid="timeline-panel" className="p-3">
        <p className="text-[10px] text-muted-foreground/60">{t('timeline.noActivity')}</p>
      </div>
    );
  }

  // Show most recent events first
  const reversed = [...events].reverse();

  return (
    <div data-testid="timeline-panel" className="flex flex-col gap-0.5 p-1 overflow-y-auto max-h-full">
      {reversed.map(event => {
        const labelKey = EVENT_LABEL_KEYS[event.type];
        const label = labelKey !== undefined ? t(labelKey) : event.type;
        const hasPage = event.page >= 0;

        return (
          <div
            key={event.id}
            data-testid="timeline-event"
            className="flex flex-col gap-0.5 px-2 py-1.5 rounded hover:bg-muted/30 cursor-default"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-medium text-foreground truncate">{label}</span>
              <span className="text-[9px] text-muted-foreground shrink-0">{formatTime(event.timestamp)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-muted-foreground truncate">{event.user || '—'}</span>
              {hasPage && (
                <button
                  data-testid="timeline-event-page-link"
                  className="text-[9px] text-primary underline-offset-2 hover:underline shrink-0"
                  onClick={() => { onNavigate?.(event.page); }}
                >
                  p.{event.page + 1}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
