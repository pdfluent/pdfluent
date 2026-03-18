// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Text Draft Commit Pipeline — Phase 4 Batch 3
 *
 * Verifies the wiring between commitDraft() and the mutation support layer:
 * - Writable targets produce mutation-pending with success=true
 * - Non-writable digital targets produce non-writable-structure with success=false
 * - OCR targets cannot start a draft (editability gate blocks before commit)
 * - Multi-line targets produce non-writable-structure at commit time
 * - Multi-span targets produce non-writable-structure at commit time
 * - No-change commits always short-circuit to no-change regardless of writability
 * - commitDraft state after mutation-pending is 'committed' (not idle)
 * - commitDraft state after non-writable-structure is 'committed' (not error)
 * - The error center factory makeTextMutationError is defined and typed correctly
 * - ViewerApp wires handleDraftCommit as an async callback
 * - ViewerApp imports getTauriTextMutationEngine for mutation dispatch
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  startDraft,
  updateDraft,
  commitDraft,
  createIdleDraftState,
} from '../src/viewer/text/textDraftPipeline';
import type { TextParagraphTarget } from '../src/viewer/text/textInteractionModel';

const __dir = dirname(fileURLToPath(import.meta.url));

const viewerAppSrc = [
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
].map(p => readFileSync(join(__dir, p), 'utf8')).join('\n\n');
const errorCenterSrc = readFileSync(join(__dir, '../src/viewer/state/errorCenter.ts'), 'utf8');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Single-line, single-span digital paragraph — writable in Phase 4 */
function makeWritableParagraph(text = 'Hello world'): TextParagraphTarget {
  return {
    id: 'p0:par0',
    pageIndex: 0,
    source: 'digital',
    rect: { x: 10, y: 700, width: 200, height: 14 },
    lines: [
      {
        id: 'p0:l0',
        pageIndex: 0,
        source: 'digital',
        rect: { x: 10, y: 700, width: 200, height: 14 },
        spans: [
          {
            id: 'p0:s0',
            pageIndex: 0,
            source: 'digital',
            rect: { x: 10, y: 700, width: 200, height: 14 },
            text,
            fontSize: 12,
          },
        ],
      },
    ],
  };
}

/** Two-line digital paragraph — non-writable (multi-line) */
function makeMultiLineParagraph(): TextParagraphTarget {
  const line = {
    id: 'p0:l0',
    pageIndex: 0,
    source: 'digital' as const,
    rect: { x: 10, y: 700, width: 200, height: 14 },
    spans: [
      {
        id: 'p0:s0',
        pageIndex: 0,
        source: 'digital' as const,
        rect: { x: 10, y: 700, width: 200, height: 14 },
        text: 'Line text',
        fontSize: 12,
      },
    ],
  };
  return {
    id: 'p0:par0',
    pageIndex: 0,
    source: 'digital',
    rect: { x: 10, y: 700, width: 200, height: 28 },
    lines: [
      { ...line, id: 'p0:l0' },
      { ...line, id: 'p0:l1' },
    ],
  };
}

