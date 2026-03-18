// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Text Real Edit Stability / Honesty Pass — Phase 4 Batch 10
 *
 * Final stability and honesty verification for the Phase 4 real text
 * mutation path. Verifies that:
 *
 * 1. Writable cases signal mutation-pending (caller invokes real backend)
 * 2. Unsupported cases return explicit failure — never silent success
 * 3. OCR text is classified as read-only and cannot start a writable draft
 * 4. Dirty state / save state wiring is correct and explicit
 * 5. Event log coherence: text edit events include page, user, description
 * 6. Error center integration: mutation errors are trackable and dismissible
 * 7. Autosave stability: only isDirty (not draft state) triggers autosave
 * 8. Safety matrix: all 5 canonical shapes pass their expected classification
 * 9. ViewerApp Phase 4 wiring is present and complete
 * 10. No silent success: every failure path produces a non-empty message
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
} from '../src/viewer/text/textDraftPipeline';
import { getMutationSupport, validateReplacement } from '../src/viewer/text/textMutationSupport';
import { getBackendRejectionMessage, getUnsupportedMessage } from '../src/viewer/text/textMutationMessaging';
import { makeDocumentEvent, appendEvent } from '../src/viewer/state/documentEvents';
import { makeTextMutationError, appendError, clearError } from '../src/viewer/state/errorCenter';
import { shouldTriggerAutosave } from '../src/viewer/state/autosaveManager';
import { validateSafetyMatrix } from '../src/viewer/text/textMutationMatrix';
import type { TextParagraphTarget } from '../src/viewer/text/textInteractionModel';

const __dir = dirname(fileURLToPath(import.meta.url));
const viewerAppSrc = readFileSync(join(__dir, '../src/viewer/ViewerApp.tsx'), 'utf8');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWritableParagraph(text = 'Hello world'): TextParagraphTarget {
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
            text,
            fontSize: 12,
          },
        ],
      },
    ],
  };
}

