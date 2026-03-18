// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const timelineSource = readFileSync(
  new URL('../src/viewer/components/TimelinePanel.tsx', import.meta.url),
  'utf8'
);

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// TimelinePanel — component structure
// ---------------------------------------------------------------------------

describe('TimelinePanel — component structure', () => {
  it('exports TimelinePanel function', () => {
    expect(timelineSource).toContain('export function TimelinePanel(');
  });

  it('renders data-testid="timeline-panel" root element', () => {
    expect(timelineSource).toContain('data-testid="timeline-panel"');
  });

  it('renders data-testid="timeline-event" for each event', () => {
    expect(timelineSource).toContain('data-testid="timeline-event"');
  });

  it('renders a page navigation button with data-testid="timeline-event-page-link"', () => {
    expect(timelineSource).toContain('data-testid="timeline-event-page-link"');
  });
});

// ---------------------------------------------------------------------------
// TimelinePanel — props
// ---------------------------------------------------------------------------

describe('TimelinePanel — props', () => {
  it('accepts events prop', () => {
    const fnStart = timelineSource.indexOf('export function TimelinePanel(');
    const sig = timelineSource.slice(fnStart, fnStart + 300);
    expect(sig).toContain('events');
  });

  it('accepts onNavigate prop', () => {
    expect(timelineSource).toContain('onNavigate');
  });

  it('onNavigate is optional (safe when absent)', () => {
    expect(timelineSource).toContain('onNavigate?');
  });
});

// ---------------------------------------------------------------------------
// TimelinePanel — display
// ---------------------------------------------------------------------------

describe('TimelinePanel — display', () => {
  it('shows reviewer name (user) for each event', () => {
    expect(timelineSource).toContain('event.user');
  });

  it('shows event type label for each event', () => {
    expect(timelineSource).toContain('EVENT_LABELS');
  });

  it('displays a timestamp per event', () => {
    expect(timelineSource).toContain('formatTime');
    expect(timelineSource).toContain('event.timestamp');
  });

  it('shows page reference for page-level events', () => {
    expect(timelineSource).toContain('event.page');
  });

  it('page link calls onNavigate with event.page', () => {
    expect(timelineSource).toContain('onNavigate?.(event.page)');
  });

  it('shows empty state message when events array is empty', () => {
    expect(timelineSource).toContain('events.length === 0');
  });

  it('renders events in reverse-chronological order (most recent first)', () => {
    expect(timelineSource).toContain('.reverse()');
  });
});

// ---------------------------------------------------------------------------
// TimelinePanel — EVENT_LABELS map
// ---------------------------------------------------------------------------

describe('TimelinePanel — EVENT_LABELS', () => {
  it('maps annotation_created', () => {
    expect(timelineSource).toContain('annotation_created');
  });

  it('maps annotation_updated', () => {
    expect(timelineSource).toContain('annotation_updated');
  });

  it('maps annotation_deleted', () => {
    expect(timelineSource).toContain('annotation_deleted');
  });

  it('maps redaction_created', () => {
    expect(timelineSource).toContain('redaction_created');
  });

  it('maps metadata_changed', () => {
    expect(timelineSource).toContain('metadata_changed');
  });

  it('maps form_field_updated', () => {
    expect(timelineSource).toContain('form_field_updated');
  });

  it('maps page_mutated', () => {
    expect(timelineSource).toContain('page_mutated');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — TimelinePanel wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — TimelinePanel wiring', () => {
  it('imports TimelinePanel', () => {
    expect(viewerAppSource).toContain("from './components/TimelinePanel'");
  });

  it('has showTimeline state', () => {
    expect(viewerAppSource).toContain('showTimeline');
    expect(viewerAppSource).toContain('setShowTimeline');
  });

  it('renders TimelinePanel with events={documentEventLog}', () => {
    expect(viewerAppSource).toContain('events={documentEventLog}');
  });

  it('passes onNavigate to TimelinePanel', () => {
    expect(viewerAppSource).toContain('onNavigate=');
  });

  it('onNavigate calls setPageIndex', () => {
    const panelStart = viewerAppSource.indexOf('<TimelinePanel');
    const panelEnd = viewerAppSource.indexOf('/>', panelStart) + 2;
    const panelBody = viewerAppSource.slice(panelStart, panelEnd);
    expect(panelBody).toContain('setPageIndex');
  });

  it('renders timeline panel container with close button', () => {
    expect(viewerAppSource).toContain('timeline-panel-close-btn');
  });

  it('close button sets showTimeline to false', () => {
    expect(viewerAppSource).toContain('setShowTimeline(false)');
  });
});
