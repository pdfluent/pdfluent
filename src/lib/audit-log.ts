// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.
export type AuditOutcome = "success" | "failure" | "warning";

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  outcome: AuditOutcome;
  metadata?: Record<string, string | number | boolean | null>;
}

const STORAGE_KEY = "pdfluent:audit-log";
const MAX_ENTRIES = 500;

function generateId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `audit_${Date.now()}_${random}`;
}

function parseEntries(raw: string | null): AuditEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => typeof entry === "object" && entry !== null)
      .map((entry) => entry as AuditEntry)
      .filter(
        (entry) =>
          typeof entry.id === "string" &&
          typeof entry.timestamp === "string" &&
          typeof entry.action === "string" &&
          (entry.outcome === "success" ||
            entry.outcome === "failure" ||
            entry.outcome === "warning"),
      );
  } catch {
    return [];
  }
}

function persistEntries(entries: AuditEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
}

export function listAuditEntries(): AuditEntry[] {
  return parseEntries(localStorage.getItem(STORAGE_KEY));
}

export function appendAuditEntry(
  action: string,
  outcome: AuditOutcome,
  metadata?: Record<string, string | number | boolean | null>,
): AuditEntry {
  const nextEntry: AuditEntry = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    action,
    outcome,
    metadata,
  };

  const entries = listAuditEntries();
  entries.push(nextEntry);
  persistEntries(entries);
  return nextEntry;
}

export function exportAuditEntriesAsJsonl(): Uint8Array {
  const lines = listAuditEntries().map((entry) => JSON.stringify(entry));
  return new TextEncoder().encode(lines.join("\n"));
}

export function clearAuditEntries(): void {
  localStorage.removeItem(STORAGE_KEY);
}
