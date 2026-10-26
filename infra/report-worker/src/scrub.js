// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Server-side scrub, shared by the crash and the feedback handlers.
//
// The app scrubs before it sends (src/lib/telemetry/scrub.ts). This runs again
// on arrival because the feedback form carries free text a person typed, and a
// person describing a problem writes "my file C:\Users\anna\loonstrook.pdf" or
// "mail me at anna@example.com" without thinking of it as data. Whatever lands
// in an issue is copied, quoted and indexed; it must not carry any of that.

const WINDOWS_PATH = /[A-Za-z]:\\[^\s"'<>|)\]}]*/g;
const UNC_PATH = /\\\\[^\s"'<>|)\]}]+/g;
const UNIX_PATH = /(?:\/[\w.\-@+]+){2,}\/?/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const DOC_FILE =
  /\b[\w.-]+\.(?:pdf|docx?|xlsx?|pptx?|csv|txt|log|rtf|odt|ods|odp|png|jpe?g|gif|tiff?|bmp|webp|heic)\b/gi;
const IBAN = /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,3})?\b/g;
// Phone numbers and other long digit runs (account, citizen-service or card
// numbers). Nine or more digits with optional separators, so an ISO date
// (eight digits) in a sentence survives.
const LONG_NUMBER = /\+?\d(?:[\s-]?\d){8,}/g;
const BASE64_BLOB = /[A-Za-z0-9+/]{40,}={0,2}/g;
const HEX_BLOB = /\b(?:0x)?[0-9a-fA-F]{32,}\b/g;

/** Replace anything that can identify a person or a file with a placeholder. */
export function scrub(input) {
  if (input == null) return '';
  let out = String(input);
  out = out.replace(UNC_PATH, '<path>');
  out = out.replace(WINDOWS_PATH, '<path>');
  out = out.replace(UNIX_PATH, '<path>');
  out = out.replace(EMAIL, '<email>');
  out = out.replace(DOC_FILE, '<file>');
  out = out.replace(IBAN, '<number>');
  out = out.replace(LONG_NUMBER, '<number>');
  out = out.replace(BASE64_BLOB, '<redacted>');
  out = out.replace(HEX_BLOB, '<redacted>');
  return out;
}

/**
 * True when `text` still contains something scrub() would have removed.
 * Used as the last check before an issue body leaves the Worker.
 */
export function containsPersonalData(text) {
  const s = String(text ?? '');
  return [UNC_PATH, WINDOWS_PATH, EMAIL, DOC_FILE, IBAN, LONG_NUMBER].some((re) => {
    re.lastIndex = 0;
    const hit = re.test(s);
    re.lastIndex = 0;
    return hit;
  });
}
