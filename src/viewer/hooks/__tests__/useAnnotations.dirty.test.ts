// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-81: the unsaved-changes guard relies on the webview's dirty flag. Adding a
// comment, editing one, deleting one and deleting a selected markup changed
// the document and left the flag clean, so closing the window lost them
// without a question. These tests call the real useAnnotations hook with a
// fake engine and check the flag is set once the engine reports success, and
// only then.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reactForHooks, installFakeWindow } from './hookHarness';

vi.mock('react', async (orig) => reactForHooks(await orig()));
vi.mock('../../performance/perfMarks', () => ({
  whenFirstPainted: () => new Promise<void>(() => undefined),
  runWhenIdle: () => undefined,
}));
vi.mock('../../../i18n', () => ({ default: { t: (key: string) => key } }));

import { useAnnotations } from '../useAnnotations';
import type { PdfDocument } from '../../../core/document';
import type { PdfEngine } from '../../../core/engine/PdfEngine';

installFakeWindow();

type Outcome = { success: boolean; value?: unknown };

function fakeEngine(outcome: Outcome) {
  const ok = async () => ({ success: true, value: [] });
  return {
    document: { getOutline: ok },
    form: { getAllFormFields: () => ({ success: true, value: [] }) },
    query: { extractPageTextSpans: ok },
    annotation: {
      loadAnnotations: ok,
      createAnnotation: vi.fn(async () => ({ ...outcome, value: { id: 'new-1' } })),
      deleteAnnotation: vi.fn(async () => outcome),
      updateAnnotation: vi.fn(async () => outcome),
    },
  };
}

const doc = { id: 'doc-1', pages: [{ size: { width: 600, height: 800 } }] } as unknown as PdfDocument;

function useMountedAnnotations(outcome: Outcome) {
  const markDirty = vi.fn();
  const engine = fakeEngine(outcome);
  const noop = () => undefined;
  const hook = useAnnotations(
    doc, engine as unknown as PdfEngine, 0, 1, 'review', noop, 'Tester', markDirty,
    { current: false }, null, null, noop, noop, noop, noop, noop, [],
  );
  return { hook, markDirty, engine };
}

const settle = () => new Promise(r => setTimeout(r, 0));

describe('annotation changes mark the document unsaved', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('adding a comment', async () => {
    const { hook, markDirty, engine } = useMountedAnnotations({ success: true });
    hook.handleAddComment();
    await settle();
    expect(engine.annotation.createAnnotation).toHaveBeenCalled();
    expect(markDirty).toHaveBeenCalled();
  });

  it('editing a comment', async () => {
    const { hook, markDirty, engine } = useMountedAnnotations({ success: true });
    hook.handleUpdateComment('a-1', 'new text');
    await settle();
    expect(engine.annotation.updateAnnotation).toHaveBeenCalledWith(doc, 'a-1', { contents: 'new text' });
    expect(markDirty).toHaveBeenCalled();
  });

  it('deleting a comment', async () => {
    const { hook, markDirty, engine } = useMountedAnnotations({ success: true });
    hook.handleDeleteComment('a-1');
    await settle();
    expect(engine.annotation.deleteAnnotation).toHaveBeenCalledWith(doc, 'a-1');
    expect(markDirty).toHaveBeenCalled();
  });

  it('deleting the selected markup annotation', async () => {
    const { hook, markDirty, engine } = useMountedAnnotations({ success: true });
    hook.handleDeleteSelectedAnnotation('m-1');
    await settle();
    expect(engine.annotation.deleteAnnotation).toHaveBeenCalledWith(doc, 'm-1');
    expect(markDirty).toHaveBeenCalled();
  });

  it('a change the engine refused leaves the document clean', async () => {
    const { hook, markDirty } = useMountedAnnotations({ success: false });
    hook.handleAddComment();
    hook.handleUpdateComment('a-1', 'x');
    hook.handleDeleteComment('a-1');
    hook.handleDeleteSelectedAnnotation('m-1');
    await settle();
    expect(markDirty).not.toHaveBeenCalled();
  });
});
