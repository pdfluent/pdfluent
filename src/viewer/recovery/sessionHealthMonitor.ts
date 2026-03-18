// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Session Health Monitor
//
// Lightweight check system that produces a snapshot of the app's health.
// Callers can run this on a timer (HEALTH_REPORT_INTERVAL_MS) or after
// significant state transitions to surface degraded conditions early.
// ---------------------------------------------------------------------------

export type SessionHealthStatus = 'healthy' | 'degraded' | 'critical';

export interface SessionHealthCheck {
  /** Descriptive name of this check. */
  name: string;
  /** True when the check passed. */
  passed: boolean;
  /** How severely a failure should be treated. */
  severity: 'warning' | 'error';
}

export interface SessionHealthReport {
  /** Overall health derived from individual check results. */
  status: SessionHealthStatus;
  /** Individual check results. */
  checks: SessionHealthCheck[];
  /** Number of checks that did not pass. */
  issueCount: number;
  /** ISO timestamp of when this report was built. */
  timestamp: string;
}

/** How often the health monitor should ideally be run (milliseconds). */
export const HEALTH_REPORT_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------------------
// Individual health checks
// ---------------------------------------------------------------------------

/**
 * Check that a document is currently loaded.
 */
export function checkDocumentLoaded(pdfDoc: unknown): SessionHealthCheck {
  return {
    name: 'document-loaded',
    passed: pdfDoc !== null && pdfDoc !== undefined,
    severity: 'error',
  };
}

/**
 * Check that the current page is within the document's page range.
 */
export function checkPageBounds(page: number, pageCount: number): SessionHealthCheck {
  return {
    name: 'page-bounds',
    passed: page >= 1 && page <= pageCount,
    severity: 'warning',
  };
}

/**
 * Check that the annotation count is below the performance warning threshold.
 */
export function checkAnnotationCount(count: number, threshold: number): SessionHealthCheck {
  return {
    name: 'annotation-count',
    passed: count <= threshold,
    severity: 'warning',
  };
}

// ---------------------------------------------------------------------------
// Report builder
// ---------------------------------------------------------------------------

/**
 * Aggregate individual check results into a single health report.
 *
 * Status rules:
 * - 'healthy'  — all checks pass
 * - 'degraded' — at least one warning-severity check fails, no error failures
 * - 'critical' — at least one error-severity check fails
 */
export function buildHealthReport(checks: SessionHealthCheck[]): SessionHealthReport {
  const failed = checks.filter(c => !c.passed);
  const hasError = failed.some(c => c.severity === 'error');
  const hasWarning = failed.some(c => c.severity === 'warning');

  let status: SessionHealthStatus;
  if (hasError) {
    status = 'critical';
  } else if (hasWarning) {
    status = 'degraded';
  } else {
    status = 'healthy';
  }

  return {
    status,
    checks,
    issueCount: failed.length,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Return true when the report shows a healthy session.
 */
export function isSessionHealthy(report: SessionHealthReport): boolean {
  return report.status === 'healthy';
}
