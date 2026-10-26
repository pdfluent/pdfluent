// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-65: a redaction rewrites the page content, so the page bitmaps cached by
// revision must be re-rendered. On 1.1.0 neither "Apply redactions
// permanently" nor "Search and redact text" told the viewer: the old text
// stayed on screen until the zoom changed, although the document was already
// redacted. And a refusal was swallowed, so the panel claimed success (apply)
// or "no matches" (search). These tests call the real hook with a fake backend.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reactForHooks, installFakeWindow } from './hookHarness';

vi.mock('react', async (orig) => reactForHooks(await orig()));
vi.mock('../../performance/perfMarks', () => ({
  whenFirstPainted: () => new Promise<void>(() => undefined),
  runWhenIdle: () => undefined,
}));
vi.mock('../../../i18n', () => ({ default: { t: (key: string) => key } }));
vi.mock('../../../lib/tauri-detection', () => ({ isTauriRuntime: () => true }));

// The backend is scripted at the Tauri boundary, so the real command bridge
// runs. Only the redaction commands are scripted; the hook's own load-time
// calls (page images and the like) get an empty answer.
const redaction = vi.fn();
const invokeCommand = vi.fn(async (command: string, args?: unknown) =>
  command === 'apply_redactions' || command === 'redact_search' ? redaction(command, args) : []);
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args?: unknown) => invokeCommand(command, args),
}));

import { useAnnotations } from '../useAnnotations';
import type { PdfDocument } from '../../../core/document';
import type { PdfEngine } from '../../../core/engine/PdfEngine';

installFakeWindow();

const ok = async () => ({ success: true, value: [] });
const engine = {
  document: { getOutline: ok },
  form: { getAllFormFields: () => ({ success: true, value: [] }) },
  query: { extractPageTextSpans: ok },
  annotation: { loadAnnotations: ok },
};
const doc = { id: 'doc-1', pages: [{ size: { width: 600, height: 800 } }, { size: { width: 600, height: 800 } }] } as unknown as PdfDocument;

function useMounted() {
  const markDirty = vi.fn();
  const onAnnotationsChanged = vi.fn();
  const noop = () => undefined;
  const hook = useAnnotations(
    doc, engine as unknown as PdfEngine, 0, 2, 'review', noop, 'Tester', markDirty,
    { current: false }, null, null, noop, noop, noop, noop, noop, [], onAnnotationsChanged,
  );
  return { hook, markDirty, onAnnotationsChanged };
}

describe('redaction re-renders the pages it changed', () => {
  beforeEach(() => { vi.clearAllMocks(); redaction.mockReset(); });

  it('applying redactions asks for a document-wide re-render', async () => {
    redaction.mockResolvedValue({ areas_redacted: 1 });
    const { hook, markDirty, onAnnotationsChanged } = useMounted();
    await hook.handleApplyRedactions();
    expect(invokeCommand).toHaveBeenCalledWith('apply_redactions', undefined);
    expect(markDirty).toHaveBeenCalled();
    // [] names no page, which the viewer treats as "every page".
    expect(onAnnotationsChanged).toHaveBeenCalledWith([]);
  });

  it('search redaction asks for a document-wide re-render', async () => {
    redaction.mockResolvedValue({ matches_found: 3, areas_redacted: 3 });
    const { hook, markDirty, onAnnotationsChanged } = useMounted();
    const result = await hook.handleRedactSearch('Lorem');
    expect(invokeCommand).toHaveBeenCalledWith('redact_search', { query: 'Lorem' });
    expect(result).toEqual({ matchesFound: 3, areasRedacted: 3 });
    expect(markDirty).toHaveBeenCalled();
    expect(onAnnotationsChanged).toHaveBeenCalledWith([]);
  });

  it('a refused apply is reported, not swallowed, and marks nothing', async () => {
    redaction.mockRejectedValue('redaction-incomplete: text survives');
    const { hook, markDirty, onAnnotationsChanged } = useMounted();
    await expect(hook.handleApplyRedactions()).rejects.toBe('redaction-incomplete: text survives');
    expect(markDirty).not.toHaveBeenCalled();
    expect(onAnnotationsChanged).not.toHaveBeenCalled();
  });

  it('a refused search is reported, not turned into "no matches"', async () => {
    redaction.mockRejectedValue('xfa-redaction-needs-flatten');
    const { hook, markDirty } = useMounted();
    await expect(hook.handleRedactSearch('Lorem')).rejects.toBe('xfa-redaction-needs-flatten');
    expect(markDirty).not.toHaveBeenCalled();
  });

  it('an empty term does not reach the backend', async () => {
    const { hook } = useMounted();
    expect(await hook.handleRedactSearch('   ')).toBeNull();
    expect(redaction).not.toHaveBeenCalled();
  });
});
