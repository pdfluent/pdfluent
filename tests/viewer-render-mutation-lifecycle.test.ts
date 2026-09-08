// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

describe('ViewerApp — post-commit render lifecycle', () => {
  it('invalidates render consumers instead of reopening the stale disk file', () => {
    expect(viewerAppSource).toContain('const handleDocumentMutated = useCallback((pages?: number[]) => {');
    expect(viewerAppSource).toContain('onDocumentMutated={handleDocumentMutated}');

    const callbackStart = viewerAppSource.indexOf('const handleDocumentMutated =');
    const callbackWiring = viewerAppSource.slice(callbackStart, callbackStart + 250);
    // #402: still an invalidation rather than a reload, but scoped — a text
    // commit names its page and only that page is refreshed.
    expect(callbackWiring).toContain('pages && pages.length > 0 ? bumpPages(r, pages) : bumpAll(r)');
    expect(callbackWiring).not.toContain('handleLoadDocument');
    expect(callbackWiring).not.toContain('currentFilePath');

    const propStart = viewerAppSource.indexOf('onDocumentMutated=');
    const propWiring = viewerAppSource.slice(propStart, propStart + 200);
    expect(propWiring).not.toContain('handleLoadDocument');
    expect(propWiring).not.toContain('currentFilePath');
  });
});
