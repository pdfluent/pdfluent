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

// ---------------------------------------------------------------------------
// ViewerApp — commentReplies state
// ---------------------------------------------------------------------------

describe('ViewerApp — commentReplies state', () => {
  it('declares commentReplies as Map<string, Reply[]>', () => {
    expect(viewerAppSource).toContain('useState<Map<string, Reply[]>>(new Map())');
  });

  it('merges commentReplies into comments via useMemo', () => {
    expect(viewerAppSource).toContain('commentReplies.get(a.id)');
  });

  it('defaults to empty array when no replies exist', () => {
    expect(viewerAppSource).toContain('?? []');
  });

  it('defines handleAddReply callback', () => {
    expect(viewerAppSource).toContain('handleAddReply');
  });

  it('handleAddReply creates a reply with unique id', () => {
    const fnStart = viewerAppSource.indexOf('handleAddReply');
    const fnBody = viewerAppSource.slice(fnStart, fnStart + 500);
    expect(fnBody).toContain('reply-');
    expect(fnBody).toContain('author');
    expect(fnBody).toContain('contents');
    expect(fnBody).toContain('createdAt: new Date()');
  });

  it('handleAddReply appends to existing reply list', () => {
    const fnStart = viewerAppSource.indexOf('handleAddReply');
    const fnBody = viewerAppSource.slice(fnStart, fnStart + 500);
    expect(fnBody).toContain('setCommentReplies');
    expect(fnBody).toContain('existing, reply');
  });

  it('defines handleDeleteReply callback', () => {
    expect(viewerAppSource).toContain('handleDeleteReply');
  });

  it('handleDeleteReply filters out the removed reply', () => {
    const fnStart = viewerAppSource.indexOf('handleDeleteReply');
    const fnBody = viewerAppSource.slice(fnStart, fnStart + 300);
    expect(fnBody).toContain('filter(r => r.id !== replyId)');
  });

  it('passes onAddReply to RightContextPanel', () => {
    expect(viewerAppSource).toContain('onAddReply={handleAddReply}');
  });

  it('passes onDeleteReply to RightContextPanel', () => {
    expect(viewerAppSource).toContain('onDeleteReply={handleDeleteReply}');
  });
});

// ---------------------------------------------------------------------------
// RightContextPanel — onAddReply / onDeleteReply props
// ---------------------------------------------------------------------------

describe('RightContextPanel — reply props', () => {
  it('declares onAddReply in RightContextPanelProps', () => {
    expect(rightPanelSource).toContain('onAddReply?:');
  });

  it('declares onDeleteReply in RightContextPanelProps', () => {
    expect(rightPanelSource).toContain('onDeleteReply?:');
  });

  it('passes onAddReply to ReviewModeContent', () => {
    expect(rightPanelSource).toContain('onAddReply={onAddReply}');
  });

  it('passes onDeleteReply to ReviewModeContent', () => {
    expect(rightPanelSource).toContain('onDeleteReply={onDeleteReply}');
  });
});

// ---------------------------------------------------------------------------
// RightContextPanel — ReplyInput component
// ---------------------------------------------------------------------------

describe('RightContextPanel — ReplyInput component', () => {
  function replyInputBody(): string {
    const fnStart = rightPanelSource.indexOf('function ReplyInput(');
    const fnEnd = rightPanelSource.indexOf('function ReviewModeContent(', fnStart);
    return rightPanelSource.slice(fnStart, fnEnd);
  }

  it('defines ReplyInput function', () => {
    expect(rightPanelSource).toContain('function ReplyInput(');
  });

  it('has reply-toggle-btn to open reply input', () => {
    expect(replyInputBody()).toContain('data-testid="reply-toggle-btn"');
  });

  it('has reply-textarea for composing reply', () => {
    expect(replyInputBody()).toContain('data-testid="reply-textarea"');
  });

  it('has reply-submit-btn', () => {
    expect(replyInputBody()).toContain('data-testid="reply-submit-btn"');
  });

  it('has reply-cancel-btn', () => {
    expect(replyInputBody()).toContain('data-testid="reply-cancel-btn"');
  });

  it('submit button is disabled when reply text is empty', () => {
    expect(replyInputBody()).toContain('disabled={!replyText.trim()}');
  });

  it('calls onAddReply with annotationId, contents, authorName on submit', () => {
    expect(replyInputBody()).toContain('onAddReply?.(annotationId,');
  });

  it('clears reply text after submit', () => {
    expect(replyInputBody()).toContain("setReplyText('')");
  });
});

// ---------------------------------------------------------------------------
// RightContextPanel — Reply thread rendering
// ---------------------------------------------------------------------------

describe('RightContextPanel — reply thread in comment card', () => {
  it('renders reply-thread container when replies exist', () => {
    expect(rightPanelSource).toContain('data-testid="reply-thread"');
  });

  it('renders reply-item for each reply', () => {
    expect(rightPanelSource).toContain('data-testid="reply-item"');
  });

  it('renders delete-reply-btn per reply', () => {
    expect(rightPanelSource).toContain('data-testid="delete-reply-btn"');
  });

  it('calls onDeleteReply when delete reply button clicked', () => {
    expect(rightPanelSource).toContain('onDeleteReply?.(comment.id, reply.id)');
  });

  it('renders ReplyInput inside each comment card', () => {
    // ReplyInput appears after the reply thread, still inside the comment card
    const replyInputIdx = rightPanelSource.indexOf('<ReplyInput');
    const commentItemIdx = rightPanelSource.lastIndexOf('data-testid="review-comment-item"', replyInputIdx);
    expect(replyInputIdx).toBeGreaterThan(commentItemIdx);
    expect(replyInputIdx).toBeGreaterThan(0);
  });
});
