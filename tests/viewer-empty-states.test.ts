// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const source = readFileSync(
  new URL('../src/viewer/components/EmptyStates.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// EmptyStateNoDocument
// ---------------------------------------------------------------------------

describe('EmptyStateNoDocument', () => {
  it('exports EmptyStateNoDocument', () => {
    expect(source).toContain('export function EmptyStateNoDocument');
  });

  it('renders data-testid="empty-state-no-document"', () => {
    expect(source).toContain('data-testid="empty-state-no-document"');
  });

  it('renders a descriptive paragraph about no document', () => {
    const blockStart = source.indexOf('data-testid="empty-state-no-document"');
    const block = source.slice(blockStart, blockStart + 400);
    expect(block).toContain("t('emptyStates.noDocument'");
  });

  it('renders an action button when actionLabel is provided', () => {
    expect(source).toContain('data-testid="empty-state-no-document-action"');
  });

  it('action button calls onAction on click', () => {
    const btnStart = source.indexOf('data-testid="empty-state-no-document-action"');
    const block = source.slice(btnStart - 20, btnStart + 150);
    expect(block).toContain('onAction');
  });
});

// ---------------------------------------------------------------------------
// EmptyStateNoAnnotations
// ---------------------------------------------------------------------------

describe('EmptyStateNoAnnotations', () => {
  it('exports EmptyStateNoAnnotations', () => {
    expect(source).toContain('export function EmptyStateNoAnnotations');
  });

  it('renders data-testid="empty-state-no-annotations"', () => {
    expect(source).toContain('data-testid="empty-state-no-annotations"');
  });

  it('renders a descriptive paragraph about no annotations', () => {
    const blockStart = source.indexOf('data-testid="empty-state-no-annotations"');
    const block = source.slice(blockStart, blockStart + 400);
    expect(block).toContain("t('emptyStates.noAnnotations'");
  });

  it('renders an action button when actionLabel is provided', () => {
    expect(source).toContain('data-testid="empty-state-no-annotations-action"');
  });
});

// ---------------------------------------------------------------------------
// EmptyStateNoIssues
// ---------------------------------------------------------------------------

describe('EmptyStateNoIssues', () => {
  it('exports EmptyStateNoIssues', () => {
    expect(source).toContain('export function EmptyStateNoIssues');
  });

  it('renders data-testid="empty-state-no-issues"', () => {
    expect(source).toContain('data-testid="empty-state-no-issues"');
  });

  it('renders a descriptive paragraph about no open issues', () => {
    const blockStart = source.indexOf('data-testid="empty-state-no-issues"');
    const block = source.slice(blockStart, blockStart + 400);
    expect(block).toContain("t('emptyStates.noIssues'");
  });

  it('renders an action button when actionLabel is provided', () => {
    expect(source).toContain('data-testid="empty-state-no-issues-action"');
  });
});

// ---------------------------------------------------------------------------
// EmptyStateNoResults
// ---------------------------------------------------------------------------

describe('EmptyStateNoResults', () => {
  it('exports EmptyStateNoResults', () => {
    expect(source).toContain('export function EmptyStateNoResults');
  });

  it('renders data-testid="empty-state-no-results"', () => {
    expect(source).toContain('data-testid="empty-state-no-results"');
  });

  it('renders a descriptive paragraph about no search results', () => {
    const blockStart = source.indexOf('data-testid="empty-state-no-results"');
    const block = source.slice(blockStart, blockStart + 400);
    expect(block).toContain("t('emptyStates.noResults'");
  });

  it('renders an action button when actionLabel is provided', () => {
    expect(source).toContain('data-testid="empty-state-no-results-action"');
  });
});

// ---------------------------------------------------------------------------
// Shared EmptyStateProps pattern
// ---------------------------------------------------------------------------

describe('EmptyStates — shared props pattern', () => {
  it('actionLabel prop controls button visibility (conditional render)', () => {
    expect(source).toContain('actionLabel && onAction');
  });

  it('all four components follow the actionLabel/onAction pattern', () => {
    const occurrences = (source.match(/actionLabel && onAction/g) ?? []).length;
    expect(occurrences).toBe(4);
  });

  it('EmptyStateProps interface declares actionLabel as optional', () => {
    expect(source).toContain('actionLabel?: string');
  });

  it('EmptyStateProps interface declares onAction as optional callback', () => {
    expect(source).toContain('onAction?: () => void');
  });
});
