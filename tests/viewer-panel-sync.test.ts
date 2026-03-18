// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const panelSource = readFileSync(
  new URL('../src/viewer/components/RightContextPanel.tsx', import.meta.url),
  'utf8'
);

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// RightContextPanelProps — 4 new props
// ---------------------------------------------------------------------------

describe('RightContextPanel — panel sync: props interface', () => {
  it('declares activeCommentIdx prop as number', () => {
    expect(panelSource).toContain('activeCommentIdx: number');
  });

  it('declares onCommentSelect prop as (idx: number) => void', () => {
    expect(panelSource).toContain('onCommentSelect: (idx: number) => void');
  });

  it('declares activeFieldIdx prop as number', () => {
    expect(panelSource).toContain('activeFieldIdx: number');
  });

  it('declares onFieldSelect prop as (idx: number) => void', () => {
    expect(panelSource).toContain('onFieldSelect: (idx: number) => void');
  });
});

// ---------------------------------------------------------------------------
// ReviewModeContent — props, flat index, clickable items, highlight
// ---------------------------------------------------------------------------

describe('RightContextPanel — panel sync: ReviewModeContent', () => {
  it('ReviewModeContent receives activeCommentIdx prop', () => {
    expect(panelSource).toContain('activeCommentIdx: number');
  });

  it('ReviewModeContent receives onCommentSelect prop', () => {
    expect(panelSource).toContain('onCommentSelect: (idx: number) => void');
  });

  it('uses useRef for activeItemRef in review mode', () => {
    expect(panelSource).toContain('activeItemRef');
    expect(panelSource).toContain('useRef<HTMLButtonElement | null>(null)');
  });

  it('calls scrollIntoView on activeItemRef when activeCommentIdx changes', () => {
    expect(panelSource).toContain("activeItemRef.current?.scrollIntoView({ block: 'nearest' })");
    expect(panelSource).toContain(', [activeCommentIdx]');
  });

  it('renders data-testid="review-comment-item" buttons', () => {
    expect(panelSource).toContain('data-testid="review-comment-item"');
  });

  it('uses commentFlatIndexMap to derive original index per comment item', () => {
    expect(panelSource).toContain('commentFlatIndexMap.get(comment.id) ?? -1');
  });

  it('marks the active item with isActive flag via originalIdx', () => {
    expect(panelSource).toContain('const isActive = originalIdx === activeCommentIdx');
  });

  it('calls onCommentSelect with originalIdx on click', () => {
    expect(panelSource).toContain('onCommentSelect(originalIdx)');
  });

  it('applies highlight class to active comment item', () => {
    expect(panelSource).toContain("isActive ? 'bg-primary/5 ring-1 ring-primary/40'");
  });

  it('uses callback ref to track active comment element', () => {
    expect(panelSource).toContain('if (isActive) { activeItemRef.current = el; }');
  });
});

// ---------------------------------------------------------------------------
// FormsModeContent — props, clickable items, highlight
// ---------------------------------------------------------------------------

