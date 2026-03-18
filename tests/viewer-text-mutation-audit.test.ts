// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Text Mutation Audit Integration — Phase 4 Batch 7
 *
 * Verifies that real text edit events are integrated into the event log,
 * timeline panel, and audit report systems:
 *
 * - DocumentEventType includes text_edit_committed, text_edit_rejected, text_edit_cancelled
 * - makeDocumentEvent correctly constructs each text edit event type
 * - text_edit_* events appear in buildAuditReportData's activityTimeline
 * - text_edit_* events aggregate in reviewerActions (audit report)
 * - TimelinePanel EVENT_LABELS covers all three new event types
 * - buildAuditReportMarkdown renders text_edit_* events
 * - ViewerApp emits page_mutated (or text_edit_committed) after successful mutation
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  makeDocumentEvent,
  appendEvent,
} from '../src/viewer/state/documentEvents';
import {
  buildAuditReportData,
  buildAuditReportMarkdown,
} from '../src/viewer/export/auditReport';

const __dir = dirname(fileURLToPath(import.meta.url));

const documentEventsSrc = readFileSync(
  join(__dir, '../src/viewer/state/documentEvents.ts'),
  'utf8',
);
const timelinePanelSrc = readFileSync(
  join(__dir, '../src/viewer/components/TimelinePanel.tsx'),
  'utf8',
);
const viewerAppSrc = [
  '../src/viewer/hooks/usePageNavigation.ts',
  '../src/viewer/hooks/useZoomControls.ts',
  '../src/viewer/hooks/useSidebarState.ts',
  '../src/viewer/hooks/useUndoRedo.ts',
  '../src/viewer/hooks/useSearch.ts',
  '../src/viewer/hooks/useFormFields.ts',
  '../src/viewer/hooks/useModeManager.ts',
  '../src/viewer/hooks/useDocumentLifecycle.ts',
  '../src/viewer/hooks/useCommands.ts',
  '../src/viewer/hooks/useDragDrop.ts',
  '../src/viewer/ViewerSidePanels.tsx',
  '../src/viewer/hooks/useAnnotations.ts',
  '../src/viewer/hooks/useTextInteraction.ts',
  '../src/viewer/hooks/useKeyboardShortcuts.ts',
  '../src/viewer/ViewerApp.tsx',
  '../src/viewer/WelcomeSection.tsx',
].map(p => readFileSync(join(__dir, p), 'utf8')).join('\n\n');

// ---------------------------------------------------------------------------
// DocumentEventType — new text edit event types
// ---------------------------------------------------------------------------

describe('documentEvents — text edit event types in union', () => {
  it("includes 'text_edit_committed' in DocumentEventType", () => {
    expect(documentEventsSrc).toContain("'text_edit_committed'");
  });

  it("includes 'text_edit_rejected' in DocumentEventType", () => {
    expect(documentEventsSrc).toContain("'text_edit_rejected'");
  });

  it("includes 'text_edit_cancelled' in DocumentEventType", () => {
    expect(documentEventsSrc).toContain("'text_edit_cancelled'");
  });

  it('text_edit_committed type works with makeDocumentEvent at runtime', () => {
    const event = makeDocumentEvent('text_edit_committed', 'jan', 0, 'p0:s0', 'Opgeslagen');
    expect(event.type).toBe('text_edit_committed');
  });

  it('text_edit_rejected type works with makeDocumentEvent at runtime', () => {
    const event = makeDocumentEvent('text_edit_rejected', 'jan', 0, 'p0:s0', 'Geweigerd');
    expect(event.type).toBe('text_edit_rejected');
  });

  it('text_edit_cancelled type works with makeDocumentEvent at runtime', () => {
    const event = makeDocumentEvent('text_edit_cancelled', 'jan', 0, 'p0:s0', 'Geannuleerd');
    expect(event.type).toBe('text_edit_cancelled');
  });
});

// ---------------------------------------------------------------------------
// Event log — text edit event appending
// ---------------------------------------------------------------------------

