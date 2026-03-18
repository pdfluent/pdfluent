// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Layout Collision Validator — OBJECT_AND_LAYOUT_EDITING_EXCELLENCE_BLOCK Batch 8
 *
 * Prevents destructive layout interactions by validating proposed object moves
 * and resizes against the current page state.
 *
 * Validates:
 *   - Overlapping objects: warns when a moved/resized object overlaps others
 *   - Page boundary violations: object must remain fully within page bounds
 *   - Minimum size: object cannot shrink below MIN_OBJECT_SIZE
 *   - Annotation misalignment: form widgets must stay within their original
 *     annotation bounding box (their PDF annotation rect is authoritative)
 *   - Clipping risk: object should not be clipped by its containing group bbox
 *
 * All checks are non-destructive: they return a CollisionReport, never
 * modify the document state. The caller decides whether to block or warn.
 *
 * Severity levels:
 *   'error'   — change must be blocked (would corrupt or destroy content)
 *   'warning' — change is suspicious but may be intentional
 *   'info'    — informational only, no action needed
 */

import type { LayoutObject, LayoutRect } from './objectDetection';
import { rectsOverlap, rectContains } from './objectDetection';
import { MIN_OBJECT_SIZE } from './objectResizeEngine';

// ---------------------------------------------------------------------------
// Collision issue
// ---------------------------------------------------------------------------

export type CollisionSeverity = 'error' | 'warning' | 'info';

export type CollisionCode =
  | 'page-boundary-violation'
  | 'object-overlap'
  | 'annotation-misalignment'
  | 'clipping-risk'
  | 'minimum-size-violation'
  | 'locked-layer';

export interface CollisionIssue {
  readonly severity: CollisionSeverity;
  readonly code: CollisionCode;
  /** Human-readable description (Dutch). */
  readonly message: string;
  /** IDs of the objects involved (if applicable). */
  readonly involvedIds?: string[];
}

// ---------------------------------------------------------------------------
// Collision report
// ---------------------------------------------------------------------------

export interface CollisionReport {
  /** All issues found for this proposed operation. */
  readonly issues: CollisionIssue[];
  /** True when any error-severity issue is present. */
  readonly hasErrors: boolean;
  /** True when any warning-severity issue is present. */
  readonly hasWarnings: boolean;
  /** True when no issues at all — the operation is clean. */
  readonly clean: boolean;
}

