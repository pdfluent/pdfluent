// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

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

const toolbarSource = readFileSync(
  new URL('../src/viewer/components/ModeToolbar.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// Page index never exceeds pageCount
// ---------------------------------------------------------------------------

describe('ViewerApp — stability: pageIndex clamp effect', () => {
  it('has a useEffect that clamps pageIndex when pageCount changes', () => {
    expect(viewerAppSource).toContain('setPageIndex(prev => Math.min(prev, pageCount - 1))');
  });

  it('clamp effect guards against pageCount <= 0', () => {
    const clampPos = viewerAppSource.indexOf('setPageIndex(prev => Math.min(prev, pageCount - 1))');
    const effectStart = viewerAppSource.lastIndexOf('useEffect(', clampPos);
    const effectBody = viewerAppSource.slice(effectStart, clampPos + 50);
    expect(effectBody).toContain('pageCount <= 0');
  });

  it('clamp effect depends on [pageCount]', () => {
    const clampPos = viewerAppSource.indexOf('setPageIndex(prev => Math.min(prev, pageCount - 1))');
    const effectClose = viewerAppSource.indexOf('}, [pageCount])', clampPos);
    expect(effectClose).toBeGreaterThan(clampPos);
  });

  it('handlePageMutation also clamps pageIndex after page mutations', () => {
    const mutationStart = viewerAppSource.indexOf('handlePageMutation');
    const clampInMutation = viewerAppSource.indexOf('Math.min(prev, Math.max(0, newPageCount - 1))', mutationStart);
    expect(clampInMutation).toBeGreaterThan(mutationStart);
  });
});

// ---------------------------------------------------------------------------
// Annotation navigation clamps correctly (ModeToolbar)
// ---------------------------------------------------------------------------

describe('ModeToolbar — stability: comment nav clamping', () => {
  it('prev-comment button clamps to 0', () => {
    const prevBtnPos = toolbarSource.indexOf('comment-prev-btn');
    const btnStart = toolbarSource.lastIndexOf('<button', prevBtnPos);
    const btnEnd = toolbarSource.indexOf('</button>', btnStart) + 9;
    const btnBlock = toolbarSource.slice(btnStart, btnEnd);
    expect(btnBlock).toContain('Math.max(0, activeCommentIdx - 1)');
  });

  it('next-comment button clamps to comments.length - 1', () => {
    const nextBtnPos = toolbarSource.indexOf('comment-next-btn');
    const btnStart = toolbarSource.lastIndexOf('<button', nextBtnPos);
    const btnEnd = toolbarSource.indexOf('</button>', btnStart) + 9;
    const btnBlock = toolbarSource.slice(btnStart, btnEnd);
    expect(btnBlock).toContain('Math.min(comments.length - 1, activeCommentIdx + 1)');
  });

  it('next-comment button handles no-selection case (activeCommentIdx < 0)', () => {
    expect(toolbarSource).toContain('activeCommentIdx < 0 ? 0 :');
  });
});

// ---------------------------------------------------------------------------
// Form field navigation clamps correctly (ModeToolbar)
// ---------------------------------------------------------------------------

describe('ModeToolbar — stability: field nav clamping', () => {
  it('prev-field button clamps to 0', () => {
    const prevBtnPos = toolbarSource.indexOf('field-prev-btn');
    const btnStart = toolbarSource.lastIndexOf('<button', prevBtnPos);
    const btnEnd = toolbarSource.indexOf('</button>', btnStart) + 9;
    const btnBlock = toolbarSource.slice(btnStart, btnEnd);
    expect(btnBlock).toContain('Math.max(0, activeFieldIdx - 1)');
  });

  it('next-field button clamps to formFields.length - 1', () => {
    const nextBtnPos = toolbarSource.indexOf('field-next-btn');
    const btnStart = toolbarSource.lastIndexOf('<button', nextBtnPos);
    const btnEnd = toolbarSource.indexOf('</button>', btnStart) + 9;
    const btnBlock = toolbarSource.slice(btnStart, btnEnd);
    expect(btnBlock).toContain('Math.min(formFields.length - 1, activeFieldIdx + 1)');
  });

  it('next-field button handles no-selection case (activeFieldIdx < 0)', () => {
    expect(toolbarSource).toContain('activeFieldIdx < 0 ? 0 :');
  });
});

// ---------------------------------------------------------------------------
// No regressions
// ---------------------------------------------------------------------------

describe('ViewerApp — stability pass: no regressions', () => {
  it('keyboard nav ArrowRight still clamps at pageCount - 1', () => {
    expect(viewerAppSource).toContain("case 'ArrowRight'");
    expect(viewerAppSource).toContain('Math.min(pageCount - 1, i + 1)');
  });

  it('keyboard nav ArrowLeft still clamps at 0', () => {
    expect(viewerAppSource).toContain("case 'ArrowLeft'");
    expect(viewerAppSource).toContain('Math.max(0, i - 1)');
  });

  it('handleFieldNav still guards idx bounds before setPageIndex', () => {
    expect(viewerAppSource).toContain('idx >= 0 && idx < formFields.length');
  });

  it('handleCommentNav still guards idx bounds before setPageIndex', () => {
    expect(viewerAppSource).toContain('idx >= 0 && idx < comments.length');
  });
});
