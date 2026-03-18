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

const viewerAppSource = [
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
].map(p => readFileSync(new URL(p, import.meta.url), 'utf8')).join('\n\n');

const modelSource = readFileSync(
  new URL('../src/core/document/model.ts', import.meta.url),
  'utf8'
);

const coreIndexSource = readFileSync(
  new URL('../src/core/document/index.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// model.ts — types are correct
// ---------------------------------------------------------------------------

describe('model.ts — review types', () => {
  it('Annotation has status field', () => {
    expect(modelSource).toContain("status?: 'open' | 'resolved'");
  });

  it('Annotation has replies field', () => {
    expect(modelSource).toContain('replies?:');
  });

  it('Reply interface has id, author, contents, createdAt', () => {
    const replyStart = modelSource.indexOf('interface Reply');
    const replyEnd = modelSource.indexOf('\n}', replyStart) + 2;
    const replyBody = modelSource.slice(replyStart, replyEnd);
    expect(replyBody).toContain('id:');
    expect(replyBody).toContain('author:');
    expect(replyBody).toContain('contents:');
    expect(replyBody).toContain('createdAt:');
  });

  it('Reply fields are all readonly', () => {
    const replyStart = modelSource.indexOf('interface Reply');
    const replyEnd = modelSource.indexOf('\n}', replyStart) + 2;
    const replyBody = modelSource.slice(replyStart, replyEnd);
    const lines = replyBody.split('\n').filter(l => l.includes(':') && !l.includes('interface'));
    for (const line of lines) {
      expect(line).toContain('readonly');
    }
  });
});

// ---------------------------------------------------------------------------
// core/document/index.ts — Reply is re-exported
// ---------------------------------------------------------------------------

describe('core/document/index.ts — exports', () => {
  it('exports Reply type', () => {
    expect(coreIndexSource).toContain('Reply');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — review state is initialized correctly
// ---------------------------------------------------------------------------

describe('ViewerApp — review state initialization', () => {
  it('reviewStatuses initialized as empty Map', () => {
    expect(viewerAppSource).toContain('reviewStatuses');
    expect(viewerAppSource).toContain("Map<string, 'open' | 'resolved'>");
  });

  it('commentReplies initialized as empty Map', () => {
    expect(viewerAppSource).toContain('commentReplies');
    expect(viewerAppSource).toContain('Map<string, Reply[]>');
  });

  it('comments useMemo merges status from reviewStatuses', () => {
    expect(viewerAppSource).toContain('reviewStatuses.get(a.id)');
  });

  it('comments useMemo merges replies from commentReplies', () => {
    expect(viewerAppSource).toContain('commentReplies.get(a.id)');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — all review callbacks are defined
// ---------------------------------------------------------------------------

describe('ViewerApp — review callbacks present', () => {
  it('has handleToggleResolvedStatus', () => {
    expect(viewerAppSource).toContain('handleToggleResolvedStatus');
  });

  it('has handleAddReply', () => {
    expect(viewerAppSource).toContain('handleAddReply');
  });

  it('has handleDeleteReply', () => {
    expect(viewerAppSource).toContain('handleDeleteReply');
  });

  it('has handleNextComment', () => {
    expect(viewerAppSource).toContain('handleNextComment');
  });

  it('has handlePrevComment', () => {
    expect(viewerAppSource).toContain('handlePrevComment');
  });

  it('has handleResolveAll', () => {
    expect(viewerAppSource).toContain('handleResolveAll');
  });

  it('has handleDeleteAllResolved', () => {
    expect(viewerAppSource).toContain('handleDeleteAllResolved');
  });
});

// ---------------------------------------------------------------------------
// RightContextPanel — all review UI elements present
// ---------------------------------------------------------------------------

describe('RightContextPanel — review UI elements', () => {
  it('has resolve-comment-btn', () => {
    expect(rightPanelSource).toContain('data-testid="resolve-comment-btn"');
  });

  it('has reply-toggle-btn', () => {
    expect(rightPanelSource).toContain('data-testid="reply-toggle-btn"');
  });

  it('has reply-submit-btn', () => {
    expect(rightPanelSource).toContain('data-testid="reply-submit-btn"');
  });

  it('has comment-filter-author select', () => {
    expect(rightPanelSource).toContain('data-testid="comment-filter-author"');
  });

  it('has comment-filter-status select', () => {
    expect(rightPanelSource).toContain('data-testid="comment-filter-status"');
  });

  it('has comment-filter-clear button', () => {
    expect(rightPanelSource).toContain('data-testid="comment-filter-clear"');
  });

  it('has prev-comment-btn', () => {
    expect(rightPanelSource).toContain('data-testid="prev-comment-btn"');
  });

  it('has next-comment-btn', () => {
    expect(rightPanelSource).toContain('data-testid="next-comment-btn"');
  });

  it('has export-review-md-btn', () => {
    expect(rightPanelSource).toContain('data-testid="export-review-md-btn"');
  });

  it('has export-review-json-btn', () => {
    expect(rightPanelSource).toContain('data-testid="export-review-json-btn"');
  });

  it('has resolve-all-btn', () => {
    expect(rightPanelSource).toContain('data-testid="resolve-all-btn"');
  });

  it('has delete-resolved-btn', () => {
    expect(rightPanelSource).toContain('data-testid="delete-resolved-btn"');
  });

  it('has my-comments-filter-btn', () => {
    expect(rightPanelSource).toContain('data-testid="my-comments-filter-btn"');
  });

  it('comment card has data-resolved attribute', () => {
    expect(rightPanelSource).toContain('data-resolved=');
  });

  it('reply-thread is rendered inside comment cards', () => {
    expect(rightPanelSource).toContain('data-testid="reply-thread"');
  });
});
