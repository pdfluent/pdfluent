// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.
const NETWORK_MODE_KEY = "pdfluent:network-mode";

export type NetworkMode = "offline" | "online";

export function readNetworkMode(): NetworkMode {
  const value = localStorage.getItem(NETWORK_MODE_KEY);
  return value === "online" ? "online" : "offline";
}

export function writeNetworkMode(mode: NetworkMode): void {
  localStorage.setItem(NETWORK_MODE_KEY, mode);
}
