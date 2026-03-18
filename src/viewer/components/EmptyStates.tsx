// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Empty State Components
//
// Reusable empty-state UI blocks for all zero-content surfaces in the viewer.
// Each component is self-contained and accepts an optional action callback.
// ---------------------------------------------------------------------------

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
  return (
    <div
      data-testid="empty-state-no-document"
      className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center"
    >
      <span className="text-4xl select-none" aria-hidden="true">📄</span>
      <p className="text-sm font-medium text-foreground">Geen document geopend</p>
      <p className="text-xs text-muted-foreground max-w-56">
        Sleep een PDF-bestand hierheen of open een bestand via het menu.
      </p>
      {actionLabel && onAction && (
        <button
          data-testid="empty-state-no-document-action"
          onClick={onAction}
          className="mt-1 text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
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
  return (
    <div
      data-testid="empty-state-no-annotations"
      className="flex flex-col items-center justify-center gap-3 py-10 px-4 text-center"
    >
      <span className="text-3xl select-none" aria-hidden="true">💬</span>
      <p className="text-sm font-medium text-foreground">Geen annotaties</p>
      <p className="text-xs text-muted-foreground max-w-48">
        Voeg een opmerking of markering toe om te beginnen.
      </p>
      {actionLabel && onAction && (
        <button
          data-testid="empty-state-no-annotations-action"
          onClick={onAction}
          className="mt-1 text-xs px-3 py-1.5 rounded border border-border text-foreground hover:bg-muted transition-colors"
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
  return (
    <div
      data-testid="empty-state-no-issues"
      className="flex flex-col items-center justify-center gap-3 py-10 px-4 text-center"
    >
      <span className="text-3xl select-none" aria-hidden="true">✅</span>
      <p className="text-sm font-medium text-foreground">Geen openstaande problemen</p>
      <p className="text-xs text-muted-foreground max-w-48">
        Alle annotaties zijn opgelost of er zijn nog geen opmerkingen geplaatst.
      </p>
      {actionLabel && onAction && (
        <button
          data-testid="empty-state-no-issues-action"
          onClick={onAction}
          className="mt-1 text-xs px-3 py-1.5 rounded border border-border text-foreground hover:bg-muted transition-colors"
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
  return (
    <div
      data-testid="empty-state-no-results"
      className="flex flex-col items-center justify-center gap-3 py-10 px-4 text-center"
    >
      <span className="text-3xl select-none" aria-hidden="true">🔍</span>
      <p className="text-sm font-medium text-foreground">Geen resultaten</p>
      <p className="text-xs text-muted-foreground max-w-48">
        Pas de zoekopdracht aan of probeer een andere term.
      </p>
      {actionLabel && onAction && (
        <button
          data-testid="empty-state-no-results-action"
          onClick={onAction}
          className="mt-1 text-xs px-3 py-1.5 rounded border border-border text-foreground hover:bg-muted transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
