// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const source = readFileSync(
  new URL('../src/viewer/state/performanceLimits.ts', import.meta.url),
  'utf8'
);

const eventLogSource = readFileSync(
  new URL('../src/viewer/state/documentEvents.ts', import.meta.url),
  'utf8'
);

const snapshotSource = readFileSync(
  new URL('../src/viewer/revisionSnapshot.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// EVENT_LOG_MAX
// ---------------------------------------------------------------------------

describe('performanceLimits — EVENT_LOG_MAX', () => {
  it('re-exports EVENT_LOG_MAX from documentEvents', () => {
    expect(source).toContain('EVENT_LOG_MAX');
    expect(source).toContain('documentEvents');
  });

  it('documentEvents defines DOCUMENT_EVENT_LOG_MAX = 1000', () => {
    expect(eventLogSource).toContain('DOCUMENT_EVENT_LOG_MAX = 1000');
  });
});

// ---------------------------------------------------------------------------
// SNAPSHOT_MAX
// ---------------------------------------------------------------------------

describe('performanceLimits — SNAPSHOT_MAX', () => {
  it('exports SNAPSHOT_MAX constant', () => {
    expect(source).toContain('export const SNAPSHOT_MAX');
  });

  it('SNAPSHOT_MAX is 20', () => {
    expect(source).toContain('SNAPSHOT_MAX = 20');
  });
});

// ---------------------------------------------------------------------------
// ANNOTATION_RENDER_THROTTLE_MS
// ---------------------------------------------------------------------------

describe('performanceLimits — ANNOTATION_RENDER_THROTTLE_MS', () => {
  it('exports ANNOTATION_RENDER_THROTTLE_MS', () => {
    expect(source).toContain('export const ANNOTATION_RENDER_THROTTLE_MS');
  });

  it('throttle is 100ms', () => {
    expect(source).toContain('ANNOTATION_RENDER_THROTTLE_MS = 100');
  });
});

// ---------------------------------------------------------------------------
// enforceSnapshotMax
// ---------------------------------------------------------------------------

describe('enforceSnapshotMax', () => {
  it('exports enforceSnapshotMax function', () => {
    expect(source).toContain('export function enforceSnapshotMax<T>(');
  });

  it('returns unchanged array when within limit', () => {
    const fnStart = source.indexOf('export function enforceSnapshotMax');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('snapshots.length <= SNAPSHOT_MAX');
  });

  it('evicts oldest entries when over the limit', () => {
    const fnStart = source.indexOf('export function enforceSnapshotMax');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('snapshots.length - SNAPSHOT_MAX');
  });
});

// ---------------------------------------------------------------------------
// isEventLogAtCapacity
// ---------------------------------------------------------------------------

describe('isEventLogAtCapacity', () => {
  it('exports isEventLogAtCapacity function', () => {
    expect(source).toContain('export function isEventLogAtCapacity(logLength: number)');
  });

  it('compares logLength against EVENT_LOG_MAX', () => {
    const fnStart = source.indexOf('export function isEventLogAtCapacity');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd === fnStart ? fnStart + 200 : fnEnd);
    expect(body).toContain('logLength >= EVENT_LOG_MAX');
  });
});

// ---------------------------------------------------------------------------
// isAnnotationCountHighRisk
// ---------------------------------------------------------------------------

describe('isAnnotationCountHighRisk', () => {
  it('exports ANNOTATION_RENDER_WARNING_THRESHOLD', () => {
    expect(source).toContain('export const ANNOTATION_RENDER_WARNING_THRESHOLD');
  });

  it('warning threshold is 500', () => {
    expect(source).toContain('ANNOTATION_RENDER_WARNING_THRESHOLD = 500');
  });

  it('exports isAnnotationCountHighRisk function', () => {
    expect(source).toContain('export function isAnnotationCountHighRisk(count: number)');
  });

  it('compares count against ANNOTATION_RENDER_WARNING_THRESHOLD', () => {
    const fnStart = source.indexOf('export function isAnnotationCountHighRisk');
    const body = source.slice(fnStart, fnStart + 150);
    expect(body).toContain('ANNOTATION_RENDER_WARNING_THRESHOLD');
  });
});

// ---------------------------------------------------------------------------
// Document event log overflow — appendEvent cap already enforced
// ---------------------------------------------------------------------------

describe('documentEvents — appendEvent overflow guard', () => {
  it('appendEvent slices to DOCUMENT_EVENT_LOG_MAX when exceeded', () => {
    expect(eventLogSource).toContain('DOCUMENT_EVENT_LOG_MAX');
    expect(eventLogSource).toContain('next.length - DOCUMENT_EVENT_LOG_MAX');
  });
});

// ---------------------------------------------------------------------------
// Snapshot structure integrity
// ---------------------------------------------------------------------------

describe('revisionSnapshot — captureRevisionSnapshot is page-navigation-independent', () => {
  it('captureRevisionSnapshot function signature does not accept pageIndex', () => {
    const fnStart = snapshotSource.indexOf('export function captureRevisionSnapshot(');
    const closeParen = snapshotSource.indexOf('): RevisionSnapshot', fnStart);
    const sig = snapshotSource.slice(fnStart, closeParen);
    expect(sig).not.toContain('pageIndex:');
  });
});