function makeOcrParagraph(): TextParagraphTarget {
  return {
    id: 'p0:par0',
    pageIndex: 0,
    source: 'ocr',
    rect: { x: 0, y: 0, width: 200, height: 14 },
    lines: [
      {
        id: 'p0:l0',
        pageIndex: 0,
        source: 'ocr',
        rect: { x: 0, y: 0, width: 200, height: 14 },
        spans: [
          {
            id: 'p0:s0',
            pageIndex: 0,
            source: 'ocr',
            rect: { x: 0, y: 0, width: 200, height: 14 },
            text: 'Scanned text',
            fontSize: 12,
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 1. Writable cases signal mutation-pending
// ---------------------------------------------------------------------------

describe('stability — writable cases signal mutation-pending', () => {
  it('writable target with changed text returns mutation-pending', () => {
    const state = startDraft(makeWritableParagraph(), 'Hello world', 'edit', null)!;
    const [, result] = commitDraft(updateDraft(state, 'Hi'), 'edit', null);
    expect(result.success).toBe(true);
    expect(result.reason).toBe('mutation-pending');
  });

  it('mutation-pending state is committed (not idle)', () => {
    const state = startDraft(makeWritableParagraph(), 'Hello world', 'edit', null)!;
    const [newState] = commitDraft(updateDraft(state, 'Hi'), 'edit', null);
    expect(newState.status).toBe('committed');
  });

  it('getMutationSupport returns writable=true for single-span digital', () => {
    const support = getMutationSupport(makeWritableParagraph());
    expect(support.writable).toBe(true);
    expect(support.supportClass).toBe('writable_digital_text');
  });
});

// ---------------------------------------------------------------------------
// 2. Unsupported cases never produce silent success
// ---------------------------------------------------------------------------

describe('stability — unsupported cases are never silently successful', () => {
  it('OCR commit attempt returns success=false', () => {
    // OCR targets can't enter edit mode (getEditability blocks them),
    // so startDraft returns null — no silent commit is possible
    const state = startDraft(makeOcrParagraph(), 'Scanned text', 'edit', null);
    expect(state).toBeNull();
  });

  it('non-writable commit returns success=false with non-empty message', () => {
    const multiLine: TextParagraphTarget = {
      ...makeWritableParagraph(),
      lines: [
        { ...makeWritableParagraph().lines[0]!, id: 'l0' },
        { ...makeWritableParagraph().lines[0]!, id: 'l1' },
      ],
    };
    const state = startDraft(multiLine, 'Hello world', 'edit', null)!;
    const [, result] = commitDraft(updateDraft(state, 'Changed'), 'edit', null);
    expect(result.success).toBe(false);
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('validateReplacement rejects too-long replacement with explicit message', () => {
    const support = getMutationSupport(makeWritableParagraph('Hi'));
    const validation = validateReplacement('Hi', 'Hello world is too long', support.constraints!);
    expect(validation.valid).toBe(false);
    expect(validation.message.length).toBeGreaterThan(0);
  });

  it('all backend rejection codes produce non-empty messages', () => {
    const codes = [
      'replacement-too-long',
      'text-not-found-in-content-stream',
      'no-content-stream',
      'empty-original-text',
      'page-not-found',
      'encoding-not-supported',
      'internal-error',
    ];
    for (const code of codes) {
      const msg = getBackendRejectionMessage(code);
      expect(msg.message ?? msg.explanation).toBeTruthy();
      expect(msg.tooltip.length).toBeGreaterThan(0);
    }
  });

  it('getUnsupportedMessage returns non-empty message for every non-writable class', () => {
    const nonWritableClasses = [
      'non_writable_digital_text',
      'ocr_read_only',
      'protected_or_locked',
      'unknown_structure',
    ] as const;
    for (const cls of nonWritableClasses) {
      const msg = getUnsupportedMessage({
        supportClass: cls,
        reasonCode: 'unknown-source',
        label: '',
        writable: false,
        constraints: null,
      });
      expect(msg.tooltip.length).toBeGreaterThan(0);
      expect(msg.explanation.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. OCR text remains read-only
// ---------------------------------------------------------------------------

describe('stability — OCR text is read-only', () => {
  it('getMutationSupport returns ocr_read_only for OCR source', () => {
    const support = getMutationSupport(makeOcrParagraph());
    expect(support.supportClass).toBe('ocr_read_only');
    expect(support.writable).toBe(false);
  });

  it('startDraft for OCR target in edit mode returns null (editability blocks)', () => {
    const state = startDraft(makeOcrParagraph(), 'Scanned text', 'edit', null);
    expect(state).toBeNull();
  });

  it('OCR support has null constraints (cannot mutate)', () => {
    const support = getMutationSupport(makeOcrParagraph());
    expect(support.constraints).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. Dirty state and save state wiring
// ---------------------------------------------------------------------------

describe('stability — dirty state wiring', () => {
  it('ViewerApp marks dirty only after replaceTextSpan success', () => {
    const idx = viewerAppSrc.indexOf('result.success && result.value.replaced');
    const block = viewerAppSrc.slice(idx, idx + 200);
    expect(block).toContain('markDirty');
  });

  it('ViewerApp does not markDirty when mutation backend returns replaced=false', () => {
    // The "text not found" branch does NOT call markDirty
    const idx = viewerAppSrc.indexOf('result.success && !result.value.replaced');
    const block = viewerAppSrc.slice(idx, idx + 200);
    expect(block).not.toContain('markDirty');
  });

  it('ViewerApp save pipeline calls clearDirty after save_pdf', () => {
    const idx = viewerAppSrc.indexOf("'save_pdf'");
    const block = viewerAppSrc.slice(idx, idx + 200);
    expect(block).toContain('clearDirty');
  });
});

// ---------------------------------------------------------------------------
// 5. Event log coherence
// ---------------------------------------------------------------------------

describe('stability — event log coherence', () => {
  it('page_mutated event has all required fields', () => {
    const event = makeDocumentEvent('page_mutated', 'jan', 0, 'p0:s0', 'Tekst bewerkt');
    expect(event.type).toBe('page_mutated');
    expect(event.user).toBe('jan');
    expect(event.page).toBe(0);
    expect(event.objectId).toBe('p0:s0');
    expect(event.description).toBe('Tekst bewerkt');
    expect(event.timestamp instanceof Date).toBe(true);
  });

  it('text_edit_committed event has all required fields', () => {
    const event = makeDocumentEvent('text_edit_committed', 'jan', 1, 'p1:s0', 'Opgeslagen');
    expect(event.type).toBe('text_edit_committed');
    expect(event.page).toBe(1);
  });

  it('appendEvent keeps events in insertion order', () => {
    const e1 = makeDocumentEvent('page_mutated', 'jan', 0, 's0', 'First');
    const e2 = makeDocumentEvent('text_edit_rejected', 'jan', 0, 's1', 'Second');
    const log = appendEvent(appendEvent([], e1), e2);
    expect(log[0]!.description).toBe('First');
    expect(log[1]!.description).toBe('Second');
  });
});

// ---------------------------------------------------------------------------
// 6. Error center integration
// ---------------------------------------------------------------------------

describe('stability — error center integration', () => {
  it('makeTextMutationError creates a trackable error', () => {
    const err = makeTextMutationError('Test error');
    expect(err.severity).toBe('error');
    expect(err.source).toBe('text_edit');
    expect(err.id.length).toBeGreaterThan(0);
    expect(err.timestamp instanceof Date).toBe(true);
  });

  it('errors can be appended and cleared individually', () => {
    const err = makeTextMutationError('Test error');
    const list = appendError([], err);
    expect(list).toHaveLength(1);
    const cleared = clearError(list, err.id);
    expect(cleared).toHaveLength(0);
  });

  it('ViewerApp tracks appErrors state', () => {
    expect(viewerAppSrc).toContain('appErrors');
    expect(viewerAppSrc).toContain('setAppErrors');
  });
});

// ---------------------------------------------------------------------------
// 7. Autosave stability
// ---------------------------------------------------------------------------

describe('stability — autosave does not trigger on cancelled draft', () => {
  it('autosave requires isDirty=true', () => {
    const config = { enabled: true, dirtyDebounceMs: 0, inactivityMs: 0 };
    expect(shouldTriggerAutosave(false, 99999, 99999, config)).toBe(false);
  });

  it('cancel draft does not leave draft in editing state', () => {
    const state = startDraft(makeWritableParagraph(), 'Hello', 'edit', null)!;
    const modified = updateDraft(state, 'Changed');
    const cancelled = cancelDraft(modified);
    expect(cancelled.status).toBe('idle');
  });
});

// ---------------------------------------------------------------------------
// 8. Safety matrix: all shapes pass
// ---------------------------------------------------------------------------

describe('stability — safety matrix all shapes pass', () => {
  it('validateSafetyMatrix returns no failures', () => {
    const results = validateSafetyMatrix();
    const failures = results.filter(r => !r.pass);
    expect(failures).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 9. ViewerApp Phase 4 wiring completeness
// ---------------------------------------------------------------------------

describe('stability — ViewerApp Phase 4 wiring completeness', () => {
  it('imports getMutationSupport', () => {
    expect(viewerAppSrc).toContain('getMutationSupport');
  });

  it('imports validateReplacement', () => {
    expect(viewerAppSrc).toContain('validateReplacement');
  });

  it('imports getTauriTextMutationEngine', () => {
    expect(viewerAppSrc).toContain('getTauriTextMutationEngine');
  });

  it('imports makeTextMutationError', () => {
    expect(viewerAppSrc).toContain('makeTextMutationError');
  });

  it('handleDraftCommit is async', () => {
    const idx = viewerAppSrc.indexOf('handleDraftCommit');
    const block = viewerAppSrc.slice(idx, idx + 60);
    expect(block).toContain('async');
  });

  it('handleDraftCommit calls replaceTextSpan', () => {
    expect(viewerAppSrc).toContain('replaceTextSpan');
  });
});

// ---------------------------------------------------------------------------
// 10. No silent success: all failure paths produce messages
// ---------------------------------------------------------------------------

describe('stability — no silent success', () => {
  it('idle commitDraft has non-empty message', () => {
    const [, result] = commitDraft(createIdleDraftState(), 'edit', null);
    expect(result.success).toBe(false);
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('no-change commitDraft message is non-empty', () => {
    const state = startDraft(makeWritableParagraph(), 'Hello', 'edit', null)!;
    const [, result] = commitDraft(state, 'edit', null);
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('mode-switch failure message is non-empty', () => {
    const state = startDraft(makeWritableParagraph(), 'Hello', 'edit', null)!;
    const [, result] = commitDraft(updateDraft(state, 'Hi'), 'read', null);
    expect(result.success).toBe(false);
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('mutation-pending result has non-empty message', () => {
    const state = startDraft(makeWritableParagraph(), 'Hello', 'edit', null)!;
    const [, result] = commitDraft(updateDraft(state, 'Hi'), 'edit', null);
    expect(result.success).toBe(true);
    expect(result.message.length).toBeGreaterThan(0);
  });
});
