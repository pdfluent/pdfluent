// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Telemetry scrubbing
//
// PURE, side-effect-free redaction applied to any text that leaves the device
// (crash messages, stack traces, user notes). The golden rule of PDFluent's
// privacy-first telemetry: nothing personal, nothing about the document, ever
// leaves the machine. This runs at the source — before the review dialog and
// again (defence-in-depth) on the server.
//
// Over-redaction is acceptable; under-redaction is not.
// ---------------------------------------------------------------------------

/** Windows absolute paths: C:\Users\jasper\Documents\secret.pdf */
const WINDOWS_PATH = /[A-Za-z]:\\[^\s"'<>|)\]}]*/g;

/**
 * POSIX absolute paths with at least two segments: /Users/jasper/file,
 * /home/x/y, /var/folders/…. Single-segment roots like "/tmp" are left alone
 * to avoid mangling ordinary prose, but anything deeper is redacted.
 */
const UNIX_PATH = /(?:\/[\w.\-@+]+){2,}\/?/g;

/** Email addresses that slipped into a stack or a user note. */
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Bare filenames (not already inside a path) carrying a document or image
 * extension. The user's filenames can themselves be sensitive
 * ("Q3 layoffs.pdf"), so they go too.
 */
const DOC_FILE =
  /\b[\w.-]+\.(?:pdf|docx?|xlsx?|pptx?|csv|txt|log|rtf|odt|ods|odp|png|jpe?g|gif|tiff?|bmp|webp|heic)\b/gi;

/**
 * Long base64 blobs (>= 40 chars) — possible embedded document bytes or
 * tokens. Redacted wholesale.
 */
const BASE64_BLOB = /[A-Za-z0-9+/]{40,}={0,2}/g;

/** Long hex runs (>= 32 chars) — memory dumps, hashes, raw bytes. */
const HEX_BLOB = /\b(?:0x)?[0-9a-fA-F]{32,}\b/g;

/**
 * Scrub a single string. Returns the redacted text; never throws.
 * The order matters: paths and emails first (structural), then bare
 * filenames, then long opaque blobs last so they don't swallow the
 * placeholders we just inserted.
 */
export function scrub(input: string | null | undefined): string {
  if (input == null) return '';
  let out = String(input);
  out = out.replace(WINDOWS_PATH, '<path>');
  out = out.replace(UNIX_PATH, '<path>');
  out = out.replace(EMAIL, '<email>');
  out = out.replace(DOC_FILE, '<file>');
  out = out.replace(BASE64_BLOB, '<redacted>');
  out = out.replace(HEX_BLOB, '<redacted>');
  return out;
}

/** Convenience: scrub an optional field, preserving null for absent values. */
export function scrubOptional(
  input: string | null | undefined,
): string | null {
  if (input == null || input === '') return null;
  return scrub(input);
}
