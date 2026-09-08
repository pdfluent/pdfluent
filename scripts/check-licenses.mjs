// SPDX-License-Identifier: LicenseRef-PDFluent-Proprietary
// Copyright (c) 2026 Innovation Trigger B.V.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const reportPath = path.join(workspaceRoot, "compliance-report.json");

if (!existsSync(reportPath)) {
  console.error(
    "Missing compliance-report.json. Run `npm run compliance:generate` first.",
  );
  process.exit(1);
}

const report = JSON.parse(readFileSync(reportPath, "utf8"));
const legacyEntries = Array.isArray(report.entries) ? report.entries : null;
const externalItems = Array.isArray(report.items) ? report.items : null;

function printEntry(prefix, entry) {
  const source =
    typeof entry.source === "string"
      ? entry.source
      : typeof entry.ecosystem === "string"
        ? entry.ecosystem
        : "unknown";
  console.error(
    `- [${source}] ${entry.name || "unknown"}@${entry.version || "-"} (${entry.license || "unknown"})`,
  );
  if (prefix) {
    console.error(`  reason: ${prefix}`);
  }
}

function printEntriesWithLimit(title, entries, reason, limit = 30) {
  if (entries.length === 0) return;
  console.error(`${title} (${entries.length}):`);
  const preview = entries.slice(0, limit);
  for (const entry of preview) {
    printEntry(reason, entry);
  }
  if (entries.length > preview.length) {
    console.error(
      `- ... and ${entries.length - preview.length} more. See compliance-report.json for full details.`,
    );
  }
}

// A report that skipped a source (cargo metadata failed, say) is not a
// report of the shipped tree; it must not pass, whatever its rows say.
const skippedSources = Array.isArray(report.summary?.skippedSources)
  ? report.summary.skippedSources.map((value) => String(value))
  : [];
if (skippedSources.length > 0) {
  console.error(
    `Incomplete compliance report: not inventoried in this run: ${skippedSources.join(", ")}. ` +
      "Regenerate with the missing toolchain present; a partial report cannot pass.",
  );
  process.exit(2);
}

if (legacyEntries) {
  const blockedEntries = legacyEntries.filter((entry) => entry.policyStatus === "blocked");
  const unknownEntries = legacyEntries.filter((entry) => entry.licenseStatus === "unknown");

  if (blockedEntries.length > 0 || unknownEntries.length > 0) {
    printEntriesWithLimit("Blocked licenses detected", blockedEntries, "");
    printEntriesWithLimit("Unknown licenses detected", unknownEntries, "");

    process.exit(2);
  }

  console.log(
    `License check passed (${legacyEntries.length} entries).`,
  );
  process.exit(0);
}

if (externalItems) {
  const reportPolicy = report.policy ?? {};
  const blockedLicenses = new Set(
    Array.isArray(reportPolicy.blocked_licenses)
      ? reportPolicy.blocked_licenses.map((value) => String(value).toUpperCase())
      : [],
  );
  const unknownPolicy = reportPolicy.unknown_license_policy === "fail";
  const allowManualReview = Boolean(reportPolicy.manual_review_allowed);

  const blockedEntries = [];
  const unknownEntries = [];
  const manualReviewEntries = [];

  for (const item of externalItems) {
    const license = typeof item.license === "string" ? item.license.trim() : "";
    const normalized = license.toUpperCase();
    const isUnknown = normalized.length === 0 || normalized === "UNKNOWN";
    const isBlocked = [...blockedLicenses].some((blocked) => normalized.includes(blocked));
    const needsManualReview =
      item.risk_level === "manual-review" || item.manual_review_required === true;

    if (isBlocked) blockedEntries.push(item);
    if (isUnknown && unknownPolicy) unknownEntries.push(item);
    if (needsManualReview && !allowManualReview && !isUnknown) {
      manualReviewEntries.push(item);
    }
  }

  if (
    blockedEntries.length > 0 ||
    unknownEntries.length > 0 ||
    manualReviewEntries.length > 0
  ) {
    printEntriesWithLimit(
      "Blocked licenses detected",
      blockedEntries,
      "blocked by policy",
    );
    printEntriesWithLimit(
      "Unknown licenses detected",
      unknownEntries,
      "unknown license policy is fail",
    );
    printEntriesWithLimit(
      "Manual review required",
      manualReviewEntries,
      "manual review not allowed by policy",
    );
    process.exit(2);
  }

  console.log(
    `License check passed (${externalItems.length} entries).`,
  );
  process.exit(0);
}

console.error(
  "Unsupported compliance-report.json format. Expected `entries` or `items` array.",
);
process.exit(2);
