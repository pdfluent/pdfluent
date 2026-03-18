// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const modelSource = readFileSync(
  new URL('../src/core/document/model.ts', import.meta.url),
  'utf8'
);

const annotationEngineSource = readFileSync(
  new URL('../src/platform/engine/tauri/TauriAnnotationEngine.ts', import.meta.url),
  'utf8'
);

const rightPanelSource = readFileSync(
  new URL('../src/viewer/components/RightContextPanel.tsx', import.meta.url),
  'utf8'
);

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// Annotation model — status field
// ---------------------------------------------------------------------------

describe('Annotation model — status field', () => {
  it('Annotation interface has optional status field', () => {
    expect(modelSource).toContain("status?: 'open' | 'resolved'");
  });

  it('Reply interface is defined', () => {
    expect(modelSource).toContain('export interface Reply');
  });

  it('Reply has id, author, contents, createdAt', () => {
    const replyStart = modelSource.indexOf('export interface Reply');
    const replyEnd = modelSource.indexOf('\n}', replyStart) + 2;
    const body = modelSource.slice(replyStart, replyEnd);
    expect(body).toContain('id:');
    expect(body).toContain('author:');
    expect(body).toContain('contents:');
    expect(body).toContain('createdAt:');
  });

  it('Annotation has optional replies array', () => {
    expect(modelSource).toContain("replies?: readonly Reply[]");
  });
});

// ---------------------------------------------------------------------------
// TauriAnnotationEngine — default status
// ---------------------------------------------------------------------------

describe('TauriAnnotationEngine — default status on load', () => {
  it('mapTauriAnnotation sets status to open by default', () => {
    const fnStart = annotationEngineSource.indexOf('function mapTauriAnnotation(');
    const fnEnd = annotationEngineSource.indexOf('\n}', fnStart) + 2;
    const body = annotationEngineSource.slice(fnStart, fnEnd);
    expect(body).toContain("status: 'open'");
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — reviewStatuses state
// ---------------------------------------------------------------------------

describe('ViewerApp — reviewStatuses state', () => {
  it("declares reviewStatuses as Map<string, 'open' | 'resolved'>", () => {
    expect(viewerAppSource).toContain("useState<Map<string, 'open' | 'resolved'>>(new Map())");
  });

  it('merges review status into comments via useMemo', () => {
    expect(viewerAppSource).toContain('reviewStatuses.get(a.id)');
  });

  it("defaults merged status to 'open'", () => {
    expect(viewerAppSource).toContain("?? 'open'");
  });

  it('defines handleToggleResolvedStatus callback', () => {
    expect(viewerAppSource).toContain('handleToggleResolvedStatus');
  });

  it('handleToggleResolvedStatus toggles open → resolved', () => {
    const fnStart = viewerAppSource.indexOf('handleToggleResolvedStatus');
    const fnBody = viewerAppSource.slice(fnStart, fnStart + 400);
    expect(fnBody).toContain("'resolved'");
    expect(fnBody).toContain("'open'");
  });

  it('passes onToggleResolved to RightContextPanel', () => {
    expect(viewerAppSource).toContain('onToggleResolved={handleToggleResolvedStatus}');
  });
});

// ---------------------------------------------------------------------------
// RightContextPanel — onToggleResolved prop
// ---------------------------------------------------------------------------

describe('RightContextPanel — onToggleResolved prop', () => {
  it('declares onToggleResolved in RightContextPanelProps', () => {
    expect(rightPanelSource).toContain('onToggleResolved?: (annotationId: string) => void');
  });

  it('passes onToggleResolved to ReviewModeContent', () => {
    expect(rightPanelSource).toContain('onToggleResolved={onToggleResolved}');
  });

  it('ReviewModeContent accepts onToggleResolved prop', () => {
    const fnStart = rightPanelSource.indexOf('function ReviewModeContent(');
    const fnEnd = rightPanelSource.indexOf('}) {', fnStart) + 4;
    const body = rightPanelSource.slice(fnStart, fnEnd);
    expect(body).toContain('onToggleResolved?');
  });
});

// ---------------------------------------------------------------------------
// RightContextPanel — resolve button in comment card
// ---------------------------------------------------------------------------

describe('RightContextPanel — resolve button', () => {
  it('renders resolve-comment-btn in each comment card', () => {
    expect(rightPanelSource).toContain('data-testid="resolve-comment-btn"');
  });

  it('calls onToggleResolved when resolve button clicked', () => {
    expect(rightPanelSource).toContain('onToggleResolved?.(comment.id)');
  });

  it('resolve button uses CheckIcon', () => {
    const btnStart = rightPanelSource.indexOf('resolve-comment-btn');
    const btnEnd = rightPanelSource.indexOf('</button>', btnStart) + 9;
    const btnBody = rightPanelSource.slice(btnStart, btnEnd);
    expect(btnBody).toContain('CheckIcon');
  });

  it('resolve button aria-label reflects resolved state', () => {
    expect(rightPanelSource).toContain("'Markeer als opgelost'");
    expect(rightPanelSource).toContain("'Markeer als open'");
  });
});

// ---------------------------------------------------------------------------
// RightContextPanel — resolved comment visual styling
// ---------------------------------------------------------------------------

describe('RightContextPanel — resolved comment styling', () => {
  it('computes isResolved from comment.status', () => {
    expect(rightPanelSource).toContain("comment.status === 'resolved'");
  });

  it('applies opacity-50 class to resolved comments', () => {
    expect(rightPanelSource).toContain('opacity-50');
  });

  it('sets data-resolved attribute on comment items', () => {
    expect(rightPanelSource).toContain('data-resolved=');
  });
});
