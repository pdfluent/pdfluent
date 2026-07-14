// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * Regression tests for the rawText fix (commit 0bc5a1e).
 *
 * Root cause: repairPdfTextArtifacts() mutated TextSpan.text in-place before
 * state storage, so the Rust backend received the repaired display text as the
 * content-stream search key — a string that can never be found in the raw PDF
 * stream. Fix: store pre-repair SDK text in span.rawText and use extractRawText()
 * for all backend calls.
 *
 * These tests verify the fix is present and complete at every layer:
 *   1. Data model — rawText field on TextSpan and TextSpanTarget
 *   2. Repair phase — ViewerApp stores rawText before mutating text
 *   3. Editability layer — extractRawText() uses rawText ?? text
 *   4. Interaction layer — useTextInteraction uses rawText as backend key
 *   5. Grouping layer — textGrouping threads rawText through split/merge
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));

const modelSrc = readFileSync(join(__dir, '../src/core/document/model.ts'), 'utf8');
const interactionModelSrc = readFileSync(
  join(__dir, '../src/viewer/text/textInteractionModel.ts'),
  'utf8',
);
const editabilitySrc = readFileSync(
  join(__dir, '../src/viewer/text/textEditability.ts'),
  'utf8',
);
const groupingSrc = readFileSync(
  join(__dir, '../src/viewer/text/textGrouping.ts'),
  'utf8',
);
const textInteractionSrc = readFileSync(
  join(__dir, '../src/viewer/hooks/useTextInteraction.ts'),
  'utf8',
);
const viewerAppSrc = readFileSync(join(__dir, '../src/viewer/ViewerApp.tsx'), 'utf8');

// ---------------------------------------------------------------------------
// 1. Data model
// ---------------------------------------------------------------------------

describe('rawText — data model', () => {
  it('TextSpan has rawText field in document model', () => {
    const spanIdx = modelSrc.indexOf('interface TextSpan');
    expect(spanIdx).toBeGreaterThan(-1);
    const closeIdx = modelSrc.indexOf('}', spanIdx);
    const spanBlock = modelSrc.slice(spanIdx, closeIdx + 1);
    expect(spanBlock).toContain('rawText');
  });

  it('rawText on TextSpan is optional (has ? modifier)', () => {
    const spanIdx = modelSrc.indexOf('interface TextSpan');
    const closeIdx = modelSrc.indexOf('}', spanIdx);
    const spanBlock = modelSrc.slice(spanIdx, closeIdx + 1);
    expect(spanBlock).toMatch(/rawText\?:/);
  });

  it('TextSpanTarget has rawText field in interaction model', () => {
    // Search after interface TextSpanTarget open up to 1500 chars (interface body)
    // Note: indexOf('}') would hit the first } inside JSDoc comments; use a wider slice.
    const targetIdx = interactionModelSrc.indexOf('interface TextSpanTarget');
    expect(targetIdx).toBeGreaterThan(-1);
    const interfaceBody = interactionModelSrc.slice(targetIdx, targetIdx + 1500);
    expect(interfaceBody).toContain('rawText');
  });

  it('rawText on TextSpanTarget is optional', () => {
    const targetIdx = interactionModelSrc.indexOf('interface TextSpanTarget');
    const interfaceBody = interactionModelSrc.slice(targetIdx, targetIdx + 1500);
    expect(interfaceBody).toMatch(/rawText\?:/);
  });
});

// ---------------------------------------------------------------------------
// 2. Repair phase — ViewerApp
// ---------------------------------------------------------------------------

