// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { describe, it, expect } from 'vitest';
import { scrub, scrubOptional } from '../scrub';

describe('scrub', () => {
  it('returns empty string for null/undefined', () => {
    expect(scrub(null)).toBe('');
    expect(scrub(undefined)).toBe('');
  });

  it('redacts POSIX absolute paths', () => {
    expect(scrub('failed at /Users/jasper/Documents/secret.pdf line 3'))
      .not.toContain('jasper');
    expect(scrub('open /home/alice/work/report.docx'))
      .not.toContain('alice');
    expect(scrub('/var/folders/x9/abc/T/scratch')).toBe('<path>');
  });

  it('redacts Windows absolute paths', () => {
    const out = scrub('C:\\Users\\jasper\\Documents\\Q3 layoffs.pdf failed');
    expect(out).not.toContain('jasper');
    expect(out).toContain('<path>');
  });

  it('redacts email addresses', () => {
    expect(scrub('contact jasper@example.com about this'))
      .toBe('contact <email> about this');
  });

  it('redacts bare filenames with sensitive extensions', () => {
    expect(scrub('could not parse Invoice_2026.pdf'))
      .toBe('could not parse <file>');
    expect(scrub('opening budget.xlsx and notes.txt'))
      .toBe('opening <file> and <file>');
  });

  it('redacts long base64 blobs', () => {
    const blob = 'A'.repeat(60);
    expect(scrub(`payload=${blob}`)).toBe('payload=<redacted>');
  });

  it('redacts long hex runs and memory addresses', () => {
    expect(scrub('hash 0x' + 'deadbeef'.repeat(5))).toContain('<redacted>');
    expect(scrub('a'.repeat(40))).toBe('<redacted>');
  });

  it('leaves ordinary prose untouched', () => {
    const msg = 'index out of bounds: the len is 3 but the index is 5';
    expect(scrub(msg)).toBe(msg);
  });

  it('leaves short single-segment roots like /tmp alone', () => {
    expect(scrub('writing to /tmp')).toBe('writing to /tmp');
  });

  it('handles a realistic panic stack without leaking PII', () => {
    const stack = [
      "panic: called `Option::unwrap()` on a `None` value",
      '  at /Users/jasper/PDFluent/src-tauri/src/lib.rs:482',
      '  while saving Confidential_Contract.pdf',
      '  user: jasper@pdfluent.com',
    ].join('\n');
    const out = scrub(stack);
    expect(out).not.toContain('jasper');
    expect(out).not.toContain('Confidential_Contract');
    expect(out).not.toContain('pdfluent.com');
    expect(out).toContain('<path>');
    expect(out).toContain('<file>');
    expect(out).toContain('<email>');
    // The non-sensitive panic reason survives.
    expect(out).toContain('Option::unwrap()');
  });

  it('redacts the extension-bearing token of a spaced filename', () => {
    // Caveat: words separated by spaces before the extension token are NOT
    // joined into the filename match (that would over-redact prose). The
    // identifying "<stem>.<ext>" token is always removed; the review dialog
    // shows the user the result so any residual word can be edited out.
    const out = scrub('while saving Q3 layoffs.pdf');
    expect(out).not.toContain('layoffs.pdf');
    expect(out).toContain('<file>');
  });

  it('scrubOptional preserves null for absent values', () => {
    expect(scrubOptional(null)).toBeNull();
    expect(scrubOptional('')).toBeNull();
    expect(scrubOptional('jasper@example.com')).toBe('<email>');
  });
});
