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

import type { DocumentEvent } from '../state/documentEvents';

interface TimelinePanelProps {
  /** The full event log to render. */
  events: DocumentEvent[];
  /** Called when the user clicks an event to navigate to its page. */
  onNavigate?: (pageIndex: number) => void;
}

const EVENT_LABELS: Record<string, string> = {
  annotation_created:   'Annotatie aangemaakt',
  annotation_updated:   'Annotatie bijgewerkt',
  annotation_deleted:   'Annotatie verwijderd',
  redaction_created:    'Redactie aangemaakt',
  redaction_applied:    'Redacties toegepast',
  metadata_changed:     'Metadata gewijzigd',
  form_field_updated:   'Formulierveld bijgewerkt',
  page_mutated:         'Pagina gewijzigd',
  text_edit_committed:  'Tekstbewerking opgeslagen',
  text_edit_rejected:   'Tekstbewerking geweigerd',
  text_edit_cancelled:  'Tekstbewerking geannuleerd',
};

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function TimelinePanel({ events, onNavigate }: TimelinePanelProps) {
  if (events.length === 0) {
    return (
      <div data-testid="timeline-panel" className="p-3">
        <p className="text-[10px] text-muted-foreground/60">Geen activiteit.</p>
      </div>
    );
  }

  // Show most recent events first
  const reversed = [...events].reverse();

  return (
    <div data-testid="timeline-panel" className="flex flex-col gap-0.5 p-1 overflow-y-auto max-h-full">
      {reversed.map(event => {
        const label = EVENT_LABELS[event.type] ?? event.type;
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
