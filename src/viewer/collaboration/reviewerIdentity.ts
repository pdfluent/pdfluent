// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Reviewer Identity
//
// Manages reviewer identities across collaboration bundles.
// Identities are lightweight: a unique id, a display name, and a creation
// timestamp.  The current user's identity is persisted to localStorage.
// ---------------------------------------------------------------------------

import type { BundleReviewState } from './reviewBundleFormat';

export interface ReviewerIdentity {
  /** Stable identifier, auto-generated on first creation. */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** ISO timestamp of when this identity was first created. */
  createdAt: string;
}

/** localStorage key under which the current reviewer identity is stored. */
export const REVIEWER_IDENTITY_STORAGE_KEY = 'pdfluent.reviewer.identity';

/**
 * Build a new ReviewerIdentity with an auto-generated id.
 * Falls back to 'Anonymous' when name is blank.
 */
export function makeReviewerIdentity(name: string): ReviewerIdentity {
  return {
    id: `reviewer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim() || 'Anonymous',
    createdAt: new Date().toISOString(),
  };
}

/**
 * Return the display name for an identity.
 * Falls back to 'Anonymous' when name is blank.
 */
export function getReviewerDisplayName(identity: ReviewerIdentity): string {
  return identity.name.trim() || 'Anonymous';
}

/**
 * Return true when the reviewer has no name (or is explicitly 'Anonymous').
 */
export function isAnonymousReviewer(identity: ReviewerIdentity): boolean {
  return !identity.name.trim() || identity.name.trim() === 'Anonymous';
}

/**
 * Derive a list of unique reviewer identities from the annotation authors
 * present in a bundle's review state.  Useful for building reviewer filter
 * UI in the handoff panel.
 */
export function extractReviewersFromBundle(
  reviewState: BundleReviewState,
): ReviewerIdentity[] {
  const names = new Set(
    reviewState.annotations
      .map(a => (a as { author?: string }).author ?? '')
      .filter(Boolean),
  );
  return [...names].map(name => makeReviewerIdentity(name));
}

/**
 * Load the current reviewer's identity from localStorage.
 * Returns null when no identity has been saved yet.
 */
export function loadReviewerIdentity(): ReviewerIdentity | null {
  try {
    const stored = localStorage.getItem(REVIEWER_IDENTITY_STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as ReviewerIdentity;
  } catch {
    return null;
  }
}

/**
 * Persist the current reviewer's identity to localStorage.
 */
export function saveReviewerIdentity(identity: ReviewerIdentity): void {
  try {
    localStorage.setItem(REVIEWER_IDENTITY_STORAGE_KEY, JSON.stringify(identity));
  } catch { /* ignore write errors */ }
}

/**
 * Load identity from localStorage or create a new anonymous one.
 * Convenience helper so callers never receive null.
 */
export function loadOrCreateReviewerIdentity(fallbackName = ''): ReviewerIdentity {
  return loadReviewerIdentity() ?? makeReviewerIdentity(fallbackName);
}
