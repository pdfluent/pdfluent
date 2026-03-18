// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// IssuePanel — structured document issue list with filtering.
//
// Displays open and resolved issues derived from annotations, redactions,
// and flagged markups. Supports reviewer filtering. Clicking an issue
// navigates to the related page.
// ---------------------------------------------------------------------------

import { useState, useMemo } from 'react';
import type { DocumentIssue } from '../documentIssues';

interface IssuePanelProps {
  /** All extracted document issues. */
  issues: DocumentIssue[];
  /** Called when the user clicks an issue to navigate to its page. */
  onNavigate?: (pageIndex: number, annotationId: string) => void;
}

export function IssuePanel({ issues, onNavigate }: IssuePanelProps) {
  const [filterReviewer, setFilterReviewer] = useState('');
  const [showResolved, setShowResolved] = useState(false);

  // Collect unique reviewer names for the filter dropdown
  const reviewers = useMemo(() => {
    const names = new Set<string>();
    for (const issue of issues) {
      if (issue.author) names.add(issue.author);
    }
    return Array.from(names).sort();
  }, [issues]);

  const filteredIssues = useMemo(() => {
    return issues.filter(issue => {
      if (!showResolved && issue.status === 'resolved') return false;
      if (filterReviewer && issue.author !== filterReviewer) return false;
      return true;
    });
  }, [issues, showResolved, filterReviewer]);

  const openCount = issues.filter(i => i.status === 'open').length;
  const resolvedCount = issues.filter(i => i.status === 'resolved').length;

  return (
    <div data-testid="issue-panel" className="flex flex-col gap-1 p-2">
      {/* Summary counts */}
      <div className="flex items-center gap-3 mb-1">
        <span data-testid="issue-open-count" className="text-[10px] text-muted-foreground">
          {openCount} open
        </span>
        <span data-testid="issue-resolved-count" className="text-[10px] text-muted-foreground">
          {resolvedCount} opgelost
        </span>
      </div>

      {/* Reviewer filter */}
      <select
        data-testid="issue-reviewer-filter"
        value={filterReviewer}
        onChange={e => { setFilterReviewer(e.target.value); }}
        className="text-[10px] border border-border rounded px-1.5 py-0.5 bg-background text-foreground"
      >
        <option value="">Alle reviewers</option>
        {reviewers.map(r => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>

      {/* Show resolved toggle */}
      <label className="flex items-center gap-1.5 cursor-pointer select-none">
        <input
          data-testid="issue-show-resolved-toggle"
          type="checkbox"
          checked={showResolved}
          onChange={e => { setShowResolved(e.target.checked); }}
          className="rounded"
        />
        <span className="text-[10px] text-muted-foreground">Toon opgelost</span>
      </label>

      {/* Issue list */}
      {filteredIssues.length === 0 ? (
        <p className="text-[10px] text-muted-foreground/60 mt-2">Geen problemen gevonden.</p>
      ) : (
        <div className="flex flex-col gap-0.5 mt-1">
          {filteredIssues.map(issue => (
            <div
              key={issue.id}
              data-testid="issue-item"
              data-status={issue.status}
              data-source={issue.source}
              className="flex flex-col gap-0.5 px-2 py-1.5 rounded hover:bg-muted/30"
            >
              <div className="flex items-start justify-between gap-1">
                <span className="text-[10px] text-foreground leading-tight flex-1">{issue.description}</span>
                <span
                  data-testid="issue-status-badge"
                  className={`text-[9px] shrink-0 px-1 rounded ${issue.status === 'open' ? 'bg-destructive/15 text-destructive' : 'bg-muted text-muted-foreground'}`}
                >
                  {issue.status === 'open' ? 'open' : 'opgelost'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-muted-foreground truncate">{issue.author || '—'}</span>
                <button
                  data-testid="issue-page-link"
                  className="text-[9px] text-primary hover:underline shrink-0"
                  onClick={() => { onNavigate?.(issue.page, issue.annotationId); }}
                >
                  p.{issue.page + 1}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
