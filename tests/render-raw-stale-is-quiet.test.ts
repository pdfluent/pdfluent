// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-90 on macOS (run 39794825606): closing a tab left a render of its page 3
// queued; render_page_raw carries no document, ran against the other tab (2
// pages) and toasted "page 2 out of range". The raw render is quiet; a stale
// result is dropped by generation and a live failure falls to the PNG path,
// whose command does toast.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const engine = readFileSync(new URL('../src/platform/engine/tauri/TauriRenderEngine.ts', import.meta.url), 'utf8');
const hook = readFileSync(new URL('../src/viewer/hooks/useRenderedCanvas.ts', import.meta.url), 'utf8');

describe('a stale raw render says nothing', () => {
  it('render_page_raw goes through the quiet bridge', () => {
    expect(engine).toMatch(/invokeQuietly<ArrayBuffer>\('render_page_raw'/);
    expect(engine).not.toMatch(/invoke<ArrayBuffer>\('render_page_raw'/);
  });

  it('the caller drops a stale generation before it does anything else with a failed render', () => {
    const at = hook.indexOf('const bitmap = await getOrRenderRawBitmap(');
    const stale = hook.indexOf('if (genId !== genRef.current) return;', at);
    const fallback = hook.indexOf('if (!bitmap)', at);
    expect(at).toBeGreaterThan(-1);
    expect(stale).toBeGreaterThan(at);
    expect(fallback).toBeGreaterThan(stale);
  });

  it('a live failure still reaches the user: the PNG path uses the toasting bridge', () => {
    expect(engine).toMatch(/invoke<TauriRenderedPage>\('render_page'/);
  });
});
