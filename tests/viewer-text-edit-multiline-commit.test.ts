// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * Multiline text-edit commit — release-blocker regression coverage
 *
 * Bug: editing one line of a multi-line text block and confirming with the
 * checkmark collapsed the entire block onto the first line. Two defects fed it:
 *
 * 1. (Rust, pdf-manip) apply_cross_run_replacement rewrote the WHOLE
 *    consecutive same-font run group into the first run's operator and emptied
 *    the rest — concatenating every line of the block onto line 1's baseline.
 *    Fixed offset-aware in the SDK; covered by Rust tests:
 *      - pdf-manip: replace_cross_run_multiline_preserves_other_lines
 *      - src-tauri:  op_replace_text_span_preserves_multiline_layout
 *
 * 2. (Frontend) the checkmark commit path read raw `innerText` (keeps nbsp and
 *    DOM line breaks) while blur/Enter read normalized `textContent` — the two
 *    commit paths could send different text, and DOM breaks were silently
 *    glued. Fixed by a single shared reader: readInlineEditorText().
 *
 * This file covers the frontend half.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeInlineEditorText } from '../src/viewer/components/TextInlineEditor';

const __dir = dirname(fileURLToPath(import.meta.url));

const inlineEditorSrc = readFileSync(
  join(__dir, '../src/viewer/components/TextInlineEditor.tsx'),
  'utf8',
);
const viewerAppSrc = readFileSync(join(__dir, '../src/viewer/ViewerApp.tsx'), 'utf8');

// ---------------------------------------------------------------------------
// normalizeInlineEditorText — behavior
// ---------------------------------------------------------------------------

describe('normalizeInlineEditorText — commit text normalization', () => {
  it('passes plain single-line text through unchanged', () => {
    expect(normalizeInlineEditorText('Some words to edit now.')).toBe(
      'Some words to edit now.',
    );
  });

  it('converts nbsp to a regular space (WebKit inserts nbsp on deletion)', () => {
    expect(normalizeInlineEditorText('Some words\u00a0to edit.')).toBe(
      'Some words to edit.',
    );
  });

  it('drops the phantom trailing newline from a contenteditable <br>', () => {
    expect(normalizeInlineEditorText('Some words to edit.\n')).toBe(
      'Some words to edit.',
    );
    expect(normalizeInlineEditorText('Some words to edit.\n\n')).toBe(
      'Some words to edit.',
    );
  });

  it('keeps a legitimate trailing space (raw PDF line text may end with one)', () => {
    expect(normalizeInlineEditorText('Some words to ')).toBe('Some words to ');
  });

  it('converts interior line breaks to a single space — never glues words', () => {
    expect(normalizeInlineEditorText('first\nsecond')).toBe('first second');
    expect(normalizeInlineEditorText('first \n second')).toBe('first second');
    expect(normalizeInlineEditorText('first\n\nsecond')).toBe('first second');
  });

  it('flattens pasted multiline content with spaces, not concatenation', () => {
    expect(normalizeInlineEditorText('line one\nline two\nline three\n')).toBe(
      'line one line two line three',
    );
  });

  it('is idempotent', () => {
    const once = normalizeInlineEditorText('a\u00a0b\nc\n');
    expect(normalizeInlineEditorText(once)).toBe(once);
  });
});

// ---------------------------------------------------------------------------
// Shared reader — single source of truth for editor text
// ---------------------------------------------------------------------------

describe('TextInlineEditor — shared normalized reader', () => {
  it('exports normalizeInlineEditorText and readInlineEditorText', () => {
    expect(inlineEditorSrc).toContain('export function normalizeInlineEditorText');
    expect(inlineEditorSrc).toContain('export function readInlineEditorText');
  });

  it('readInlineEditorText prefers innerText with textContent fallback', () => {
    expect(inlineEditorSrc).toContain('el.innerText ?? el.textContent');
  });

  it('internal readEditorText delegates to readInlineEditorText', () => {
    expect(inlineEditorSrc).toContain('readInlineEditorText(el)');
  });
});

// ---------------------------------------------------------------------------
// Commit-path parity — checkmark, blur, and Enter send identical text
// ---------------------------------------------------------------------------

describe('ViewerApp — checkmark commit path parity', () => {
  it('imports the shared reader next to TextInlineEditor', () => {
    expect(viewerAppSrc).toContain(
      "import { TextInlineEditor, readInlineEditorText } from './components/TextInlineEditor'",
    );
  });

  it('checkmark (floating pill) commits via readInlineEditorText, not raw innerText', () => {
    expect(viewerAppSrc).toContain('handleDraftCommit(readInlineEditorText(editorDivRef.current))');
    expect(viewerAppSrc).not.toContain('handleDraftCommit(editorDivRef.current.innerText)');
  });
});