/** Single-line, two-span digital paragraph — non-writable (multi-span) */
function makeMultiSpanParagraph(): TextParagraphTarget {
  return {
    id: 'p0:par0',
    pageIndex: 0,
    source: 'digital',
    rect: { x: 10, y: 700, width: 200, height: 14 },
    lines: [
      {
        id: 'p0:l0',
        pageIndex: 0,
        source: 'digital',
        rect: { x: 10, y: 700, width: 200, height: 14 },
        spans: [
          {
            id: 'p0:s0',
            pageIndex: 0,
            source: 'digital',
            rect: { x: 10, y: 700, width: 100, height: 14 },
            text: 'Bold part',
            fontSize: 12,
          },
          {
            id: 'p0:s1',
            pageIndex: 0,
            source: 'digital',
            rect: { x: 110, y: 700, width: 90, height: 14 },
            text: ' regular part',
            fontSize: 12,
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// commitDraft — writable target (single-line, single-span digital)
// ---------------------------------------------------------------------------

describe('commitDraft — writable target', () => {
  it('returns success=true for writable target with changed text', () => {
    const state = startDraft(makeWritableParagraph(), 'Hello world', 'edit', null)!;
    const modified = updateDraft(state, 'Hi world');
    const [, result] = commitDraft(modified, 'edit', null);
    expect(result.success).toBe(true);
  });

  it('returns reason=mutation-pending for writable target', () => {
    const state = startDraft(makeWritableParagraph(), 'Hello world', 'edit', null)!;
    const modified = updateDraft(state, 'Hi world');
    const [, result] = commitDraft(modified, 'edit', null);
    expect(result.reason).toBe('mutation-pending');
  });

  it('transitions state to committed after mutation-pending', () => {
    const state = startDraft(makeWritableParagraph(), 'Hello world', 'edit', null)!;
    const modified = updateDraft(state, 'Hi world');
    const [newState] = commitDraft(modified, 'edit', null);
    expect(newState.status).toBe('committed');
  });

  it('preserves draftText in committed state', () => {
    const state = startDraft(makeWritableParagraph(), 'Hello world', 'edit', null)!;
    const modified = updateDraft(state, 'Hi world');
    const [newState] = commitDraft(modified, 'edit', null);
    expect(newState.draftText).toBe('Hi world');
  });

  it('message is a non-empty string', () => {
    const state = startDraft(makeWritableParagraph(), 'Hello world', 'edit', null)!;
    const modified = updateDraft(state, 'Hi world');
    const [, result] = commitDraft(modified, 'edit', null);
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('no-change commit short-circuits to no-change (not mutation-pending)', () => {
    const state = startDraft(makeWritableParagraph(), 'Hello world', 'edit', null)!;
    // Do not call updateDraft — text is unchanged
    const [newState, result] = commitDraft(state, 'edit', null);
    expect(result.reason).toBe('no-change');
    expect(result.success).toBe(true);
    expect(newState.status).toBe('idle');
  });

  it('no-change commit returns idle state even for writable target', () => {
    const state = startDraft(makeWritableParagraph(), 'Hello world', 'edit', null)!;
    const [newState] = commitDraft(state, 'edit', null);
    expect(newState.status).toBe('idle');
  });
});

// ---------------------------------------------------------------------------
// commitDraft — non-writable digital target (multi-line)
// ---------------------------------------------------------------------------

describe('commitDraft — non-writable multi-line target', () => {
  it('returns success=false', () => {
    const state = startDraft(makeMultiLineParagraph(), 'Line text', 'edit', null)!;
    const modified = updateDraft(state, 'New text');
    const [, result] = commitDraft(modified, 'edit', null);
    expect(result.success).toBe(false);
  });

  it('returns reason=non-writable-structure', () => {
    const state = startDraft(makeMultiLineParagraph(), 'Line text', 'edit', null)!;
    const modified = updateDraft(state, 'New text');
    const [, result] = commitDraft(modified, 'edit', null);
    expect(result.reason).toBe('non-writable-structure');
  });

  it('transitions to committed state (not error) for non-writable', () => {
    const state = startDraft(makeMultiLineParagraph(), 'Line text', 'edit', null)!;
    const modified = updateDraft(state, 'New text');
    const [newState] = commitDraft(modified, 'edit', null);
    expect(newState.status).toBe('committed');
  });

  it('message is non-empty for non-writable multi-line', () => {
    const state = startDraft(makeMultiLineParagraph(), 'Line text', 'edit', null)!;
    const modified = updateDraft(state, 'New text');
    const [, result] = commitDraft(modified, 'edit', null);
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// commitDraft — non-writable digital target (multi-span)
// ---------------------------------------------------------------------------

describe('commitDraft — non-writable multi-span target', () => {
  it('returns success=false', () => {
    const state = startDraft(makeMultiSpanParagraph(), 'Bold part regular part', 'edit', null)!;
    const modified = updateDraft(state, 'Changed');
    const [, result] = commitDraft(modified, 'edit', null);
    expect(result.success).toBe(false);
  });

  it('returns reason=non-writable-structure', () => {
    const state = startDraft(makeMultiSpanParagraph(), 'Bold part regular part', 'edit', null)!;
    const modified = updateDraft(state, 'Changed');
    const [, result] = commitDraft(modified, 'edit', null);
    expect(result.reason).toBe('non-writable-structure');
  });

  it('transitions to committed state for non-writable multi-span', () => {
    const state = startDraft(makeMultiSpanParagraph(), 'Bold part regular part', 'edit', null)!;
    const modified = updateDraft(state, 'Changed');
    const [newState] = commitDraft(modified, 'edit', null);
    expect(newState.status).toBe('committed');
  });
});

// ---------------------------------------------------------------------------
// commitDraft — idle state guard
// ---------------------------------------------------------------------------

describe('commitDraft — guard: not in editing state', () => {
  it('returns no-active-draft for idle state', () => {
    const idle = createIdleDraftState();
    const [, result] = commitDraft(idle, 'edit', null);
    expect(result.reason).toBe('no-active-draft');
    expect(result.success).toBe(false);
  });

  it('returns state unchanged for idle commit', () => {
    const idle = createIdleDraftState();
    const [newState] = commitDraft(idle, 'edit', null);
    expect(newState).toBe(idle);
  });
});

// ---------------------------------------------------------------------------
// Error center — makeTextMutationError
// ---------------------------------------------------------------------------

describe('errorCenter — makeTextMutationError', () => {
  it('exports makeTextMutationError', () => {
    expect(errorCenterSrc).toContain('export const makeTextMutationError');
  });

  it('makeTextMutationError uses text_edit source', () => {
    expect(errorCenterSrc).toContain("'text_edit'");
  });

  it('makeTextMutationError has error severity', () => {
    const block = errorCenterSrc.slice(
      errorCenterSrc.indexOf('makeTextMutationError'),
      errorCenterSrc.indexOf('makeTextMutationError') + 120,
    );
    expect(block).toContain("'error'");
  });

  it('makeTextMutationError title uses i18n key for text edit error', () => {
    const block = errorCenterSrc.slice(
      errorCenterSrc.indexOf('makeTextMutationError'),
      errorCenterSrc.indexOf('makeTextMutationError') + 120,
    );
    expect(block).toContain("errors.textEditFailed");
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — commit pipeline wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — commit pipeline wiring', () => {
  it('imports getTauriTextMutationEngine', () => {
    expect(viewerAppSrc).toContain('getTauriTextMutationEngine');
  });

  it('imports getMutationSupport from textMutationSupport', () => {
    expect(viewerAppSrc).toContain('getMutationSupport');
  });

  it('imports validateReplacement from textMutationSupport', () => {
    expect(viewerAppSrc).toContain('validateReplacement');
  });

  it('imports makeTextMutationError', () => {
    expect(viewerAppSrc).toContain('makeTextMutationError');
  });

  it('imports appendError', () => {
    expect(viewerAppSrc).toContain('appendError');
  });

  it('imports AppError type', () => {
    expect(viewerAppSrc).toContain('AppError');
  });

  it('declares appErrors state', () => {
    expect(viewerAppSrc).toContain('appErrors');
    expect(viewerAppSrc).toContain('setAppErrors');
  });

  it('handleDraftCommit is declared as async', () => {
    const idx = viewerAppSrc.indexOf('handleDraftCommit');
    const block = viewerAppSrc.slice(idx, idx + 60);
    expect(block).toContain('async');
  });

  it('handleDraftCommit calls replaceTextSpan', () => {
    expect(viewerAppSrc).toContain('replaceTextSpan');
  });

  it('handleDraftCommit invokes markDirty on success', () => {
    expect(viewerAppSrc).toContain('markDirty');
  });

  it('handleDraftCommit appends error on mutation failure', () => {
    const idx = viewerAppSrc.indexOf('handleDraftCommit');
    const block = viewerAppSrc.slice(idx, idx + 1500);
    expect(block).toContain('makeTextMutationError');
  });

  it('handleDraftCommit calls replaceTextSpan on the mutation engine', () => {
    // The async commit path calls engine.replaceTextSpan directly
    expect(viewerAppSrc).toContain('replaceTextSpan');
  });
});
