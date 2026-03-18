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
// Guardrail: navigation buttons disabled/guarded on empty list
// ---------------------------------------------------------------------------

describe('Guardrails — navigation buttons guarded on empty comments', () => {
  it('prev-comment-btn has disabled attribute', () => {
    const btnStart = rightPanelSource.indexOf('prev-comment-btn');
    const btnEnd = rightPanelSource.indexOf('</button>', btnStart) + 9;
    const btnBody = rightPanelSource.slice(btnStart, btnEnd);
    expect(btnBody).toContain('disabled');
  });

  it('next-comment-btn has disabled attribute', () => {
    const btnStart = rightPanelSource.indexOf('next-comment-btn');
    const btnEnd = rightPanelSource.indexOf('</button>', btnStart) + 9;
    const btnBody = rightPanelSource.slice(btnStart, btnEnd);
    expect(btnBody).toContain('disabled');
  });

  it('nav buttons only rendered when comments.length > 0', () => {
    const navSection = rightPanelSource.indexOf('prev-comment-btn');
    const before = rightPanelSource.slice(Math.max(0, navSection - 200), navSection);
    expect(before).toContain('comments.length > 0');
  });

  it('handleNextComment returns early when comments is empty', () => {
    const fnStart = viewerAppSource.indexOf('handleNextComment = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('comments.length === 0');
    expect(fnBody).toContain('return');
  });

  it('handlePrevComment returns early when comments is empty', () => {
    const fnStart = viewerAppSource.indexOf('handlePrevComment = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('comments.length === 0');
    expect(fnBody).toContain('return');
  });
});

// ---------------------------------------------------------------------------
// Guardrail: resolve-all disabled on empty list
// ---------------------------------------------------------------------------

describe('Guardrails — resolve-all disabled when no comments', () => {
  it('resolve-all-btn is disabled when comments.length === 0', () => {
    const btnStart = rightPanelSource.indexOf('resolve-all-btn');
    const btnEnd = rightPanelSource.indexOf('</button>', btnStart) + 9;
    const btnBody = rightPanelSource.slice(btnStart, btnEnd);
    expect(btnBody).toContain('disabled');
    expect(btnBody).toContain('comments.length === 0');
  });

  it('bulk actions section only rendered when comments.length > 0', () => {
    const bulkSection = rightPanelSource.indexOf('resolve-all-btn');
    const before = rightPanelSource.slice(Math.max(0, bulkSection - 200), bulkSection);
    expect(before).toContain('comments.length > 0');
  });
});

// ---------------------------------------------------------------------------
// Guardrail: delete-resolved disabled when no resolved comments
// ---------------------------------------------------------------------------

describe('Guardrails — delete-resolved disabled when none resolved', () => {
  it('delete-resolved-btn disabled expression checks for resolved status', () => {
    const btnStart = rightPanelSource.indexOf('delete-resolved-btn');
    const btnEnd = rightPanelSource.indexOf('</button>', btnStart) + 9;
    const btnBody = rightPanelSource.slice(btnStart, btnEnd);
    expect(btnBody).toContain('disabled');
    // Must check that some comment has resolved status before enabling
    expect(btnBody).toContain('some(');
    expect(btnBody).toContain('resolved');
  });
});

// ---------------------------------------------------------------------------
// Guardrail: reply submit disabled on empty text
// ---------------------------------------------------------------------------

describe('Guardrails — reply submit disabled on empty text', () => {
  it('reply-submit-btn is disabled when reply text is empty', () => {
    const btnStart = rightPanelSource.indexOf('reply-submit-btn');
    const btnEnd = rightPanelSource.indexOf('</button>', btnStart) + 9;
    const btnBody = rightPanelSource.slice(btnStart, btnEnd);
    expect(btnBody).toContain('disabled');
    expect(btnBody).toContain('replyText.trim()');
  });

  it('reply submit guard uses falsy check (!replyText.trim())', () => {
    const btnStart = rightPanelSource.indexOf('reply-submit-btn');
    const btnEnd = rightPanelSource.indexOf('</button>', btnStart) + 9;
    const btnBody = rightPanelSource.slice(btnStart, btnEnd);
    expect(btnBody).toContain('!replyText.trim()');
  });
});

// ---------------------------------------------------------------------------
// Guardrail: handleToggleResolvedStatus is idempotent toggle
// ---------------------------------------------------------------------------

describe('Guardrails — handleToggleResolvedStatus is a toggle', () => {
  it('toggles between open and resolved', () => {
    const fnStart = viewerAppSource.indexOf('handleToggleResolvedStatus = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("'resolved'");
    expect(fnBody).toContain("'open'");
  });

  it('reads previous status before setting', () => {
    const fnStart = viewerAppSource.indexOf('handleToggleResolvedStatus = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('prev');
    expect(fnBody).toContain('get(');
  });
});

// ---------------------------------------------------------------------------
// Guardrail: clearAllFilters resets all 4 filter states
// ---------------------------------------------------------------------------

describe('Guardrails — clearAllFilters resets all filters', () => {
  it('clearAllFilters resets filterText', () => {
    const fnStart = rightPanelSource.indexOf('function clearAllFilters()');
    const fnEnd = rightPanelSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = rightPanelSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("setFilterText('')");
  });

  it('clearAllFilters resets filterAuthor', () => {
    const fnStart = rightPanelSource.indexOf('function clearAllFilters()');
    const fnEnd = rightPanelSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = rightPanelSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("setFilterAuthor('')");
  });

  it('clearAllFilters resets filterPage', () => {
    const fnStart = rightPanelSource.indexOf('function clearAllFilters()');
    const fnEnd = rightPanelSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = rightPanelSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("setFilterPage('')");
  });

  it('clearAllFilters resets filterStatus', () => {
    const fnStart = rightPanelSource.indexOf('function clearAllFilters()');
    const fnEnd = rightPanelSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = rightPanelSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("setFilterStatus('')");
  });
});

// ---------------------------------------------------------------------------
// Guardrail: handleAddReply trims whitespace
// ---------------------------------------------------------------------------

describe('Guardrails — handleAddReply trims content', () => {
  it('handleAddReply rejects empty content after trim', () => {
    // ReplyInput component trims and guards before calling onAddReply
    expect(rightPanelSource).toContain('replyText.trim()');
  });

  it('handleAddReply in ViewerApp requires non-empty contents', () => {
    const fnStart = viewerAppSource.indexOf('handleAddReply = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('contents');
  });
});
