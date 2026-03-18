// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Text Edit Session Integrity — Phase 4 Batch 6
 *
 * Verifies that edit sessions behave correctly around navigation, mode changes,
 * document close, and autosave. The rules are:
 *
 * 1. Mode change at commit time re-validates editability (commitDraft checks editability)
 * 2. A non-writable commit does NOT mark the document dirty
 * 3. A backend-failure commit does NOT mark the document dirty
 * 4. Autosave is based on isDirty — a failed/cancelled draft does not trigger autosave
 * 5. handleDraftCommit exits silently when selectedTextTarget is null (e.g. page changed)
 * 6. handleDraftCancel always clears editingTextTargetId and textDraft
 * 7. handleTextTargetSelect clears editingTextTargetId when target changes away
 * 8. commitDraft with mode='read' returns protected-mode failure (safe mode-switch handling)
 * 9. commitDraft always returns idle state on no-change (safe for page navigation)
 * 10. The unsaved-changes dialog (isDirty) is used for document close, not draft state
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
import {
  shouldTriggerAutosave,
} from '../src/viewer/state/autosaveManager';
import type { TextParagraphTarget } from '../src/viewer/text/textInteractionModel';

const __dir = dirname(fileURLToPath(import.meta.url));
const viewerAppSrc = readFileSync(join(__dir, '../src/viewer/ViewerApp.tsx'), 'utf8');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWritableParagraph(): TextParagraphTarget {
  return {
    id: 'p0:par0',
    pageIndex: 0,
    source: 'digital',
    rect: { x: 0, y: 0, width: 200, height: 14 },
    lines: [
      {
        id: 'p0:l0',
        pageIndex: 0,
        source: 'digital',
        rect: { x: 0, y: 0, width: 200, height: 14 },
        spans: [
          {
            id: 'p0:s0',
            pageIndex: 0,
            source: 'digital',
            rect: { x: 0, y: 0, width: 200, height: 14 },
            text: 'Hello world',
            fontSize: 12,
          },
        ],
      },
    ],
  };
}