describe('event log — text edit event appending', () => {
  it('appendEvent adds text_edit_committed to log', () => {
    const event = makeDocumentEvent('text_edit_committed', 'jan', 0, 'p0:s0', 'Opgeslagen');
    const log = appendEvent([], event);
    expect(log).toHaveLength(1);
    expect(log[0]!.type).toBe('text_edit_committed');
  });

  it('appendEvent adds text_edit_rejected to log', () => {
    const event = makeDocumentEvent('text_edit_rejected', 'jan', 0, 'p0:s0', 'Geweigerd');
    const log = appendEvent([], event);
    expect(log[0]!.type).toBe('text_edit_rejected');
  });

  it('appendEvent adds text_edit_cancelled to log', () => {
    const event = makeDocumentEvent('text_edit_cancelled', 'jan', 0, 'p0:s0', 'Geannuleerd');
    const log = appendEvent([], event);
    expect(log[0]!.type).toBe('text_edit_cancelled');
  });

  it('multiple text edit events from one session all appear in log', () => {
    const e1 = makeDocumentEvent('text_edit_committed', 'jan', 0, 'p0:s0', 'Edit 1');
    const e2 = makeDocumentEvent('text_edit_rejected', 'jan', 0, 'p0:s1', 'Reject 1');
    const e3 = makeDocumentEvent('text_edit_cancelled', 'jan', 1, 'p1:s0', 'Cancel 1');
    const log = appendEvent(appendEvent(appendEvent([], e1), e2), e3);
    expect(log).toHaveLength(3);
    expect(log.map(e => e.type)).toEqual([
      'text_edit_committed',
      'text_edit_rejected',
      'text_edit_cancelled',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Audit report — text edit events in activity timeline
// ---------------------------------------------------------------------------

describe('buildAuditReportData — text edit events in activity timeline', () => {
  it('text_edit_committed appears in activityTimeline', () => {
    const event = makeDocumentEvent('text_edit_committed', 'jan', 0, 'p0:s0', 'Opgeslagen');
    const data = buildAuditReportData('Test.pdf', [], [event], []);
    expect(data.activityTimeline).toHaveLength(1);
    expect(data.activityTimeline[0]!.type).toBe('text_edit_committed');
  });

  it('text_edit_rejected appears in activityTimeline', () => {
    const event = makeDocumentEvent('text_edit_rejected', 'jan', 0, 'p0:s0', 'Geweigerd');
    const data = buildAuditReportData('Test.pdf', [], [event], []);
    expect(data.activityTimeline[0]!.type).toBe('text_edit_rejected');
  });

  it('text_edit_cancelled appears in activityTimeline', () => {
    const event = makeDocumentEvent('text_edit_cancelled', 'jan', 0, 'p0:s0', 'Geannuleerd');
    const data = buildAuditReportData('Test.pdf', [], [event], []);
    expect(data.activityTimeline[0]!.type).toBe('text_edit_cancelled');
  });

  it('text_edit_committed aggregates in reviewerActions', () => {
    const event = makeDocumentEvent('text_edit_committed', 'jan', 0, 'p0:s0', 'Opgeslagen');
    const data = buildAuditReportData('Test.pdf', [], [event], []);
    const janActions = data.reviewerActions.find(r => r.reviewer === 'jan');
    expect(janActions).toBeDefined();
    expect(janActions!.eventTypes).toContain('text_edit_committed');
  });

  it('text_edit_rejected aggregates in reviewerActions', () => {
    const event = makeDocumentEvent('text_edit_rejected', 'jan', 0, 'p0:s0', 'Geweigerd');
    const data = buildAuditReportData('Test.pdf', [], [event], []);
    const janActions = data.reviewerActions.find(r => r.reviewer === 'jan');
    expect(janActions!.eventTypes).toContain('text_edit_rejected');
  });

  it('mixed text edit events from same user aggregate correctly', () => {
    const e1 = makeDocumentEvent('text_edit_committed', 'jan', 0, 'p0:s0', 'Edit 1');
    const e2 = makeDocumentEvent('text_edit_rejected', 'jan', 0, 'p0:s1', 'Reject 1');
    const data = buildAuditReportData('Test.pdf', [], [e1, e2], []);
    const janActions = data.reviewerActions.find(r => r.reviewer === 'jan');
    expect(janActions!.eventCount).toBe(2);
    expect(janActions!.eventTypes).toContain('text_edit_committed');
    expect(janActions!.eventTypes).toContain('text_edit_rejected');
  });
});

// ---------------------------------------------------------------------------
// Audit report markdown — text edit events rendered
// ---------------------------------------------------------------------------

describe('buildAuditReportMarkdown — text edit events rendered', () => {
  it('renders text_edit_committed in markdown output', () => {
    const event = makeDocumentEvent('text_edit_committed', 'jan', 0, 'p0:s0', 'Opgeslagen');
    const data = buildAuditReportData('Test.pdf', [], [event], []);
    const md = buildAuditReportMarkdown(data);
    expect(md).toContain('text_edit_committed');
  });

  it('renders text_edit_rejected in markdown output', () => {
    const event = makeDocumentEvent('text_edit_rejected', 'jan', 0, 'p0:s0', 'Geweigerd');
    const data = buildAuditReportData('Test.pdf', [], [event], []);
    const md = buildAuditReportMarkdown(data);
    expect(md).toContain('text_edit_rejected');
  });

  it('renders text_edit_cancelled in markdown output', () => {
    const event = makeDocumentEvent('text_edit_cancelled', 'jan', 0, 'p0:s0', 'Geannuleerd');
    const data = buildAuditReportData('Test.pdf', [], [event], []);
    const md = buildAuditReportMarkdown(data);
    expect(md).toContain('text_edit_cancelled');
  });
});

// ---------------------------------------------------------------------------
// TimelinePanel — labels for new event types
// ---------------------------------------------------------------------------

describe('TimelinePanel — EVENT_LABELS covers text edit types', () => {
  it('has a label for text_edit_committed', () => {
    expect(timelinePanelSrc).toContain('text_edit_committed');
  });

  it('has a label for text_edit_rejected', () => {
    expect(timelinePanelSrc).toContain('text_edit_rejected');
  });

  it('has a label for text_edit_cancelled', () => {
    expect(timelinePanelSrc).toContain('text_edit_cancelled');
  });

  it('text_edit_committed label contains "Tekstbewerking"', () => {
    const idx = timelinePanelSrc.indexOf('text_edit_committed');
    const block = timelinePanelSrc.slice(idx, idx + 80);
    expect(block).toContain("'timeline.textEditCommitted'");
  });

  it('timeline falls back to event.type for unknown types', () => {
    // The fallback: EVENT_LABEL_KEYS[event.type] ?? event.type → label : event.type
    expect(timelinePanelSrc).toContain('event.type');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — text edit events emitted after mutation
// ---------------------------------------------------------------------------

describe('ViewerApp — page_mutated used for successful text edit', () => {
  it('handleDraftCommit emits page_mutated event on success', () => {
    const idx = viewerAppSrc.indexOf('handleDraftCommit');
    const block = viewerAppSrc.slice(idx, idx + 2500);
    expect(block).toContain('page_mutated');
    expect(block).toContain('makeDocumentEvent');
  });

  it('handleDraftCommit includes original and replacement text in description', () => {
    const idx = viewerAppSrc.indexOf('handleDraftCommit');
    const block = viewerAppSrc.slice(idx, idx + 2500);
    expect(block).toContain('originalText');
    expect(block).toContain('committedText');
  });
});
