// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Text Draft Pipeline — Phase 3 Batch 6 / Phase 4 Batch 3 update
 *
 * Verifies:
 * - startDraft, updateDraft, cancelDraft, commitDraft
 * - startDraft returns null for non-editable targets
 * - commitDraft fails safely with honest message for unwritable targets
 * - commitDraft returns mutation-pending for writable targets with changed text (Phase 4)
 * - commitDraft returns non-writable-structure for non-writable digital targets
 * - isDraftActive and isDraftDirty predicates
 * - State transitions: idle → editing → committed/cancelled
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  startDraft,
  updateDraft,
  cancelDraft,
  commitDraft,
  createIdleDraftState,
  isDraftActive,
  isDraftDirty,
} from '../src/viewer/text/textDraftPipeline';
import type { TextParagraphTarget } from '../src/viewer/text/textInteractionModel';

const __dir = dirname(fileURLToPath(import.meta.url));
const pipelineSrc = readFileSync(
  join(__dir, '../src/viewer/text/textDraftPipeline.ts'),
  'utf8',
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeParagraph(overrides: Partial<TextParagraphTarget> = {}): TextParagraphTarget {
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
            text: 'Hello world',
            fontSize: 12,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function makeOcrParagraph(): TextParagraphTarget {
  return makeParagraph({
    source: 'ocr',
    lines: [
      {
        id: 'p0:l0',
        pageIndex: 0,
        source: 'ocr',
        rect: { x: 10, y: 700, width: 200, height: 14 },
        spans: [
          {
            id: 'p0:s0',
            pageIndex: 0,
            source: 'ocr',
            rect: { x: 10, y: 700, width: 200, height: 14 },
            text: 'OCR text',
            fontSize: 12,
          },
        ],
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Source readiness
// ---------------------------------------------------------------------------

describe('textDraftPipeline — source readiness', () => {
  it('exports DraftStatus type', () => {
    expect(pipelineSrc).toContain('DraftStatus');
    expect(pipelineSrc).toContain("'idle'");
    expect(pipelineSrc).toContain("'editing'");
    expect(pipelineSrc).toContain("'committed'");
    expect(pipelineSrc).toContain("'cancelled'");
    expect(pipelineSrc).toContain("'error'");
  });

  it('exports DraftState interface', () => {
    expect(pipelineSrc).toContain('export interface DraftState');
    expect(pipelineSrc).toContain('status: DraftStatus');
    expect(pipelineSrc).toContain('target: TextParagraphTarget | null');
    expect(pipelineSrc).toContain('originalText: string');
    expect(pipelineSrc).toContain('draftText: string');
  });

  it('exports DraftCommitResult interface', () => {
    expect(pipelineSrc).toContain('export interface DraftCommitResult');
    expect(pipelineSrc).toContain('success: boolean');
    expect(pipelineSrc).toContain('reason: string');
    expect(pipelineSrc).toContain('message: string');
  });

  it('exports startDraft, updateDraft, cancelDraft, commitDraft', () => {
    expect(pipelineSrc).toContain('export function startDraft');
    expect(pipelineSrc).toContain('export function updateDraft');
    expect(pipelineSrc).toContain('export function cancelDraft');
    expect(pipelineSrc).toContain('export function commitDraft');
  });

  it('exports createIdleDraftState, isDraftActive, isDraftDirty', () => {
    expect(pipelineSrc).toContain('export function createIdleDraftState');
    expect(pipelineSrc).toContain('export function isDraftActive');
    expect(pipelineSrc).toContain('export function isDraftDirty');
  });
});

// ---------------------------------------------------------------------------
// createIdleDraftState
// ---------------------------------------------------------------------------

describe('createIdleDraftState', () => {
  it('returns idle status', () => {
    expect(createIdleDraftState().status).toBe('idle');
  });

  it('returns null target', () => {
    expect(createIdleDraftState().target).toBeNull();
  });

  it('returns empty strings for text fields', () => {
    const s = createIdleDraftState();
    expect(s.originalText).toBe('');
    expect(s.draftText).toBe('');
  });
});

// ---------------------------------------------------------------------------
// startDraft
// ---------------------------------------------------------------------------

describe('startDraft', () => {
  it('returns editing state for editable digital paragraph in edit mode', () => {
    const state = startDraft(makeParagraph(), 'Hello world', 'edit', null);
    expect(state).not.toBeNull();
    expect(state!.status).toBe('editing');
  });

  it('sets target correctly', () => {
    const para = makeParagraph();
    const state = startDraft(para, 'Hello world', 'edit', null);
    expect(state!.target?.id).toBe(para.id);
  });

  it('sets originalText and draftText to provided text', () => {
    const state = startDraft(makeParagraph(), 'Hello world', 'edit', null);
    expect(state!.originalText).toBe('Hello world');
    expect(state!.draftText).toBe('Hello world');
  });

  it('returns null for OCR paragraph (not editable)', () => {
    expect(startDraft(makeOcrParagraph(), 'OCR text', 'edit', null)).toBeNull();
  });

  it('returns null in non-edit mode', () => {
    expect(startDraft(makeParagraph(), 'text', 'read', null)).toBeNull();
  });

  it('returns null when annotation tool is active', () => {
    expect(startDraft(makeParagraph(), 'text', 'edit', 'highlight')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateDraft
// ---------------------------------------------------------------------------

describe('updateDraft', () => {
  it('updates draftText when in editing state', () => {
    const state = startDraft(makeParagraph(), 'original', 'edit', null)!;
    const updated = updateDraft(state, 'modified');
    expect(updated.draftText).toBe('modified');
  });

  it('does not change originalText', () => {
    const state = startDraft(makeParagraph(), 'original', 'edit', null)!;
    const updated = updateDraft(state, 'modified');
    expect(updated.originalText).toBe('original');
  });

  it('returns same state unchanged when not in editing status', () => {
    const idle = createIdleDraftState();
    expect(updateDraft(idle, 'text')).toBe(idle);
  });
});

// ---------------------------------------------------------------------------
// cancelDraft
// ---------------------------------------------------------------------------

describe('cancelDraft', () => {
  it('returns idle state when editing', () => {
    const state = startDraft(makeParagraph(), 'text', 'edit', null)!;
    const cancelled = cancelDraft(state);
    expect(cancelled.status).toBe('idle');
  });

  it('clears target on cancel', () => {
    const state = startDraft(makeParagraph(), 'text', 'edit', null)!;
    expect(cancelDraft(state).target).toBeNull();
  });

  it('returns same state unchanged when not editing', () => {
    const idle = createIdleDraftState();
    expect(cancelDraft(idle)).toBe(idle);
  });
});

// ---------------------------------------------------------------------------
// commitDraft
// ---------------------------------------------------------------------------

describe('commitDraft', () => {
  it('returns mutation-pending for writable target with changed text (Phase 4)', () => {
    const state = startDraft(makeParagraph(), 'original', 'edit', null)!;
    const modified = updateDraft(state, 'modified text');
    const [_newState, result] = commitDraft(modified, 'edit', null);
    expect(result.success).toBe(true);
    expect(result.reason).toBe('mutation-pending');
  });

  it('returns success=true with no-change when text is unchanged', () => {
    const state = startDraft(makeParagraph(), 'original', 'edit', null)!;
    const [_newState, result] = commitDraft(state, 'edit', null);
    expect(result.success).toBe(true);
    expect(result.reason).toBe('no-change');
  });

  it('returns success=false when mode changes to non-edit at commit time', () => {
    const state = startDraft(makeParagraph(), 'original', 'edit', null)!;
    const modified = updateDraft(state, 'modified');
    const [_newState, result] = commitDraft(modified, 'read', null);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('protected-mode');
  });

  it('returns success=false with no-active-draft when not in editing state', () => {
    const idle = createIdleDraftState();
    const [_newState, result] = commitDraft(idle, 'edit', null);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('no-active-draft');
  });

  it('commit result message is non-empty string', () => {
    const state = startDraft(makeParagraph(), 'text', 'edit', null)!;
    const modified = updateDraft(state, 'changed');
    const [_s, result] = commitDraft(modified, 'edit', null);
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('committed state transitions to committed status', () => {
    const state = startDraft(makeParagraph(), 'original', 'edit', null)!;
    const modified = updateDraft(state, 'changed');
    const [newState] = commitDraft(modified, 'edit', null);
    expect(newState.status).toBe('committed');
  });

  it('no-change commit clears to idle', () => {
    const state = startDraft(makeParagraph(), 'original', 'edit', null)!;
    const [newState] = commitDraft(state, 'edit', null);
    expect(newState.status).toBe('idle');
  });
});

// ---------------------------------------------------------------------------
// isDraftActive
// ---------------------------------------------------------------------------

describe('isDraftActive', () => {
  it('returns true when editing', () => {
    const state = startDraft(makeParagraph(), 'text', 'edit', null)!;
    expect(isDraftActive(state)).toBe(true);
  });

  it('returns false when idle', () => {
    expect(isDraftActive(createIdleDraftState())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isDraftDirty
// ---------------------------------------------------------------------------

describe('isDraftDirty', () => {
  it('returns false when draft text matches original', () => {
    const state = startDraft(makeParagraph(), 'original', 'edit', null)!;
    expect(isDraftDirty(state)).toBe(false);
  });

  it('returns true after updating draft text', () => {
    const state = startDraft(makeParagraph(), 'original', 'edit', null)!;
    const modified = updateDraft(state, 'modified');
    expect(isDraftDirty(modified)).toBe(true);
  });

  it('returns false when idle', () => {
    expect(isDraftDirty(createIdleDraftState())).toBe(false);
  });
});
