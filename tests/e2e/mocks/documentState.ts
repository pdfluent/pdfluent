// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Mock document fixture constants.
 *
 * MockDocumentEngine.loadDocument() always returns a 3-page A4 document
 * (612 × 792 pt). These constants mirror that fixture so E2E assertions
 * can be deterministic.
 */

export const MOCK_DOC = {
  path: 'mock-test.pdf',
  pageCount: 3,
  pageWidthPt: 612,
  pageHeightPt: 792,
} as const;

/** Fake file paths for seeding the recent-files list. */
export const MOCK_RECENT_FILES = [
  '/Users/test/documents/report-2026.pdf',
  '/Users/test/documents/invoice-q1.pdf',
  '/Users/test/desktop/contract.pdf',
] as const;

/** File name extracted from the first recent file path. */
export const MOCK_RECENT_FILE_NAME = 'report-2026.pdf';
