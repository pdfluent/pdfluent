// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const source = readFileSync(
  new URL('../src/viewer/components/ReviewHandoffPanel.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// ReviewHandoffPanelProps interface
// ---------------------------------------------------------------------------

describe('ReviewHandoffPanelProps', () => {
  it('declares isOpen boolean field', () => {
    const ifaceStart = source.indexOf('interface ReviewHandoffPanelProps');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('isOpen: boolean');
  });

  it('declares onClose callback', () => {
    const ifaceStart = source.indexOf('interface ReviewHandoffPanelProps');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('onClose: () => void');
  });

  it('declares documentTitle field', () => {
    const ifaceStart = source.indexOf('interface ReviewHandoffPanelProps');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('documentTitle: string');
  });

  it('declares annotations array', () => {
    const ifaceStart = source.indexOf('interface ReviewHandoffPanelProps');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('annotations: Annotation[]');
  });

  it('declares reviewStatuses Map', () => {
    const ifaceStart = source.indexOf('interface ReviewHandoffPanelProps');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain("reviewStatuses: Map<string, 'open' | 'resolved'>");
  });

  it('declares commentReplies Map', () => {
    const ifaceStart = source.indexOf('interface ReviewHandoffPanelProps');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('commentReplies: Map<string, Reply[]>');
  });

  it('declares eventLog array', () => {
    const ifaceStart = source.indexOf('interface ReviewHandoffPanelProps');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('eventLog: DocumentEvent[]');
  });

  it('declares reviewerIdentity field', () => {
    const ifaceStart = source.indexOf('interface ReviewHandoffPanelProps');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('reviewerIdentity: ReviewerIdentity');
  });

  it('declares onExport callback', () => {
    const ifaceStart = source.indexOf('interface ReviewHandoffPanelProps');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('onExport:');
  });

  it('declares onImport callback', () => {
    const ifaceStart = source.indexOf('interface ReviewHandoffPanelProps');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('onImport:');
  });

  it('declares onMerge callback', () => {
    const ifaceStart = source.indexOf('interface ReviewHandoffPanelProps');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('onMerge:');
  });
});

// ---------------------------------------------------------------------------
// ReviewHandoffPanel component
// ---------------------------------------------------------------------------

describe('ReviewHandoffPanel', () => {
  it('exports ReviewHandoffPanel function', () => {
    expect(source).toContain('export function ReviewHandoffPanel(');
  });

  it('returns null when isOpen is false', () => {
    expect(source).toContain('if (!isOpen) return null');
  });

  it('renders handoff-panel root element', () => {
    expect(source).toContain('data-testid="handoff-panel"');
  });

  it('renders handoff-close-btn button', () => {
    expect(source).toContain('data-testid="handoff-close-btn"');
  });

  it('renders handoff-reviewer-name element', () => {
    expect(source).toContain('data-testid="handoff-reviewer-name"');
  });

  it('renders handoff-export-section', () => {
    expect(source).toContain('data-testid="handoff-export-section"');
  });

  it('renders handoff-export-btn button', () => {
    expect(source).toContain('data-testid="handoff-export-btn"');
  });

  it('renders handoff-import-section', () => {
    expect(source).toContain('data-testid="handoff-import-section"');
  });

  it('renders handoff-import-input file input', () => {
    expect(source).toContain('data-testid="handoff-import-input"');
  });

  it('renders handoff-merge-section when diff is available', () => {
    expect(source).toContain('data-testid="handoff-merge-section"');
  });

  it('renders handoff-merge-btn button', () => {
    expect(source).toContain('data-testid="handoff-merge-btn"');
  });

  it('renders handoff-diff-summary element', () => {
    expect(source).toContain('data-testid="handoff-diff-summary"');
  });
});

// ---------------------------------------------------------------------------
// Integration checks
// ---------------------------------------------------------------------------

describe('ReviewHandoffPanel integrations', () => {
  it('uses isBundleExportable to gate export button', () => {
    expect(source).toContain('isBundleExportable(annotations, eventLog)');
  });

  it('calls parseReviewBundleJson on file load', () => {
    expect(source).toContain('parseReviewBundleJson(json)');
  });

  it('calls compareReviewBundles to build diff preview', () => {
    expect(source).toContain('compareReviewBundles(');
  });

  it('calls describeBundleDiff for summary text', () => {
    expect(source).toContain('describeBundleDiff(diff)');
  });

  it('calls mergeReviewStates on merge action', () => {
    expect(source).toContain('mergeReviewStates(');
  });

  it('calls getReviewerDisplayName for reviewer label', () => {
    expect(source).toContain('getReviewerDisplayName(reviewerIdentity)');
  });

  it('disables export button when not exportable', () => {
    expect(source).toContain('disabled={!exportable}');
  });
});
