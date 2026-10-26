// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-51 / J-55: a sticky note carries the comment the person wrote, lands at
// the point they clicked, marks the document unsaved, and a refused write
// neither marks it nor claims success.

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

function fakeEngine(success: boolean) {
  const ok = async () => ({ success: true, value: [] });
  return {
    document: { getOutline: ok },
    form: { getAllFormFields: () => ({ success: true, value: [] }) },
    query: { extractPageTextSpans: ok },
    annotation: {
      loadAnnotations: ok,
      createAnnotation: vi.fn(async () => ({ success, value: { id: 'new-1' } })),
      deleteAnnotation: ok,
      updateAnnotation: ok,
    },
  };
}

const doc = { id: 'doc-1', pages: [{ size: { width: 600, height: 800 } }, { size: { width: 600, height: 800 } }] } as unknown as PdfDocument;

function useMountedNote(success: boolean) {
  const markDirty = vi.fn();
  const engine = fakeEngine(success);
  const noop = () => undefined;
  const hook = useAnnotations(
    doc, engine as unknown as PdfEngine, 0, 2, 'review', noop, 'Tester', markDirty,
    { current: false }, null, null, noop, noop, noop, noop, noop, [],
  );
  return { hook, markDirty, engine };
}

describe('handleAddNote', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('writes the comment at the clicked point on the clicked page and marks the document unsaved', async () => {
    const { hook, markDirty, engine } = useMountedNote(true);
    const ok = await hook.handleAddNote(1, { x: 120, y: 340 }, 'Check the totals');
    expect(ok).toBe(true);
    expect(engine.annotation.createAnnotation).toHaveBeenCalledWith(
      doc, 1, 'text',
      expect.objectContaining({ x: 120, y: 340 }),
      expect.objectContaining({ contents: 'Check the totals', author: 'Tester' }),
    );
    expect(markDirty).toHaveBeenCalled();
  });

  it('reports failure and leaves the document clean when the engine refuses', async () => {
    const { hook, markDirty } = useMountedNote(false);
    expect(await hook.handleAddNote(0, { x: 1, y: 2 }, 'x')).toBe(false);
    expect(markDirty).not.toHaveBeenCalled();
  });
});
