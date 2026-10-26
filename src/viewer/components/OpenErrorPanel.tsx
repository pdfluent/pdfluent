// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// What the canvas shows when a file did not open (J-17): what happened, what
// to do about it, and a way to tell us. The text comes from the error code
// alone (viewer/state/openError.ts); the engine's detail is not passed in, so
// it cannot end up on screen.

import { openErrorAction, openErrorText, type OpenErrorCode } from '../state/openError';
import { requestFeedback } from '../../lib/feedback/requestFeedback';

interface OpenErrorPanelProps {
  code: OpenErrorCode;
  /** Choose a different file. */
  onOpenAnother: () => void;
  /** Open the same file again (brings the password prompt back for a protected PDF). */
  onRetry: () => void;
}

export function OpenErrorPanel({ code, onOpenAnother, onRetry }: OpenErrorPanelProps) {
  const text = openErrorText(code);
  const action = openErrorAction(code);
  return (
    <div className="v3-canvas-state error open-error" role="alert" data-testid="open-error" data-error-code={code}>
      <div className="open-error-content">
        <h2 className="open-error-title" data-testid="open-error-title">{text.title}</h2>
        <p className="open-error-body" data-testid="open-error-body">{text.body}</p>
        <div className="open-error-actions">
          <button
            type="button"
            className="share-btn"
            data-testid="open-error-action"
            data-action={action}
            onClick={action === 'retry' ? onRetry : onOpenAnother}
          >
            {text.action}
          </button>
          <button
            type="button"
            className="iconbtn text"
            data-testid="open-error-feedback"
            onClick={() => { requestFeedback({ action: 'open', errorCode: code }); }}
          >
            {text.feedback}
          </button>
        </div>
      </div>
    </div>
  );
}
