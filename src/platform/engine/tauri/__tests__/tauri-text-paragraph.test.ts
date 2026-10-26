// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-42: an edit of a multi-line paragraph reaches the backend as one paragraph
// replacement (replace_text_paragraph), with each line's text and position so
// the backend edits those lines and not the same words elsewhere. A one-line
// edit keeps using replace_text_span. src-tauri/tests/paragraph_edit.rs proves
// what the backend then writes.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('../../../../lib/commandBridge', () => ({
  invokeCommand: (cmd: string, args?: unknown) => invoke(cmd, args),
}));

import { TauriTextMutationEngine } from '../TauriTextMutationEngine';

const replied = { replaced: true, reason: null, detail: null, occurrence_index: 0, occurrence_count: 1 };

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue(replied);
});

describe('TauriTextMutationEngine paragraph edits', () => {
  it('a multi-line target is sent as one paragraph replacement with every line and its anchor', async () => {
    const engine = new TauriTextMutationEngine();
    const r = await engine.replaceTextSpan({
      pageIndex: 2,
      originalText: 'first line second line',
      replacementText: 'a whole new paragraph',
      paragraphLines: [
        { text: 'first line', rect: { x: 72, y: 700, width: 100, height: 12 } },
        { text: 'second line', rect: { x: 72, y: 686, width: 110, height: 12 } },
      ],
    });
    expect(r.success && r.value.replaced).toBe(true);
    expect(invoke).toHaveBeenCalledWith('replace_text_paragraph', {
      request: {
        page_index: 2,
        lines: [
          { text: 'first line', anchor: { x: 72, y: 700, width: 100, height: 12 } },
          { text: 'second line', anchor: { x: 72, y: 686, width: 110, height: 12 } },
        ],
        replacement_text: 'a whole new paragraph',
      },
    });
  });

  it('a one-line target still uses replace_text_span', async () => {
    const engine = new TauriTextMutationEngine();
    await engine.replaceTextSpan({
      pageIndex: 0,
      originalText: 'only line',
      replacementText: 'edited',
      paragraphLines: [{ text: 'only line', rect: { x: 1, y: 2, width: 3, height: 4 } }],
    });
    expect(invoke.mock.calls[0]?.[0]).toBe('replace_text_span');
  });
});
