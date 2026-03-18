// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// ReviewHandoffPanel
//
// A side-panel that handles the full collaboration handoff workflow:
// export a review bundle, import an incoming bundle, preview the diff,
// and trigger a merge.
// ---------------------------------------------------------------------------

import React, { useCallback, useState } from 'react';
import type { Annotation, Reply } from '../../core/document';
import type { DocumentEvent } from '../state/documentEvents';
import type { ReviewerIdentity } from '../collaboration/reviewerIdentity';
import type { ReviewBundleExportPayload } from '../export/reviewBundleExport';
import type { ReviewBundleImportResult } from '../import/reviewBundleImport';
import type { MergeResult } from '../collaboration/reviewMerge';
import type { BundleCompareDiff } from '../collaboration/reviewBundleCompare';
import { isBundleExportable, buildReviewBundlePayload } from '../export/reviewBundleExport';
import { parseReviewBundleJson, isImportResultValid } from '../import/reviewBundleImport';
import { mergeReviewStates } from '../collaboration/reviewMerge';
import { compareReviewBundles, describeBundleDiff } from '../collaboration/reviewBundleCompare';
import { getReviewerDisplayName } from '../collaboration/reviewerIdentity';

export interface ReviewHandoffPanelProps {
  isOpen: boolean;
  onClose: () => void;
  documentTitle: string;
  annotations: Annotation[];
  reviewStatuses: Map<string, 'open' | 'resolved'>;
  commentReplies: Map<string, Reply[]>;
  eventLog: DocumentEvent[];
  reviewerIdentity: ReviewerIdentity;
  onExport: (payload: ReviewBundleExportPayload) => void;
  onImport: (result: ReviewBundleImportResult) => void;
  onMerge: (result: MergeResult) => void;
}

export function ReviewHandoffPanel({
  isOpen,
  onClose,
  documentTitle,
  annotations,
  reviewStatuses,
  commentReplies,
  eventLog,
  reviewerIdentity,
  onExport,
  onImport,
  onMerge,
}: ReviewHandoffPanelProps): React.ReactElement | null {
  if (!isOpen) return null;

  const [importResult, setImportResult] = useState<ReviewBundleImportResult | null>(null);
  const [diffSummary, setDiffSummary] = useState<string>('');
  const [pendingDiff, setPendingDiff] = useState<BundleCompareDiff | null>(null);

  const exportable = isBundleExportable(annotations, eventLog);
  const reviewerName = getReviewerDisplayName(reviewerIdentity);

  const handleExport = useCallback(() => {
    const payload = buildReviewBundlePayload(
      documentTitle,
      annotations,
      reviewStatuses,
      commentReplies,
      eventLog,
      reviewerName,
    );
    onExport(payload);
  }, [documentTitle, annotations, reviewStatuses, commentReplies, eventLog, reviewerName, onExport]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        const json = evt.target?.result as string;
        const result = parseReviewBundleJson(json);
        setImportResult(result);
        onImport(result);

        if (isImportResultValid(result) && result.reviewState) {
          const baseState = {
            annotations,
            reviewStatuses: Array.from(reviewStatuses.entries()),
            commentReplies: Array.from(commentReplies.entries()),
          };
          const diff = compareReviewBundles(baseState, result.reviewState);
          setPendingDiff(diff);
          setDiffSummary(describeBundleDiff(diff));
        }
      };
      reader.readAsText(file);
    },
    [annotations, reviewStatuses, commentReplies, onImport],
  );

  const handleMerge = useCallback(() => {
    if (!importResult?.reviewState) return;
    const baseState = {
      annotations,
      reviewStatuses: Array.from(reviewStatuses.entries()),
      commentReplies: Array.from(commentReplies.entries()),
    };
    const mergeResult = mergeReviewStates(baseState, importResult.reviewState);
    onMerge(mergeResult);
  }, [importResult, annotations, reviewStatuses, commentReplies, onMerge]);

  return (
    <div data-testid="handoff-panel" className="handoff-panel">
      <div className="handoff-panel__header">
        <span data-testid="handoff-reviewer-name" className="handoff-panel__reviewer">
          {reviewerName}
        </span>
        <button
          data-testid="handoff-close-btn"
          onClick={onClose}
          className="handoff-panel__close"
          aria-label="Sluit handoff panel"
        >
          ×
        </button>
      </div>

      <section data-testid="handoff-export-section" className="handoff-panel__section">
        <h3>Exporteer bundel</h3>
        <button
          data-testid="handoff-export-btn"
          onClick={handleExport}
          disabled={!exportable}
          className="handoff-panel__btn"
        >
          Bundel exporteren
        </button>
      </section>

      <section data-testid="handoff-import-section" className="handoff-panel__section">
        <h3>Importeer bundel</h3>
        <input
          data-testid="handoff-import-input"
          type="file"
          accept=".reviewbundle,.json"
          onChange={handleFileChange}
          className="handoff-panel__file-input"
        />
        {importResult && !importResult.success && (
          <p className="handoff-panel__error">{importResult.error}</p>
        )}
      </section>

      {pendingDiff !== null && (
        <section data-testid="handoff-merge-section" className="handoff-panel__section">
          <h3>Samenvoegen</h3>
          <p data-testid="handoff-diff-summary" className="handoff-panel__diff">
            {diffSummary}
          </p>
          <button
            data-testid="handoff-merge-btn"
            onClick={handleMerge}
            className="handoff-panel__btn handoff-panel__btn--primary"
          >
            Samenvoegen
          </button>
        </section>
      )}
    </div>
  );
}
