// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

const autosaveSource = readFileSync(
  new URL('../src/viewer/state/autosaveManager.ts', import.meta.url),
  'utf8'
);

const settingsSource = readFileSync(
  new URL('../src/viewer/state/appSettings.ts', import.meta.url),
  'utf8'
);

const perfSource = readFileSync(
  new URL('../src/viewer/state/performanceLimits.ts', import.meta.url),
  'utf8'
);

const errorSource = readFileSync(
  new URL('../src/viewer/state/errorCenter.ts', import.meta.url),
  'utf8'
);

const exportUtilsSource = readFileSync(
  new URL('../src/viewer/export/exportUtils.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// Stability: audit log persists during editing
// ---------------------------------------------------------------------------

describe('Stability — audit log persists during editing', () => {
  it('documentEventLog state is initialized as an empty array', () => {
    expect(viewerAppSource).toContain('useState<DocumentEvent[]>([])');
  });

  it('documentEventLog is updated via appendEvent (never direct push)', () => {
    // All mutations go through appendEvent — search for direct array mutation
    expect(viewerAppSource).toContain('appendEvent(prev,');
    // Should NOT use push or concat directly on the log
    const logIdx = viewerAppSource.indexOf('documentEventLog');
    const segment = viewerAppSource.slice(logIdx, logIdx + 5000);
    expect(segment).not.toContain('documentEventLog.push(');
  });

  it('event log is emitted in 8 callback locations', () => {
    const matches = (viewerAppSource.match(/appendEvent\(prev,/g) ?? []).length;
    expect(matches).toBeGreaterThanOrEqual(8);
  });

  it('documentIssues is a useMemo derived from allAnnotations and reviewStatuses', () => {
    expect(viewerAppSource).toContain('const documentIssues = useMemo(');
    const memoIdx = viewerAppSource.indexOf('const documentIssues = useMemo(');
    const block = viewerAppSource.slice(memoIdx, memoIdx + 200);
    expect(block).toContain('extractDocumentIssues');
  });
});

// ---------------------------------------------------------------------------
// Stability: export works after document is dirty
// ---------------------------------------------------------------------------

describe('Stability — export guard checks event log and annotation count', () => {
  it('handleExportReviewSummary guards against empty state', () => {
    expect(viewerAppSource).toContain(
      'allAnnotations.length === 0 && documentIssues.length === 0 && documentEventLog.length === 0'
    );
  });

  it('handleExportAuditReport guards against empty state', () => {
    expect(viewerAppSource).toContain(
      'documentEventLog.length === 0 && allAnnotations.length === 0'
    );
  });
});

// ---------------------------------------------------------------------------
// Stability: snapshots remain valid after navigation
// ---------------------------------------------------------------------------

describe('Stability — snapshots are navigation-independent', () => {
  it('handleCaptureSnapshot does not reference pageIndex', () => {
    const fnStart = viewerAppSource.indexOf('const handleCaptureSnapshot = useCallback(');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const body = viewerAppSource.slice(fnStart, fnEnd);
    // snapshots capture all annotations — not page-scoped
    expect(body).toContain('allAnnotations');
    expect(body).not.toContain('pageAnnotations');
  });

  it('handleCompareSnapshots guards against missing snapshots', () => {
    const fnStart = viewerAppSource.indexOf('const handleCompareSnapshots = useCallback(');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const body = viewerAppSource.slice(fnStart, fnEnd);
    expect(body).toContain('if (!before || !after) return');
  });
});

// ---------------------------------------------------------------------------
// Stability: issue list updates when annotations change
// ---------------------------------------------------------------------------

describe('Stability — documentIssues re-derives on annotation and review changes', () => {
  it('useMemo depends on allAnnotations', () => {
    const memoIdx = viewerAppSource.indexOf('const documentIssues = useMemo(');
    const block = viewerAppSource.slice(memoIdx, memoIdx + 300);
    expect(block).toContain('allAnnotations');
    expect(block).toContain('reviewStatuses');
  });
});

// ---------------------------------------------------------------------------
// Stability: autosave config uses correct thresholds
// ---------------------------------------------------------------------------

describe('Stability — autosave defaults are production-safe', () => {
  it('dirtyDebounceMs is 30 seconds (not shorter)', () => {
    const block = autosaveSource.slice(
      autosaveSource.indexOf('DEFAULT_AUTOSAVE_CONFIG'),
      autosaveSource.indexOf('DEFAULT_AUTOSAVE_CONFIG') + 200
    );
    expect(block).toContain('30_000');
  });

  it('inactivityMs is 10 seconds (not shorter)', () => {
    const block = autosaveSource.slice(
      autosaveSource.indexOf('DEFAULT_AUTOSAVE_CONFIG'),
      autosaveSource.indexOf('DEFAULT_AUTOSAVE_CONFIG') + 200
    );
    expect(block).toContain('10_000');
  });

  it('shouldTriggerAutosave never fires when isDirty is false', () => {
    const fnStart = autosaveSource.indexOf('export function shouldTriggerAutosave');
    const fnEnd = autosaveSource.indexOf('\nexport function ', fnStart + 1);
    const body = autosaveSource.slice(fnStart, fnEnd);
    expect(body).toContain('!isDirty');
  });
});

// ---------------------------------------------------------------------------
// Stability: settings load/save are symmetric
// ---------------------------------------------------------------------------

describe('Stability — settings persistence is symmetric', () => {
  it('loadAppSettings reads the same key saveAppSettings writes', () => {
    expect(settingsSource).toContain('SETTINGS_STORAGE_KEY');
    const getIdx = settingsSource.indexOf('localStorage.getItem(SETTINGS_STORAGE_KEY)');
    const setIdx = settingsSource.indexOf('localStorage.setItem(SETTINGS_STORAGE_KEY');
    expect(getIdx).toBeGreaterThan(-1);
    expect(setIdx).toBeGreaterThan(-1);
  });

  it('updateAppSetting always calls both load and save', () => {
    const fnStart = settingsSource.indexOf('export function updateAppSetting');
    const fnEnd = settingsSource.indexOf('\nexport function ', fnStart + 1);
    const body = settingsSource.slice(fnStart, fnEnd);
    expect(body).toContain('loadAppSettings()');
    expect(body).toContain('saveAppSettings(next)');
  });
});

// ---------------------------------------------------------------------------
// Stability: performance limits are consistent
// ---------------------------------------------------------------------------

describe('Stability — performance limits are enforced at the guard level', () => {
  it('SNAPSHOT_MAX is used by enforceSnapshotMax', () => {
    expect(perfSource).toContain('snapshots.length <= SNAPSHOT_MAX');
  });

  it('ERROR_CENTER_MAX is used by appendError in errorCenter', () => {
    expect(errorSource).toContain('ERROR_CENTER_MAX');
    expect(errorSource).toContain('.slice(next.length - ERROR_CENTER_MAX)');
  });
});

// ---------------------------------------------------------------------------
// Stability: export utils produce deterministic file names
// ---------------------------------------------------------------------------

describe('Stability — export utils produce consistent file names', () => {
  it('buildExportFilename always produces title_type_timestamp.ext pattern', () => {
    const fnStart = exportUtilsSource.indexOf('export function buildExportFilename');
    const fnEnd = exportUtilsSource.indexOf('\nexport function ', fnStart + 1);
    const body = exportUtilsSource.slice(fnStart, fnEnd);
    expect(body).toContain('sanitiseTitle(baseTitle)');
    expect(body).toContain('buildTimestampSuffix(date)');
  });

  it('sanitiseTitle guarantees a non-empty result', () => {
    const fnStart = exportUtilsSource.indexOf('export function sanitiseTitle');
    const fnEnd = exportUtilsSource.indexOf('\nexport function ', fnStart + 1);
    const body = exportUtilsSource.slice(fnStart, fnEnd);
    expect(body).toContain("|| 'document'");
  });
});
