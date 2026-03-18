// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tauriApiSource = readFileSync(
  new URL("../src/lib/tauri-api.ts", import.meta.url),
  "utf8",
);
const viewerSource = readFileSync(
  new URL("../src/components/Viewer.tsx", import.meta.url),
  "utf8",
);
const pdfEngineSource = readFileSync(
  new URL("../src-tauri/src/pdf_engine.rs", import.meta.url),
  "utf8",
);

describe("xfa warning parity", () => {
  it("includes xfa metadata in document info contract", () => {
    expect(tauriApiSource).toContain("xfa_detected?: boolean;");
    expect(tauriApiSource).toContain("xfa_rendering_supported?: boolean;");
    expect(tauriApiSource).toContain("xfa_notice?: string | null;");
  });

  it("surfaces xfa warning in viewer", () => {
    expect(viewerSource).toContain("viewer-xfa-warning-banner");
    expect(viewerSource).toContain("docInfo?.xfa_detected");
    expect(viewerSource).toContain("docInfo?.xfa_rendering_supported === false");
  });

  it("detects xfa markers in backend engine", () => {
    expect(pdfEngineSource).toContain("fn detect_xfa_markers(path: &str) -> bool");
    expect(pdfEngineSource).toContain("contains_ascii_case_insensitive(&bytes, b\"/XFA\")");
    expect(pdfEngineSource).toContain("Dynamic XFA forms are not supported in this build");
  });
});

