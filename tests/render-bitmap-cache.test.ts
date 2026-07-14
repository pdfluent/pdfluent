// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const source = readFileSync(
  new URL('../src/viewer/hooks/useRenderedCanvas.ts', import.meta.url),
  'utf8',
);

// ---------------------------------------------------------------------------
// BitmapCache — document-switch detection
// document.id = `doc_${Date.now()}_${Math.random().toString(36).substr(2,9)}`
// Cache key    = `${document.id}_${renderRevision}_${pageIndex}_${scale}`
//
// The first 3 underscore-separated parts of the key are the document ID.
// Taking only split('_')[0] always returns 'doc' (same for every document),
// so the doc-switch clear would never fire. The correct extraction is
// split('_').slice(0, 3).join('_').
// ---------------------------------------------------------------------------

describe('BitmapCache — document-switch docId extraction', () => {
  it('uses slice(0,3).join to reconstruct the full document ID from the cache key', () => {
    // The correct pattern: key.split('_').slice(0, 3).join('_')
    expect(source).toContain("key.split('_').slice(0, 3).join('_')");
  });

  it('does NOT use the broken split(_)[0] pattern for docId extraction', () => {
    // Split by line to avoid false-positives in comments.
    const lines = source.split('\n');
    const assignmentLines = lines.filter(
      l => l.includes('const docId') || l.includes('existingDocId'),
    );
    for (const line of assignmentLines) {
      expect(line).not.toContain("split('_')[0]");
    }
  });
});

// ---------------------------------------------------------------------------
// Cache key format must embed document.id as the first 3 underscore-delimited
// parts so the docId extraction above works correctly.
// ---------------------------------------------------------------------------

describe('BitmapCache — cache key format', () => {
  it('builds cache key as document.id + revision + pageIndex + scale', () => {
    // The key template must embed document.id first.
    expect(source).toContain('`${document.id}_${renderRevision}_${pageIndex}_${scale}`');
  });

  it('prefetch key uses the same format', () => {
    expect(source).toContain('`${doc.id}_${renderRevision}_${n}_${sc}`');
  });
});
