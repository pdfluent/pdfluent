// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const rightPanelSource = readFileSync(
  new URL('../src/viewer/components/RightContextPanel.tsx', import.meta.url),
  'utf8'
);

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// RightContextPanel — bulk action props
// ---------------------------------------------------------------------------

describe('RightContextPanel — bulk action props', () => {
  it('interface has onResolveAll prop', () => {
    const propsStart = rightPanelSource.indexOf('interface RightContextPanelProps');
    const propsEnd = rightPanelSource.indexOf('\n}', propsStart) + 2;
    const propsBody = rightPanelSource.slice(propsStart, propsEnd);
    expect(propsBody).toContain('onResolveAll');
  });

  it('interface has onDeleteAllResolved prop', () => {
    const propsStart = rightPanelSource.indexOf('interface RightContextPanelProps');
    const propsEnd = rightPanelSource.indexOf('\n}', propsStart) + 2;
    const propsBody = rightPanelSource.slice(propsStart, propsEnd);
    expect(propsBody).toContain('onDeleteAllResolved');
  });
});

// ---------------------------------------------------------------------------
// RightContextPanel — bulk action buttons
// ---------------------------------------------------------------------------

describe('RightContextPanel — resolve-all button', () => {
  it('renders resolve-all-btn', () => {
    expect(rightPanelSource).toContain('data-testid="resolve-all-btn"');
  });

  it('resolve-all-btn calls onResolveAll', () => {
    const btnStart = rightPanelSource.indexOf('resolve-all-btn');
    const btnEnd = rightPanelSource.indexOf('</button>', btnStart) + 9;
    const btnBody = rightPanelSource.slice(btnStart, btnEnd);
    expect(btnBody).toContain('onResolveAll');
  });

  it('resolve-all-btn disabled when no comments', () => {
    const btnStart = rightPanelSource.indexOf('resolve-all-btn');
    const btnEnd = rightPanelSource.indexOf('</button>', btnStart) + 9;
    const btnBody = rightPanelSource.slice(btnStart, btnEnd);
    expect(btnBody).toContain('disabled');
    expect(btnBody).toContain('comments.length === 0');
  });

  it('resolve-all-btn has Alles oplossen label', () => {
    const btnStart = rightPanelSource.indexOf('resolve-all-btn');
    const btnEnd = rightPanelSource.indexOf('</button>', btnStart) + 9;
    const btnBody = rightPanelSource.slice(btnStart, btnEnd);
    expect(btnBody).toContain('Alles oplossen');
  });
});

describe('RightContextPanel — delete-resolved button', () => {
  it('renders delete-resolved-btn', () => {
    expect(rightPanelSource).toContain('data-testid="delete-resolved-btn"');
  });

  it('delete-resolved-btn calls onDeleteAllResolved', () => {
    const btnStart = rightPanelSource.indexOf('delete-resolved-btn');
    const btnEnd = rightPanelSource.indexOf('</button>', btnStart) + 9;
    const btnBody = rightPanelSource.slice(btnStart, btnEnd);
    expect(btnBody).toContain('onDeleteAllResolved');
  });

  it('delete-resolved-btn is disabled when no resolved comments', () => {
    const btnStart = rightPanelSource.indexOf('delete-resolved-btn');
    const btnEnd = rightPanelSource.indexOf('</button>', btnStart) + 9;
    const btnBody = rightPanelSource.slice(btnStart, btnEnd);
    expect(btnBody).toContain('disabled');
    expect(btnBody).toContain('resolved');
  });

  it('delete-resolved-btn bulk section is guarded by comments.length > 0', () => {
    const bulkStart = rightPanelSource.indexOf('resolve-all-btn');
    // Go back to find the conditional wrapping it
    const before = rightPanelSource.slice(Math.max(0, bulkStart - 200), bulkStart);
    expect(before).toContain('comments.length > 0');
  });
});

// ---------------------------------------------------------------------------
// RightContextPanel — ReviewModeContent call passes bulk props
// ---------------------------------------------------------------------------

describe('RightContextPanel — ReviewModeContent call passes bulk props', () => {
  it('ReviewModeContent call includes onResolveAll', () => {
    const callStart = rightPanelSource.indexOf('<ReviewModeContent ');
    const callEnd = rightPanelSource.indexOf('/>', callStart) + 2;
    const callBody = rightPanelSource.slice(callStart, callEnd);
    expect(callBody).toContain('onResolveAll={onResolveAll}');
  });

  it('ReviewModeContent call includes onDeleteAllResolved', () => {
    const callStart = rightPanelSource.indexOf('<ReviewModeContent ');
    const callEnd = rightPanelSource.indexOf('/>', callStart) + 2;
    const callBody = rightPanelSource.slice(callStart, callEnd);
    expect(callBody).toContain('onDeleteAllResolved={onDeleteAllResolved}');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — handleResolveAll / handleDeleteAllResolved callbacks
// ---------------------------------------------------------------------------

describe('ViewerApp — bulk action callbacks', () => {
  it('defines handleResolveAll', () => {
    expect(viewerAppSource).toContain('handleResolveAll');
  });

  it('defines handleDeleteAllResolved', () => {
    expect(viewerAppSource).toContain('handleDeleteAllResolved');
  });

  it('handleResolveAll sets all annotations to resolved', () => {
    const fnStart = viewerAppSource.indexOf('handleResolveAll = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("'resolved'");
    expect(fnBody).toContain('setReviewStatuses');
  });

  it('handleDeleteAllResolved filters out resolved annotations', () => {
    const fnStart = viewerAppSource.indexOf('handleDeleteAllResolved = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('resolved');
    expect(fnBody).toContain('setAllAnnotations');
  });

  it('passes onResolveAll to RightContextPanel', () => {
    expect(viewerAppSource).toContain('onResolveAll={handleResolveAll}');
  });

  it('passes onDeleteAllResolved to RightContextPanel', () => {
    expect(viewerAppSource).toContain('onDeleteAllResolved={handleDeleteAllResolved}');
  });
});