describe('rawText — repair phase in ViewerApp', () => {
  it('captures pre-repair text into a local variable before calling repairPdfTextArtifacts', () => {
    // The fix requires storing the original SDK text before repair mutates span.text.
    // Pattern: const raw = s.text; s.text = repairPdfTextArtifacts(s.text); ...
    // Note: repairPdfTextArtifacts appears first in the import line; search for the call site.
    const callSiteIdx = viewerAppSrc.indexOf('s.text = repairPdfTextArtifacts(');
    expect(callSiteIdx).toBeGreaterThan(-1);
    const priorContext = viewerAppSrc.slice(Math.max(0, callSiteIdx - 200), callSiteIdx);
    // Should capture original text in a variable before the repair call
    expect(priorContext).toMatch(/const\s+\w+\s*=\s*s\.text/);
  });

  it('assigns rawText only when repair changed the text', () => {
    // If text unchanged after repair, rawText stays absent (no needless storage).
    expect(viewerAppSrc).toContain('s.rawText');
    // The assignment is conditional
    const rawTextAssignIdx = viewerAppSrc.indexOf('s.rawText');
    const surrounding = viewerAppSrc.slice(
      Math.max(0, rawTextAssignIdx - 100),
      rawTextAssignIdx + 100,
    );
    // Should be inside an if-block (text !== raw or equivalent)
    expect(surrounding).toMatch(/if\s*\(/);
  });
});

// ---------------------------------------------------------------------------
// 3. Editability layer — extractRawText
// ---------------------------------------------------------------------------

describe('rawText — extractRawText in textEditability', () => {
  it('exports extractRawText function', () => {
    expect(editabilitySrc).toContain('export function extractRawText');
  });

  it('extractRawText falls back to text when rawText is absent', () => {
    const fnIdx = editabilitySrc.indexOf('export function extractRawText');
    expect(fnIdx).toBeGreaterThan(-1);
    const fnBody = editabilitySrc.slice(fnIdx, fnIdx + 300);
    // Must use rawText ?? text, not just rawText
    expect(fnBody).toContain('rawText ?? s.text');
  });

  it('extractRawText joins span content from lines', () => {
    const fnIdx = editabilitySrc.indexOf('export function extractRawText');
    const fnBody = editabilitySrc.slice(fnIdx, fnIdx + 300);
    expect(fnBody).toContain('lines');
    expect(fnBody).toContain('spans');
  });
});

// ---------------------------------------------------------------------------
// 4. Interaction layer — useTextInteraction
// ---------------------------------------------------------------------------

describe('rawText — useTextInteraction uses rawText as backend key', () => {
  it('imports extractRawText from textEditability', () => {
    expect(textInteractionSrc).toContain('extractRawText');
  });

  it('uses extractRawText (not extractText) for the paragraph-level backend key', () => {
    // extractRawText must be called for the currentTextKey used in replace_text calls
    expect(textInteractionSrc).toContain('extractRawText(');
    // extractText still exists for display purposes but rawText is used for key
    const rawCallIdx = textInteractionSrc.indexOf('extractRawText(');
    const surroundingKey = textInteractionSrc.slice(
      Math.max(0, rawCallIdx - 50),
      rawCallIdx + 100,
    );
    // Should be assigned to a variable used as the backend search key
    expect(surroundingKey).toMatch(/\w*[Kk]ey\s*=\s*extractRawText|extractRawText.*[Kk]ey/);
  });

  it('uses span.rawText ?? span.text for single-span originalText backend key', () => {
    // Each single-span edit sends rawText (or falls back to text) as originalText.
    expect(textInteractionSrc).toMatch(/span\.rawText\s*\?\?\s*\S*\.span\.text|entry\.span\.rawText\s*\?\?\s*entry\.span\.text/);
  });
});

// ---------------------------------------------------------------------------
// 5. Grouping layer — textGrouping preserves rawText
// ---------------------------------------------------------------------------

describe('rawText — textGrouping preserves rawText through split/merge', () => {
  it('references rawText field when processing spans', () => {
    expect(groupingSrc).toContain('rawText');
  });

  it('single-token path threads rawText through', () => {
    // The single-token split path must pass rawText from the source span
    const singleTokenIdx = groupingSrc.indexOf('rawText: span.rawText');
    expect(singleTokenIdx).toBeGreaterThan(-1);
  });

  it('multi-segment split uses rawText ranges for segment boundaries', () => {
    // When a span is split into segments, rawText is sliced to match segment boundaries
    expect(groupingSrc).toContain('rawTokenRanges');
    expect(groupingSrc).toContain('span.rawText');
  });

  it('merge preserves rawText as concatenated raw key', () => {
    // Merge must build a combined rawText that matches the raw PDF stream
    const mergeRawIdx = groupingSrc.indexOf('mergedRaw');
    expect(mergeRawIdx).toBeGreaterThan(-1);
    const mergeContext = groupingSrc.slice(mergeRawIdx, mergeRawIdx + 200);
    // mergedRaw is set only when different from the merged display text
    expect(mergeContext).toMatch(/mergedRaw\s*!==|rawText.*mergedRaw/);
  });
});
