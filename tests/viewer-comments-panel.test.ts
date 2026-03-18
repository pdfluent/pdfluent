// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import type { Annotation, AnnotationType } from '../src/core/document';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeAnnotation(overrides: Partial<Annotation> & { type: AnnotationType }): Annotation {
  return {
    id: `ann_${Math.random().toString(36).slice(2)}`,
    pageIndex: 0,
    rect: { x: 0, y: 0, width: 50, height: 20 },
    type: overrides.type,
    createdAt: new Date('2026-01-01'),
    modifiedAt: new Date('2026-01-01'),
    author: 'Alice',
    visible: true,
    locked: false,
    color: '#ffff00',
    ...overrides,
  } as Annotation;
}

// Pure filter+sort logic extracted from ViewerApp — tested in isolation
function extractComments(annotations: Annotation[]): Annotation[] {
  return annotations
    .filter(a => a.type === 'text')
    .sort((a, b) => a.pageIndex - b.pageIndex);
}

// ── Unit tests: client-side filter logic ─────────────────────────────────────

describe('comments filter logic — type === text', () => {
  it('returns only text annotations', () => {
    const annotations = [
      makeAnnotation({ type: 'text', pageIndex: 0 }),
      makeAnnotation({ type: 'highlight', pageIndex: 0 }),
      makeAnnotation({ type: 'underline', pageIndex: 1 }),
      makeAnnotation({ type: 'text', pageIndex: 1 }),
    ];

    const comments = extractComments(annotations);

    expect(comments).toHaveLength(2);
    expect(comments.every(c => c.type === 'text')).toBe(true);
  });

  it('returns empty array when no text annotations exist', () => {
    const annotations = [
      makeAnnotation({ type: 'highlight', pageIndex: 0 }),
      makeAnnotation({ type: 'stamp', pageIndex: 1 }),
      makeAnnotation({ type: 'ink', pageIndex: 2 }),
    ];

    expect(extractComments(annotations)).toHaveLength(0);
  });

  it('returns empty array for an empty annotation list', () => {
    expect(extractComments([])).toHaveLength(0);
  });

  it('sorts text annotations by pageIndex ascending', () => {
    const annotations = [
      makeAnnotation({ type: 'text', pageIndex: 5 }),
      makeAnnotation({ type: 'text', pageIndex: 0 }),
      makeAnnotation({ type: 'text', pageIndex: 2 }),
    ];

    const comments = extractComments(annotations);

    expect(comments.map(c => c.pageIndex)).toEqual([0, 2, 5]);
  });

  it('preserves annotation fields: author, contents, pageIndex', () => {
    const annotation = makeAnnotation({
      type: 'text',
      pageIndex: 3,
      author: 'Bob',
      contents: 'Needs revision',
    });

    const [comment] = extractComments([annotation]);

    expect(comment?.author).toBe('Bob');
    expect(comment?.contents).toBe('Needs revision');
    expect(comment?.pageIndex).toBe(3);
  });

  it('does not include non-text types even when they have contents', () => {
    const annotations = [
      makeAnnotation({ type: 'highlight', pageIndex: 0, contents: 'See this' }),
      makeAnnotation({ type: 'stamp', pageIndex: 1, contents: 'Approved' }),
      makeAnnotation({ type: 'text', pageIndex: 2, contents: 'Comment' }),
    ];

    const comments = extractComments(annotations);

    expect(comments).toHaveLength(1);
    expect(comments[0]?.type).toBe('text');
  });
});

// ── Source-scan tests: wiring and rendering ───────────────────────────────────

const leftNavSource = readFileSync(
  new URL('../src/viewer/components/LeftNavRail.tsx', import.meta.url),
  'utf8'
);

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

describe('CommentsPanel — v2 left rail', () => {
  it('renders the empty state when no comments', () => {
    expect(leftNavSource).toContain('Geen opmerkingen gevonden.');
    expect(leftNavSource).toContain('MessageSquareIcon');
  });

  it('renders author for each comment row', () => {
    expect(leftNavSource).toContain('comment.author');
  });

  it('renders page number (1-based) in group headings', () => {
    // Page numbers now appear in group headings (Pagina {pageIndex + 1}), not per-row
    expect(leftNavSource).toContain('pageIndex + 1');
    expect(leftNavSource).toContain('data-testid="comment-group-heading"');
  });

  it('renders contents excerpt for each comment row', () => {
    expect(leftNavSource).toContain('comment.contents');
  });

  it('accepts comments prop in LeftNavRailProps', () => {
    expect(leftNavSource).toContain('comments: Annotation[]');
  });

  it('passes comments to CommentsPanel via PanelContent', () => {
    expect(leftNavSource).toContain('comments={comments}');
  });

  it('no longer has the TODO(pdfluent-viewer) marker for CommentsPanel', () => {
    expect(leftNavSource).not.toContain('TODO(pdfluent-viewer): implement comments panel');
  });
});

describe('ViewerApp — comments state wiring', () => {
  it('declares comments state as Annotation[]', () => {
    expect(viewerAppSource).toContain('useState<Annotation[]>([])');
  });

  it('resets annotations when document changes', () => {
    expect(viewerAppSource).toContain('setAllAnnotations([])');
  });

  it('calls loadAnnotations to source comments from the PDF backend', () => {
    expect(viewerAppSource).toContain('engine.annotation.loadAnnotations(pdfDoc)');
  });

  it('filters to type === text client-side', () => {
    expect(viewerAppSource).toContain("a.type === 'text'");
  });

  it('sorts by pageIndex', () => {
    expect(viewerAppSource).toContain('a.pageIndex - b.pageIndex');
  });

  it('passes comments into LeftNavRail', () => {
    expect(viewerAppSource).toContain('comments={comments}');
  });
});