function makeReport(issues: CollisionIssue[]): CollisionReport {
  return {
    issues,
    hasErrors: issues.some(i => i.severity === 'error'),
    hasWarnings: issues.some(i => i.severity === 'warning'),
    clean: issues.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

/**
 * Check: proposed rect must be fully within page bounds.
 */
export function checkPageBoundary(
  proposedRect: LayoutRect,
  pageBounds: LayoutRect,
): CollisionIssue | null {
  if (!rectContains(pageBounds, proposedRect)) {
    return {
      severity: 'error',
      code: 'page-boundary-violation',
      message: 'Het object valt buiten de paginaranden. Verplaats of verklein het object.',
    };
  }
  return null;
}

/**
 * Check: proposed rect must have positive non-zero dimensions.
 */
export function checkMinimumSize(proposedRect: LayoutRect): CollisionIssue | null {
  if (proposedRect.width < MIN_OBJECT_SIZE || proposedRect.height < MIN_OBJECT_SIZE) {
    return {
      severity: 'error',
      code: 'minimum-size-violation',
      message: `Object is kleiner dan de minimale grootte (${MIN_OBJECT_SIZE}pt). Vergroot het object.`,
    };
  }
  return null;
}

/**
 * Check: proposed rect should not overlap other objects.
 * Returns a warning (not an error) — overlapping is allowed but flagged.
 */
export function checkObjectOverlap(
  subjectId: string,
  proposedRect: LayoutRect,
  otherObjects: readonly LayoutObject[],
): CollisionIssue[] {
  const issues: CollisionIssue[] = [];
  for (const other of otherObjects) {
    if (other.id === subjectId) continue;
    if (rectsOverlap(proposedRect, other.rect)) {
      issues.push({
        severity: 'warning',
        code: 'object-overlap',
        message: `Object overlapt met '${other.id}'. Controleer of dit gewenst is.`,
        involvedIds: [subjectId, other.id],
      });
    }
  }
  return issues;
}

/**
 * Check: form widgets must stay within their annotation bounding box.
 * Returns an error when the proposed rect moves outside the annotation bbox.
 */
export function checkAnnotationAlignment(
  obj: LayoutObject,
  proposedRect: LayoutRect,
  annotationBBox: LayoutRect | null,
): CollisionIssue | null {
  if (obj.type !== 'form_widget' || annotationBBox === null) return null;
  if (!rectContains(annotationBBox, proposedRect)) {
    return {
      severity: 'error',
      code: 'annotation-misalignment',
      message: 'Formulierveld valt buiten de annotatiebegrenzing. Wijziging geblokkeerd.',
      involvedIds: [obj.id],
    };
  }
  return null;
}

/**
 * Check: object must fit within its container group bounding box (if any).
 * Returns a warning when the proposed rect extends beyond the group bbox.
 */
export function checkClippingRisk(
  obj: LayoutObject,
  proposedRect: LayoutRect,
  groupBBox: LayoutRect | null,
): CollisionIssue | null {
  if (groupBBox === null) return null;
  if (!rectContains(groupBBox, proposedRect)) {
    return {
      severity: 'warning',
      code: 'clipping-risk',
      message: 'Object kan worden afgeknipt door de groepsbegrenzing.',
      involvedIds: [obj.id],
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Full validation
// ---------------------------------------------------------------------------

export interface CollisionValidationInput {
  /** The object being moved or resized. */
  readonly subject: LayoutObject;
  /** Proposed new bounding rect. */
  readonly proposedRect: LayoutRect;
  /** Page bounds in PDF points. */
  readonly pageBounds: LayoutRect;
  /** All other objects on the page (for overlap detection). */
  readonly otherObjects: readonly LayoutObject[];
  /**
   * Annotation bbox for form widgets (null for non-widget objects).
   * When provided for a form_widget, the widget cannot leave this area.
   */
  readonly annotationBBox?: LayoutRect | null;
  /**
   * Group bounding box for clipping risk detection.
   * Null if the object is not inside a clipping group.
   */
  readonly groupBBox?: LayoutRect | null;
  /** Whether the object is in a locked layer. */
  readonly locked?: boolean;
}

/**
 * Run all collision checks for a proposed object move/resize.
 * Returns a CollisionReport with all issues found.
 */
export function validateCollisions(input: CollisionValidationInput): CollisionReport {
  const issues: CollisionIssue[] = [];

  // Locked layer check
  if (input.locked === true) {
    issues.push({
      severity: 'error',
      code: 'locked-layer',
      message: 'Object bevindt zich in een vergrendelde laag en kan niet worden gewijzigd.',
      involvedIds: [input.subject.id],
    });
    return makeReport(issues); // no need to check further
  }

  // Page boundary
  const boundaryIssue = checkPageBoundary(input.proposedRect, input.pageBounds);
  if (boundaryIssue) issues.push(boundaryIssue);

  // Minimum size
  const sizeIssue = checkMinimumSize(input.proposedRect);
  if (sizeIssue) issues.push(sizeIssue);

  // Annotation alignment (form widgets)
  const annotIssue = checkAnnotationAlignment(
    input.subject,
    input.proposedRect,
    input.annotationBBox ?? null,
  );
  if (annotIssue) issues.push(annotIssue);

  // Clipping risk
  const clipIssue = checkClippingRisk(input.subject, input.proposedRect, input.groupBBox ?? null);
  if (clipIssue) issues.push(clipIssue);

  // Overlap with other objects
  issues.push(...checkObjectOverlap(input.subject.id, input.proposedRect, input.otherObjects));

  return makeReport(issues);
}
