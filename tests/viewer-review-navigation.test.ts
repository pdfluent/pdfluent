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
// RightContextPanel — navigation button props
// ---------------------------------------------------------------------------

describe('RightContextPanel — navigation props', () => {
  it('accepts onNextComment prop', () => {
    const propsStart = rightPanelSource.indexOf('interface RightContextPanelProps');
    const propsEnd = rightPanelSource.indexOf('\n}', propsStart) + 2;
    const propsBody = rightPanelSource.slice(propsStart, propsEnd);
    expect(propsBody).toContain('onNextComment');
  });

  it('accepts onPrevComment prop', () => {
    const propsStart = rightPanelSource.indexOf('interface RightContextPanelProps');
    const propsEnd = rightPanelSource.indexOf('\n}', propsStart) + 2;
    const propsBody = rightPanelSource.slice(propsStart, propsEnd);
    expect(propsBody).toContain('onPrevComment');
  });
});

// ---------------------------------------------------------------------------
// RightContextPanel — navigation button rendering
// ---------------------------------------------------------------------------

describe('RightContextPanel — navigation buttons rendered', () => {
  it('renders prev-comment-btn', () => {
    expect(rightPanelSource).toContain('data-testid="prev-comment-btn"');
  });

  it('renders next-comment-btn', () => {
    expect(rightPanelSource).toContain('data-testid="next-comment-btn"');
  });

  it('prev-comment-btn calls onPrevComment', () => {
    const btnStart = rightPanelSource.indexOf('prev-comment-btn');
    const btnEnd = rightPanelSource.indexOf('</button>', btnStart) + 9;
    const btnBody = rightPanelSource.slice(btnStart, btnEnd);
    expect(btnBody).toContain('onPrevComment');
  });

  it('next-comment-btn calls onNextComment', () => {
    const btnStart = rightPanelSource.indexOf('next-comment-btn');
    const btnEnd = rightPanelSource.indexOf('</button>', btnStart) + 9;
    const btnBody = rightPanelSource.slice(btnStart, btnEnd);
    expect(btnBody).toContain('onNextComment');
  });

  it('nav buttons are wrapped in a comments.length > 0 guard', () => {
    const navStart = rightPanelSource.indexOf('prev-comment-btn');
    // Go back to find the conditional wrapping it
    const before = rightPanelSource.slice(Math.max(0, navStart - 200), navStart);
    expect(before).toContain('comments.length > 0');
  });

  it('prev button label contains Vorige', () => {
    const btnStart = rightPanelSource.indexOf('prev-comment-btn');
    const btnEnd = rightPanelSource.indexOf('</button>', btnStart) + 9;
    const btnBody = rightPanelSource.slice(btnStart, btnEnd);
    expect(btnBody).toContain('Vorige');
  });

  it('next button label contains Volgende', () => {
    const btnStart = rightPanelSource.indexOf('next-comment-btn');
    const btnEnd = rightPanelSource.indexOf('</button>', btnStart) + 9;
    const btnBody = rightPanelSource.slice(btnStart, btnEnd);
    expect(btnBody).toContain('Volgende');
  });
});

// ---------------------------------------------------------------------------
// RightContextPanel — ReviewModeContent receives navigation props
// ---------------------------------------------------------------------------

describe('RightContextPanel — ReviewModeContent call passes navigation props', () => {
  it('ReviewModeContent call includes onNextComment', () => {
    const callStart = rightPanelSource.indexOf('<ReviewModeContent ');
    const callEnd = rightPanelSource.indexOf('/>', callStart) + 2;
    const callBody = rightPanelSource.slice(callStart, callEnd);
    expect(callBody).toContain('onNextComment={onNextComment}');
  });

  it('ReviewModeContent call includes onPrevComment', () => {
    const callStart = rightPanelSource.indexOf('<ReviewModeContent ');
    const callEnd = rightPanelSource.indexOf('/>', callStart) + 2;
    const callBody = rightPanelSource.slice(callStart, callEnd);
    expect(callBody).toContain('onPrevComment={onPrevComment}');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — handleNextComment / handlePrevComment callbacks
// ---------------------------------------------------------------------------

describe('ViewerApp — comment navigation callbacks', () => {
  it('defines handleNextComment', () => {
    expect(viewerAppSource).toContain('handleNextComment');
  });

  it('defines handlePrevComment', () => {
    expect(viewerAppSource).toContain('handlePrevComment');
  });

  it('handleNextComment wraps around to index 0 when at last comment', () => {
    const fnStart = viewerAppSource.indexOf('handleNextComment = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('comments.length - 1');
    expect(fnBody).toContain(': 0');
  });

  it('handlePrevComment wraps around to last when at index 0', () => {
    const fnStart = viewerAppSource.indexOf('handlePrevComment = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('comments.length - 1');
    expect(fnBody).toContain('> 0');
  });

  it('handleNextComment guards on empty comments array', () => {
    const fnStart = viewerAppSource.indexOf('handleNextComment = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('comments.length === 0');
  });

  it('handlePrevComment guards on empty comments array', () => {
    const fnStart = viewerAppSource.indexOf('handlePrevComment = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('comments.length === 0');
  });

  it('passes onNextComment to RightContextPanel', () => {
    expect(viewerAppSource).toContain('onNextComment={handleNextComment}');
  });

  it('passes onPrevComment to RightContextPanel', () => {
    expect(viewerAppSource).toContain('onPrevComment={handlePrevComment}');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — keyboard shortcut for comment navigation
// ---------------------------------------------------------------------------

describe('ViewerApp — keyboard shortcut Alt+Arrow for comment jump', () => {
  it('listens for keydown event', () => {
    expect(viewerAppSource).toContain("addEventListener('keydown'");
  });

  it('checks altKey before acting', () => {
    const effectStart = viewerAppSource.indexOf('handleCommentJumpKey');
    const effectEnd = viewerAppSource.indexOf('removeEventListener', effectStart) + 50;
    const effectBody = viewerAppSource.slice(effectStart, effectEnd);
    expect(effectBody).toContain('e.altKey');
  });

  it('Alt+ArrowDown calls handleNextComment', () => {
    const effectStart = viewerAppSource.indexOf('handleCommentJumpKey');
    const effectEnd = viewerAppSource.indexOf('removeEventListener', effectStart) + 50;
    const effectBody = viewerAppSource.slice(effectStart, effectEnd);
    expect(effectBody).toContain("ArrowDown");
    expect(effectBody).toContain('handleNextComment');
  });

  it('Alt+ArrowUp calls handlePrevComment', () => {
    const effectStart = viewerAppSource.indexOf('handleCommentJumpKey');
    const effectEnd = viewerAppSource.indexOf('removeEventListener', effectStart) + 50;
    const effectBody = viewerAppSource.slice(effectStart, effectEnd);
    expect(effectBody).toContain("ArrowUp");
    expect(effectBody).toContain('handlePrevComment');
  });

  it('calls preventDefault to avoid browser scroll', () => {
    const effectStart = viewerAppSource.indexOf('handleCommentJumpKey');
    const effectEnd = viewerAppSource.indexOf('removeEventListener', effectStart) + 50;
    const effectBody = viewerAppSource.slice(effectStart, effectEnd);
    expect(effectBody).toContain('e.preventDefault');
  });

  it('removes event listener on cleanup', () => {
    const effectStart = viewerAppSource.indexOf('handleCommentJumpKey');
    const effectEnd = viewerAppSource.indexOf('removeEventListener', effectStart) + 50;
    const effectBody = viewerAppSource.slice(effectStart, effectEnd);
    expect(effectBody).toContain('removeEventListener');
  });
});
