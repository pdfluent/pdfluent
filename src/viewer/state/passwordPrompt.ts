// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Opening a password-protected PDF (J-18).
//
// The backend answers `password-required` when a PDF needs its user password
// and `password-incorrect` when the one given does not open it
// (pdf_engine::PASSWORD_REQUIRED / PASSWORD_INCORRECT). Until 1.0.1 that was a
// raw "Failed to parse PDF" and the document could not be opened at all. The
// open is now retried with whatever the prompt returns, until it opens or the
// user cancels. The password goes to the backend and nowhere else.
// ---------------------------------------------------------------------------

import { openFailureFromRejection } from './openError';

export interface PasswordRequest {
  fileName: string;
  /** The previous attempt had the wrong password. */
  retry: boolean;
}

/** Shows the prompt; resolves with the password, or null for Cancel. */
export type PasswordPrompter = (request: PasswordRequest) => Promise<string | null>;

let activePrompter: PasswordPrompter | null = null;

/** ViewerApp registers the dialog here. Returns the unregister function. */
export function setPasswordPrompter(prompter: PasswordPrompter): () => void {
  activePrompter = prompter;
  return () => {
    if (activePrompter === prompter) activePrompter = null;
  };
}

export type PasswordRefusal = 'required' | 'incorrect';

export function passwordRefusal(message: string): PasswordRefusal | null {
  if (message.includes('password-required')) return 'required';
  if (message.includes('password-incorrect')) return 'incorrect';
  return null;
}

/**
 * The password answer in a rejection of open_pdf: the structured
 * `{ code: 'open.encrypted_needs_password' | 'open.wrong_password' }`
 * (open_error.rs), or the string codes it answered before.
 */
export function passwordRefusalOf(error: unknown): PasswordRefusal | null {
  switch (openFailureFromRejection(error).code) {
    case 'open.encrypted_needs_password': return 'required';
    case 'open.wrong_password': return 'incorrect';
    default: return passwordRefusal(messageOf(error));
  }
}

export const OPEN_CANCELLED = Symbol('open-cancelled');

function messageOf(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Run `open`, asking for a password as long as the backend asks for one.
 * Any other failure is rethrown unchanged. Without a registered prompt (a
 * test harness, the browser build) the refusal is rethrown too.
 */
export async function openWithPasswordPrompt<T>(
  open: (password?: string) => Promise<T>,
  fileName: string,
  prompter: PasswordPrompter | null = activePrompter,
): Promise<T | typeof OPEN_CANCELLED> {
  let password: string | undefined;
  for (;;) {
    try {
      return await open(password);
    } catch (error) {
      const refusal = passwordRefusalOf(error);
      if (refusal === null || prompter === null) throw error;
      const answer = await prompter({ fileName, retry: refusal === 'incorrect' });
      if (answer === null) return OPEN_CANCELLED;
      password = answer;
    }
  }
}