describe('RightContextPanel — panel sync: FormsModeContent', () => {
  it('FormsModeContent receives activeFieldIdx prop', () => {
    expect(panelSource).toContain('activeFieldIdx: number');
  });

  it('FormsModeContent receives onFieldSelect prop', () => {
    expect(panelSource).toContain('onFieldSelect: (idx: number) => void');
  });

  it('calls scrollIntoView on activeItemRef when activeFieldIdx changes', () => {
    expect(panelSource).toContain(', [activeFieldIdx]');
  });

  it('renders data-testid="forms-field-item" buttons', () => {
    expect(panelSource).toContain('data-testid="forms-field-item"');
  });

  it('marks the active field with isActive flag', () => {
    expect(panelSource).toContain('const isActive = idx === activeFieldIdx');
  });

  it('calls onFieldSelect with idx on click', () => {
    expect(panelSource).toContain('onFieldSelect(idx)');
  });

  it('applies highlight class to active field item', () => {
    // Same highlight class pattern used for both comment and field items
    const count = (panelSource.match(/isActive \? 'bg-primary\/5 ring-1 ring-primary\/40'/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// RightContextPanel main component — passes new props to sub-components
// ---------------------------------------------------------------------------

describe('RightContextPanel — panel sync: wiring', () => {
  it('passes activeCommentIdx to ReviewModeContent', () => {
    expect(panelSource).toContain('activeCommentIdx={activeCommentIdx}');
  });

  it('passes onCommentSelect to ReviewModeContent', () => {
    expect(panelSource).toContain('onCommentSelect={onCommentSelect}');
  });

  it('passes activeFieldIdx to FormsModeContent', () => {
    expect(panelSource).toContain('activeFieldIdx={activeFieldIdx}');
  });

  it('passes onFieldSelect to FormsModeContent', () => {
    expect(panelSource).toContain('onFieldSelect={onFieldSelect}');
  });

  it('destructures activeCommentIdx in RightContextPanel', () => {
    const componentDecl = panelSource.slice(panelSource.indexOf('export function RightContextPanel'));
    expect(componentDecl).toContain('activeCommentIdx');
  });

  it('destructures onCommentSelect in RightContextPanel', () => {
    const componentDecl = panelSource.slice(panelSource.indexOf('export function RightContextPanel'));
    expect(componentDecl).toContain('onCommentSelect');
  });

  it('destructures activeFieldIdx in RightContextPanel', () => {
    const componentDecl = panelSource.slice(panelSource.indexOf('export function RightContextPanel'));
    expect(componentDecl).toContain('activeFieldIdx');
  });

  it('destructures onFieldSelect in RightContextPanel', () => {
    const componentDecl = panelSource.slice(panelSource.indexOf('export function RightContextPanel'));
    expect(componentDecl).toContain('onFieldSelect');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — passes 4 new props to RightContextPanel
// ---------------------------------------------------------------------------

// Locate the RightContextPanel JSX block for scoped assertions
const panelBlockStart = viewerAppSource.indexOf('<RightContextPanel');
const panelBlockEnd   = viewerAppSource.indexOf('/>', panelBlockStart) + 2;
const panelBlock      = viewerAppSource.slice(panelBlockStart, panelBlockEnd);

describe('ViewerApp — panel sync: RightContextPanel wiring', () => {
  it('passes activeCommentIdx to RightContextPanel', () => {
    expect(panelBlock).toContain('activeCommentIdx={activeCommentIdx}');
  });

  it('passes onCommentSelect={handleCommentNav} to RightContextPanel', () => {
    expect(panelBlock).toContain('onCommentSelect={handleCommentNav}');
  });

  it('passes activeFieldIdx to RightContextPanel', () => {
    expect(panelBlock).toContain('activeFieldIdx={activeFieldIdx}');
  });

  it('passes onFieldSelect={handleFieldNav} to RightContextPanel', () => {
    expect(panelBlock).toContain('onFieldSelect={handleFieldNav}');
  });
});

// ---------------------------------------------------------------------------
// No regressions — existing panel features intact
// ---------------------------------------------------------------------------

describe('RightContextPanel — panel sync: no regressions', () => {
  it('ReviewModeContent still exists', () => {
    expect(panelSource).toContain('function ReviewModeContent');
  });

  it('FormsModeContent still exists', () => {
    expect(panelSource).toContain('function FormsModeContent');
  });

  it('review-comment-group-heading testid still rendered', () => {
    expect(panelSource).toContain('data-testid="review-comment-group-heading"');
  });

  it('doc-info-panel testid still rendered', () => {
    expect(panelSource).toContain('data-testid="doc-info-panel"');
  });

  it('FIELD_TYPE_LABELS still used in FormsModeContent', () => {
    expect(panelSource).toContain('FIELD_TYPE_LABELS');
  });

  it('EncryptDecryptControls still present in protect mode', () => {
    expect(panelSource).toContain('EncryptDecryptControls');
  });

  it('CollapsibleSection still used for all modes', () => {
    expect(panelSource).toContain('CollapsibleSection');
  });

  it('useRef and useEffect still imported from react', () => {
    expect(panelSource).toContain('useRef');
    expect(panelSource).toContain('useEffect');
  });
});
