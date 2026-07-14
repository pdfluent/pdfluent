// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Empty State Components
//
// Reusable empty-state blocks for zero-content surfaces in the viewer.
// Uses the .viewer-empty class family — same as the welcome card — so
// every "nothing here" surface feels like one product.
//
// Note: each wrapper renders its own JSX (no shared shell helper) so the
// literal `data-testid` strings appear in source for the source-grep
// tests in tests/viewer-empty-states.test.ts.
// ---------------------------------------------------------------------------

import {
  CheckCircle2Icon,
  FileTextIcon,
  MessageSquareIcon,
  SearchIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface EmptyStateProps {
  /** Optional label for the call-to-action button. Omit to hide the button. */
  actionLabel?: string;
  /** Called when the user clicks the action button. */
  onAction?: () => void;
}

// ---------------------------------------------------------------------------
// No document open
// ---------------------------------------------------------------------------

/** Shown in the viewer canvas area when no PDF is loaded. */
export function EmptyStateNoDocument({ actionLabel, onAction }: EmptyStateProps = {}) {
  const { t } = useTranslation();
  return (
    <div data-testid="empty-state-no-document" className="viewer-empty">
      <span className="viewer-empty-mark" aria-hidden="true">
        <FileTextIcon />
      </span>
      <p className="viewer-empty-title">{t('emptyStates.noDocument')}</p>
      <p className="viewer-empty-description">{t('emptyStates.noDocumentHint')}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          data-testid="empty-state-no-document-action"
          onClick={onAction}
          className="viewer-empty-action viewer-empty-action-primary"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// No annotations
// ---------------------------------------------------------------------------

/** Shown in the review panel when no annotations exist on the current page or document. */
export function EmptyStateNoAnnotations({ actionLabel, onAction }: EmptyStateProps = {}) {
  const { t } = useTranslation();
  return (
    <div data-testid="empty-state-no-annotations" className="viewer-empty">
      <span className="viewer-empty-mark" aria-hidden="true">
        <MessageSquareIcon />
      </span>
      <p className="viewer-empty-title">{t('emptyStates.noAnnotations')}</p>
      <p className="viewer-empty-description">{t('emptyStates.noAnnotationsHint')}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          data-testid="empty-state-no-annotations-action"
          onClick={onAction}
          className="viewer-empty-action"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// No issues
// ---------------------------------------------------------------------------

/** Shown in the issue panel when extractDocumentIssues returns an empty list. */
export function EmptyStateNoIssues({ actionLabel, onAction }: EmptyStateProps = {}) {
  const { t } = useTranslation();
  return (
    <div data-testid="empty-state-no-issues" className="viewer-empty">
      <span className="viewer-empty-mark" data-tone="success" aria-hidden="true">
        <CheckCircle2Icon />
      </span>
      <p className="viewer-empty-title">{t('emptyStates.noIssues')}</p>
      <p className="viewer-empty-description">{t('emptyStates.noIssuesHint')}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          data-testid="empty-state-no-issues-action"
          onClick={onAction}
          className="viewer-empty-action"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// No search results
// ---------------------------------------------------------------------------

/** Shown in the search panel when a query returns zero matches. */
export function EmptyStateNoResults({ actionLabel, onAction }: EmptyStateProps = {}) {
  const { t } = useTranslation();
  return (
    <div data-testid="empty-state-no-results" className="viewer-empty">
      <span className="viewer-empty-mark" aria-hidden="true">
        <SearchIcon />
      </span>
      <p className="viewer-empty-title">{t('emptyStates.noResults')}</p>
      <p className="viewer-empty-description">{t('emptyStates.noResultsHint')}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          data-testid="empty-state-no-results-action"
          onClick={onAction}
          className="viewer-empty-action"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
