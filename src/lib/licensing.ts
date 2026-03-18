// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { invoke } from "@tauri-apps/api/core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** License status returned by the Rust backend. */
export interface LicenseStatus {
  /** Whether a valid (non-personal) license is loaded. */
  licensed: boolean;
  /** Human-readable tier name: Personal, Basic, Professional, Enterprise, Archival. */
  tier: string;
  /** Name of the licensee. */
  licensee: string;
  /** Company name. */
  company: string;
  /** Number of seats in the license. */
  seats: number;
  /** Unix timestamp (seconds) when the license was issued. */
  issued_at: number;
  /** Unix timestamp (seconds) when the license expires. */
  expires_at: number;
  /** Path to the license file on disk, if any. */
  license_file_path: string | null;
  /** Whether the license has expired. */
  expired: boolean;
  /** Error message if license validation failed. */
  error: string | null;
}

/** The user's chosen usage mode, persisted in localStorage. */
export type UsageMode = "personal" | "commercial";

// ---------------------------------------------------------------------------
// localStorage keys
// ---------------------------------------------------------------------------

const USAGE_MODE_KEY = "pdfluent:usage-mode";
const FIRST_RUN_KEY = "pdfluent:first-run-completed";

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/** Get the current license status from the backend. */
export async function getLicenseStatus(): Promise<LicenseStatus> {
  return invoke<LicenseStatus>("get_license_status");
}

/** Activate a license from a file path. */
export async function activateLicense(path: string): Promise<LicenseStatus> {
  return invoke<LicenseStatus>("activate_license", { path });
}

/** Deactivate the current license and revert to personal/free mode. */
export async function deactivateLicense(): Promise<LicenseStatus> {
  return invoke<LicenseStatus>("deactivate_license");
}

// ---------------------------------------------------------------------------
// Local persistence helpers
// ---------------------------------------------------------------------------

/** Read the stored usage mode. Returns null if not yet chosen. */
export function getStoredUsageMode(): UsageMode | null {
  const value = localStorage.getItem(USAGE_MODE_KEY);
  if (value === "personal" || value === "commercial") {
    return value;
  }
  return null;
}

/** Persist the chosen usage mode. */
export function setStoredUsageMode(mode: UsageMode): void {
  localStorage.setItem(USAGE_MODE_KEY, mode);
}

/** Check whether the first-run dialog has been completed. */
export function isFirstRunCompleted(): boolean {
  return localStorage.getItem(FIRST_RUN_KEY) === "1";
}

/** Mark the first-run dialog as completed. */
export function markFirstRunCompleted(): void {
  localStorage.setItem(FIRST_RUN_KEY, "1");
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Format a Unix timestamp as a readable date string. */
export function formatLicenseDate(unixSeconds: number): string {
  if (unixSeconds === 0 || unixSeconds >= Number.MAX_SAFE_INTEGER) {
    return "Never";
  }
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
