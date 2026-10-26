// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Why a file did not open, in words the user can act on (J-16, J-17, J-18).
//
// open_pdf rejects with `{ code, detail }` (src-tauri/src/open_error.rs). The
// code picks the message: `openError.<name>.title|body|action` in the locale
// files, where <name> is the code without its `open.` prefix. The detail is
// the engine's own text and goes to the log only; it is never shown, and a
// code this file does not know gets the generic message, never the raw text.
//
// Until 1.0.1 the screen showed whatever the engine said, so a damaged file, a
// renamed JPEG and an empty download all read `Failed to parse PDF: invalid
// PDF: Invalid`.
// ---------------------------------------------------------------------------

import i18n from '../../i18n';

/** The codes of `OpenErrorCode` in open_error.rs, in the same order. */
export const OPEN_ERROR_CODES = [
  'open.corrupt',
  'open.not_pdf',
  'open.empty',
  'open.encrypted_needs_password',
  'open.wrong_password',
  'open.unsupported_encryption',
  'open.too_large',
  'open.too_many_pages',
  'open.io_denied',
  'open.not_found',
  'open.unknown',
] as const;

export type OpenErrorCode = (typeof OPEN_ERROR_CODES)[number];

export interface OpenFailure {
  code: OpenErrorCode;
  /** For the log. Never for the screen. */
  detail: string;
}

/** What the primary button of the message does. */
export type OpenErrorAction = 'open-another' | 'retry';

const ACTIONS: Record<OpenErrorCode, OpenErrorAction> = {
  'open.corrupt': 'open-another',
  'open.not_pdf': 'open-another',
  'open.empty': 'open-another',
  // Retrying the open brings the password prompt back.
  'open.encrypted_needs_password': 'retry',
  'open.wrong_password': 'retry',
  'open.unsupported_encryption': 'open-another',
  'open.too_large': 'open-another',
  'open.too_many_pages': 'open-another',
  // After the user has fixed the permission, or reconnected the drive.
  'open.io_denied': 'retry',
  'open.not_found': 'open-another',
  'open.unknown': 'retry',
};

export function isOpenErrorCode(value: unknown): value is OpenErrorCode {
  return typeof value === 'string' && (OPEN_ERROR_CODES as readonly string[]).includes(value);
}

/** The structured rejection open_pdf answers, as opposed to any other failure. */
export function isOpenRejection(value: unknown): value is { code: string; detail?: unknown } {
  return value !== null
    && typeof value === 'object'
    && typeof (value as { code?: unknown }).code === 'string'
    && (value as { code: string }).code.startsWith('open.');
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  if (value !== null && typeof value === 'object' && 'message' in value) {
    return String((value as { message: unknown }).message);
  }
  return String(value);
}

/**
 * Whatever an open rejected with, as an OpenFailure. The two password answers
 * of the string API (`password-required`, `password-incorrect`) are still
 * understood, so a caller on the old shape gets the same prompt.
 */
export function openFailureFromRejection(rejection: unknown): OpenFailure {
  if (isOpenRejection(rejection)) {
    const detail = typeof rejection.detail === 'string' ? rejection.detail : '';
    return isOpenErrorCode(rejection.code)
      ? { code: rejection.code, detail }
      : { code: 'open.unknown', detail: `${rejection.code}: ${detail}` };
  }
  const text = textOf(rejection);
  if (text.startsWith('password-required')) return { code: 'open.encrypted_needs_password', detail: text };
  if (text.startsWith('password-incorrect')) return { code: 'open.wrong_password', detail: text };
  return { code: 'open.unknown', detail: text };
}

export function openErrorAction(code: string): OpenErrorAction {
  return ACTIONS[isOpenErrorCode(code) ? code : 'open.unknown'];
}

export interface OpenErrorKeys {
  title: string;
  body: string;
  action: string;
}

/** The locale keys of a code's message; an unknown code gets the generic ones. */
export function openErrorKeys(code: string): OpenErrorKeys {
  const name = (isOpenErrorCode(code) ? code : 'open.unknown').slice('open.'.length);
  return {
    title: `openError.${name}.title`,
    body: `openError.${name}.body`,
    action: `openError.${name}.action`,
  };
}

export const OPEN_ERROR_FEEDBACK_KEY = 'openError.feedback';

export interface OpenErrorText {
  title: string;
  body: string;
  action: string;
  feedback: string;
}

export function openErrorText(code: string, t: (key: string) => string = (key) => i18n.t(key)): OpenErrorText {
  const keys = openErrorKeys(code);
  return { title: t(keys.title), body: t(keys.body), action: t(keys.action), feedback: t(OPEN_ERROR_FEEDBACK_KEY) };
}
