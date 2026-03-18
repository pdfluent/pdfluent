// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { describe, it, expect, beforeEach } from 'vitest';
import { MockDocumentEngine } from '../MockDocumentEngine';
import type { PdfDocument } from '../../../document';

describe('MockDocumentEngine — getOutline', () => {
  let engine: MockDocumentEngine;
  let doc: PdfDocument;

  beforeEach(async () => {
    engine = new MockDocumentEngine();
    const result = await engine.loadDocument('test.pdf');
    if (!result.success) throw new Error('loadDocument failed in setup');
    doc = result.value;
  });

  it('returns success with an empty array', async () => {
    const result = await engine.getOutline(doc);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value).toEqual([]);
  });

  it('returns an empty array (no bookmarks in mock)', async () => {
    const result = await engine.getOutline(doc);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value).toHaveLength(0);
  });

  it('is callable on any loaded document without error', async () => {
    const result1 = await engine.loadDocument('a.pdf');
    const result2 = await engine.loadDocument('b.pdf');
    if (!result1.success || !result2.success) throw new Error('setup failed');

    const [r1, r2] = await Promise.all([
      engine.getOutline(result1.value),
      engine.getOutline(result2.value),
    ]);

    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
  });
});