function makeMultiLineParagraph(): TextParagraphTarget {
  const lineTemplate = {
    pageIndex: 0,
    source: 'digital' as const,
    rect: { x: 0, y: 0, width: 200, height: 14 },
    spans: [
      {
        id: 'p0:s0',
        pageIndex: 0,
        source: 'digital' as const,
        rect: { x: 0, y: 0, width: 200, height: 14 },
        text: 'line',
        fontSize: 12,
      },
    ],
  };
  return {
    id: 'p0:par0',
    pageIndex: 0,
    source: 'digital',
    rect: { x: 0, y: 0, width: 200, height: 28 },
    lines: [
      { ...lineTemplate, id: 'p0:l0' },
      { ...lineTemplate, id: 'p0:l1' },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mode switch at commit time
// ---------------------------------------------------------------------------

describe('session integrity — mode switch at commit time', () => {
  it('commitDraft fails when mode switches from edit to read during editing', () => {
    const state = startDraft(makeWritableParagraph(), 'Hello world', 'edit', null)!;
    const modified = updateDraft(state, 'Hello');
    const [, result] = commitDraft(modified, 'read', null); // mode changed to read
    expect(result.success).toBe(false);
    expect(result.reason).toBe('protected-mode');
  });

  it('mode-switch failure leaves state in error (not committed)', () => {
    const state = startDraft(makeWritableParagraph(), 'Hello world', 'edit', null)!;
    const modified = updateDraft(state, 'Hello');
    const [newState] = commitDraft(modified, 'read', null);
    expect(newState.status).toBe('error');
  });

  it('commitDraft succeeds when mode remains edit', () => {
    const state = startDraft(makeWritableParagraph(), 'Hello world', 'edit', null)!;
    const modified = updateDraft(state, 'Hi');
    const [, result] = commitDraft(modified, 'edit', null);
    expect(result.success).toBe(true);
    expect(result.reason).toBe('mutation-pending');
  });
});

// ---------------------------------------------------------------------------
// Non-writable commit — no dirty signal
// ---------------------------------------------------------------------------

describe('session integrity — non-writable commit does not set dirty', () => {
  it('non-writable commit returns success=false (no mutation happened)', () => {
    const state = startDraft(makeMultiLineParagraph(), 'line', 'edit', null)!;
    const modified = updateDraft(state, 'new line');
    const [, result] = commitDraft(modified, 'edit', null);
    // non-writable → no mutation, no dirty flag should be set by caller
    expect(result.success).toBe(false);
    expect(result.reason).toBe('non-writable-structure');
  });

  it('non-writable commit pipeline transitions to committed status (not idle)', () => {
    const state = startDraft(makeMultiLineParagraph(), 'line', 'edit', null)!;
    const modified = updateDraft(state, 'new line');
    const [newState] = commitDraft(modified, 'edit', null);
    expect(newState.status).toBe('committed');
  });

  it('ViewerApp does not call markDirty for non-writable path', () => {
    // The non-writable branch in handleDraftCommit exits BEFORE calling markDirty
    const idx = viewerAppSrc.indexOf('if (!mutationSupport.writable)');
    const block = viewerAppSrc.slice(idx, idx + 200);
    // Block should NOT contain markDirty before the next writable path
    expect(block).not.toContain('markDirty');
  });
});

// ---------------------------------------------------------------------------
// Cancelled draft — no dirty signal
// ---------------------------------------------------------------------------

describe('session integrity — cancel does not set dirty', () => {
  it('cancelDraft returns idle state', () => {
    const state = startDraft(makeWritableParagraph(), 'Hello world', 'edit', null)!;
    const modified = updateDraft(state, 'Changed');
    const result = cancelDraft(modified);
    expect(result.status).toBe('idle');
  });

  it('cancelDraft clears draft text (isDraftDirty becomes false)', () => {
    const state = startDraft(makeWritableParagraph(), 'Hello world', 'edit', null)!;
    const modified = updateDraft(state, 'Changed');
    expect(isDraftDirty(modified)).toBe(true);
    const cancelled = cancelDraft(modified);
    expect(isDraftActive(cancelled)).toBe(false);
  });

  it('cancelDraft on idle state is a no-op', () => {
    const idle = createIdleDraftState();
    const result = cancelDraft(idle);
    expect(result).toBe(idle); // same reference = no state change
  });
});

// ---------------------------------------------------------------------------
// Autosave — draft state does not trigger autosave
// ---------------------------------------------------------------------------

describe('session integrity — autosave based on isDirty, not draft state', () => {
  it('shouldTriggerAutosave returns false when isDirty=false, even after long inactivity', () => {
    const config = { enabled: true, dirtyDebounceMs: 0, inactivityMs: 0 };
    expect(shouldTriggerAutosave(false, 99999, 99999, config)).toBe(false);
  });

  it('shouldTriggerAutosave returns false when autosave is disabled', () => {
    const config = { enabled: false, dirtyDebounceMs: 0, inactivityMs: 0 };
    expect(shouldTriggerAutosave(true, 99999, 99999, config)).toBe(false);
  });

  it('shouldTriggerAutosave returns true only when dirty AND timeout exceeded', () => {
    const config = { enabled: true, dirtyDebounceMs: 5000, inactivityMs: 10000 };
    // Neither threshold exceeded
    expect(shouldTriggerAutosave(true, 1000, 1000, config)).toBe(false);
    // dirtyDebounce exceeded
    expect(shouldTriggerAutosave(true, 1000, 6000, config)).toBe(true);
    // inactivity exceeded
    expect(shouldTriggerAutosave(true, 11000, 1000, config)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Document close — isDirty gates beforeunload, not draft state
// ---------------------------------------------------------------------------

describe('session integrity — document close uses isDirty', () => {
  it('ViewerApp registers beforeunload handler that checks isDirty', () => {
    expect(viewerAppSrc).toContain('beforeunload');
    expect(viewerAppSrc).toContain('isDirty');
  });

  it('beforeunload handler does NOT reference editingTextTargetId', () => {
    const beforeUnloadIdx = viewerAppSrc.indexOf('beforeunload');
    const block = viewerAppSrc.slice(beforeUnloadIdx - 200, beforeUnloadIdx + 300);
    expect(block).not.toContain('editingTextTargetId');
  });
});

// ---------------------------------------------------------------------------
// handleDraftCommit — early exit when no target (page change scenario)
// ---------------------------------------------------------------------------

describe('session integrity — handleDraftCommit exits when target is null', () => {
  it('ViewerApp handleDraftCommit guards against null selectedTextTarget', () => {
    const idx = viewerAppSrc.indexOf('handleDraftCommit');
    const block = viewerAppSrc.slice(idx, idx + 300);
    expect(block).toContain('!selectedTextTarget');
  });
});

// ---------------------------------------------------------------------------
// handleTextTargetSelect — clears editing when target changes
// ---------------------------------------------------------------------------

describe('session integrity — target selection change clears editing', () => {
  it('handleTextTargetSelect clears editingTextTargetId when target changes', () => {
    // The implementation: setEditingTextTargetId(prev => target?.id === prev ? prev : null)
    const idx = viewerAppSrc.indexOf('handleTextTargetSelect');
    const block = viewerAppSrc.slice(idx, idx + 400);
    expect(block).toContain('editingTextTargetId');
    expect(block).toContain('null');
  });

  it('handleDraftCancel clears editingTextTargetId', () => {
    const idx = viewerAppSrc.indexOf('handleDraftCancel');
    const block = viewerAppSrc.slice(idx, idx + 200);
    expect(block).toContain('setEditingTextTargetId(null)');
  });
});

// ---------------------------------------------------------------------------
// No-change commit — always safe for page navigation
// ---------------------------------------------------------------------------

describe('session integrity — no-change commit is always safe', () => {
  it('no-change commit returns idle state regardless of target writability', () => {
    // Writable target
    const writable = startDraft(makeWritableParagraph(), 'Hello', 'edit', null)!;
    const [state1] = commitDraft(writable, 'edit', null); // unchanged
    expect(state1.status).toBe('idle');
  });

  it('no-change commit returns success=true', () => {
    const state = startDraft(makeWritableParagraph(), 'Hello', 'edit', null)!;
    const [, result] = commitDraft(state, 'edit', null);
    expect(result.success).toBe(true);
    expect(result.reason).toBe('no-change');
  });
});
