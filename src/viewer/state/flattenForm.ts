// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { flattenForm, type DocumentInfo } from '../../lib/tauri-api';

/** What the forms card tells the user: done, or the backend's reason. */
export type FlattenFormOutcome = { ok: true } | { ok: false; message: string };

/**
 * The forms card's Flatten action (J-58). The backend draws each widget's
 * appearance into its page and removes the fields, as one undo step
 * (`flatten_form`, `with_document_edit("flatten-form")`). `onFlattened`
 * refreshes the views; a refusal comes back as the outcome, so the control
 * can say why instead of doing nothing.
 */
export async function runFlattenForm(
  onFlattened: (info: DocumentInfo) => void,
): Promise<FlattenFormOutcome> {
  try {
    const info = await flattenForm();
    onFlattened(info);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
