// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const toolbarSource = readFileSync(
  new URL('../src/viewer/components/ModeToolbar.tsx', import.meta.url),
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

const panelSource = readFileSync(
  new URL('../src/viewer/components/RightContextPanel.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// Locate the comment-nav block in ModeToolbar for scoped assertions
// ---------------------------------------------------------------------------

const navBlockStart = toolbarSource.indexOf('data-testid="comment-nav"');
const navBlockEnd   = toolbarSource.indexOf('</div>\n        </>\n      )}', navBlockStart) + 30;
const navBlock      = toolbarSource.slice(navBlockStart, navBlockEnd);

// ---------------------------------------------------------------------------
// Control rendering in review mode
// ---------------------------------------------------------------------------

describe('ModeToolbar — comment nav: rendering', () => {
  it('renders comment-nav block only in review mode', () => {
    expect(toolbarSource).toContain("mode === 'review' && comments.length > 0");
  });

  it('renders data-testid="comment-nav"', () => {
    expect(toolbarSource).toContain('data-testid="comment-nav"');
  });

  it('renders comment-prev-btn', () => {
    expect(toolbarSource).toContain('data-testid="comment-prev-btn"');
  });

  it('renders comment-next-btn', () => {
    expect(toolbarSource).toContain('data-testid="comment-next-btn"');
  });

  it('renders comment-nav-counter', () => {
    expect(toolbarSource).toContain('data-testid="comment-nav-counter"');
  });

  it('shows formatted counter — / n when no comment selected (activeCommentIdx < 0)', () => {
    expect(toolbarSource).toContain('`— / ${comments.length}`');
  });

  it('shows formatted counter idx+1 / n when a comment is selected', () => {
    expect(toolbarSource).toContain('`${activeCommentIdx + 1} / ${comments.length}`');
  });

  it('shows author and page hint when a comment is active', () => {
    expect(toolbarSource).toContain('comments[activeCommentIdx]?.author');
    expect(toolbarSource).toContain('comments[activeCommentIdx]?.pageIndex');
  });

  it('imports Annotation type from core/document', () => {
    expect(toolbarSource).toContain('Annotation');
    expect(toolbarSource).toContain("from '../../core/document'");
  });

  it('declares comments prop as Annotation[]', () => {
    expect(toolbarSource).toContain('comments: Annotation[]');
  });

  it('declares activeCommentIdx prop as number', () => {
    expect(toolbarSource).toContain('activeCommentIdx: number');
  });

  it('declares onCommentNav prop', () => {
    expect(toolbarSource).toContain('onCommentNav: (idx: number) => void');
  });
});

// ---------------------------------------------------------------------------
// Disabled states at bounds
// ---------------------------------------------------------------------------

describe('ModeToolbar — comment nav: disabled states', () => {
  it('prev button is disabled when activeCommentIdx <= 0', () => {
    // Scoped to the comment-nav block — the disabled condition appears there
    expect(navBlock).toContain('disabled={activeCommentIdx <= 0}');
  });

  it('next button is disabled when at end of list', () => {
    expect(navBlock).toContain('disabled={comments.length === 0 || activeCommentIdx >= comments.length - 1}');
  });
});

// ---------------------------------------------------------------------------
// Navigation click handlers
// ---------------------------------------------------------------------------

describe('ModeToolbar — comment nav: click handlers', () => {
  it('prev button calls onCommentNav with idx - 1 (clamped to 0)', () => {
    expect(navBlock).toContain('onCommentNav(Math.max(0, activeCommentIdx - 1))');
  });

  it('next button calls onCommentNav(0) when no comment selected (activeCommentIdx < 0)', () => {
    expect(navBlock).toContain('activeCommentIdx < 0 ? 0 :');
  });

  it('next button calls onCommentNav with idx + 1 (clamped to last)', () => {
    expect(navBlock).toContain('Math.min(comments.length - 1, activeCommentIdx + 1)');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — handleCommentNav wiring
// ---------------------------------------------------------------------------

// Locate handleCommentNav body for scoped assertions
const navFnStart = viewerAppSource.indexOf('handleCommentNav');
const navFnEnd   = viewerAppSource.indexOf('}, [comments]);', navFnStart) + 14;
const navFnBody  = viewerAppSource.slice(navFnStart, navFnEnd);

describe('ViewerApp — comment nav: handleCommentNav', () => {
  it('defines handleCommentNav with useCallback', () => {
    expect(viewerAppSource).toContain('handleCommentNav');
    expect(viewerAppSource).toContain('useCallback');
  });

  it('calls setActiveCommentIdx(idx)', () => {
    expect(navFnBody).toContain('setActiveCommentIdx(idx)');
  });

  it('jumps to the comment page via setPageIndex', () => {
    expect(navFnBody).toContain('setPageIndex(');
    expect(navFnBody).toContain('comments[idx]');
    expect(navFnBody).toContain('.pageIndex');
  });

  it('depends on [comments]', () => {
    expect(navFnBody).toContain('}, [comments])');
  });

  it('guards against out-of-bounds idx before calling setPageIndex', () => {
    expect(navFnBody).toContain('idx >= 0 && idx < comments.length');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — state and wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — comment nav: state', () => {
  it('declares activeCommentIdx state initialized to -1', () => {
    expect(viewerAppSource).toContain('activeCommentIdx, setActiveCommentIdx] = useState(-1)');
  });

  it('resets activeCommentIdx to -1 when a new document loads', () => {
    expect(viewerAppSource).toContain('setActiveCommentIdx(-1)');
  });

  it('passes comments to ModeToolbar', () => {
    const toolbarBlock = viewerAppSource.slice(
      viewerAppSource.indexOf('<ModeToolbar'),
      viewerAppSource.indexOf('/>', viewerAppSource.indexOf('<ModeToolbar')) + 2
    );
    expect(toolbarBlock).toContain('comments={comments}');
  });

  it('passes activeCommentIdx to ModeToolbar', () => {
    const toolbarBlock = viewerAppSource.slice(
      viewerAppSource.indexOf('<ModeToolbar'),
      viewerAppSource.indexOf('/>', viewerAppSource.indexOf('<ModeToolbar')) + 2
    );
    expect(toolbarBlock).toContain('activeCommentIdx={activeCommentIdx}');
  });

  it('passes onCommentNav={handleCommentNav} to ModeToolbar', () => {
    const toolbarBlock = viewerAppSource.slice(
      viewerAppSource.indexOf('<ModeToolbar'),
      viewerAppSource.indexOf('/>', viewerAppSource.indexOf('<ModeToolbar')) + 2
    );
    expect(toolbarBlock).toContain('onCommentNav={handleCommentNav}');
  });
});

// ---------------------------------------------------------------------------
// Stable comment ordering (sort by pageIndex ascending)
// ---------------------------------------------------------------------------

describe('ViewerApp — comment nav: stable ordering', () => {
  it('sorts comments by pageIndex ascending when loading', () => {
    expect(viewerAppSource).toContain('.sort((a, b) => a.pageIndex - b.pageIndex)');
  });

  it('filters to text annotations only', () => {
    expect(viewerAppSource).toContain("a.type === 'text'");
  });
});

// ---------------------------------------------------------------------------
// No regressions — RightContextPanel still renders review content
// ---------------------------------------------------------------------------

describe('RightContextPanel — comment nav: no regressions', () => {
  it('ReviewModeContent still exists', () => {
    expect(panelSource).toContain('function ReviewModeContent');
  });

  it('review mode section still renders in RightContextPanel', () => {
    expect(panelSource).toContain("mode === 'review'");
    expect(panelSource).toContain('ReviewModeContent');
  });

  it('group headings still rendered with review-comment-group-heading testid', () => {
    expect(panelSource).toContain('data-testid="review-comment-group-heading"');
  });
});

// ---------------------------------------------------------------------------
// No regressions — existing ModeToolbar features intact
// ---------------------------------------------------------------------------

describe('ModeToolbar — comment nav: no regressions', () => {
  it('read mode zoom display still present', () => {
    expect(toolbarSource).toContain("mode === 'read'");
    expect(toolbarSource).toContain('data-testid="toolbar-zoom-display"');
  });

  it('organize mode delete/rotate still wired', () => {
    expect(toolbarSource).toContain('handleDeletePage');
    expect(toolbarSource).toContain('handleRotatePage');
  });

  it('ToolGroup still rendered for all mode tools', () => {
    expect(toolbarSource).toContain('ToolGroup');
    expect(toolbarSource).toContain('TOOLS_BY_MODE');
  });
});
