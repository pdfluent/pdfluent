// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Report IDs and capability tokens.
//
// A feedback ID is what the reporter sees, keeps, and later finds in the
// `fixed_feedback` list of an update feed that everybody can download. So it
// must say nothing about the person and must not be guessable: 40 random bits
// in Crockford base32 (no I, L, O, U, so it survives being read aloud or typed
// from a screenshot). Sequential numbers would leak volume and let anyone walk
// the list.

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const FEEDBACK_ID_RE = /^FB-[0-9A-HJKMNP-TV-Z]{8}$/;

/** `FB-` + 8 Crockford base32 characters from 40 random bits. */
export function newFeedbackId(randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const bytes = randomBytes(5);
  let bits = 0n;
  for (const b of bytes) bits = (bits << 8n) | BigInt(b);
  let out = '';
  for (let i = 7; i >= 0; i--) {
    out += CROCKFORD[Number((bits >> BigInt(i * 5)) & 31n)];
  }
  return `FB-${out}`;
}

/** 32 random bytes, hex. Handed to the reporter once; only its hash is stored. */
export function newToken(randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  return [...randomBytes(32)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison of two hex strings of equal length. */
export function sameHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
