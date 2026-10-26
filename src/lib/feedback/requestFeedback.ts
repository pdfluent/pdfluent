// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Ask for the in-app feedback form, pre-filled with what the user was doing.
//
// The form listens for `pdfluent:open-feedback` on window. A caller that has
// something to report (a file that did not open, say) dispatches it with what
// it knows; it does not import or render the form itself, so a failure screen
// can offer feedback without depending on how the form is built.
// ---------------------------------------------------------------------------

export const FEEDBACK_EVENT = 'pdfluent:open-feedback';

export interface FeedbackRequest {
  /** What the user was doing, e.g. 'open'. */
  action: string;
  /** The stable error code, when there was one (e.g. 'open.corrupt'). Never raw engine text. */
  errorCode?: string;
}

export function requestFeedback(detail: FeedbackRequest): void {
  window.dispatchEvent(new CustomEvent<FeedbackRequest>(FEEDBACK_EVENT, { detail }));
}
