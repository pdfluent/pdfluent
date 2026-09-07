// SPDX-License-Identifier: LicenseRef-PDFluent-Proprietary
// Copyright (c) 2026 Innovation Trigger B.V.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/legacy/App.tsx", import.meta.url), "utf8");

describe("drop open guards", () => {
  it("catches unhandled drop-open failures", () => {
    expect(appSource).toContain("openPdfFromPath(droppedPdfPath, source).catch((error) => {");
    expect(appSource).toContain("drop_pdf_open_unhandled_failure");
    expect(appSource).toContain("recordAudit(\"drop_open_pdf\", \"failure\", { reason, source });");
  });

  it("normalizes tauri drop payload paths before opening", () => {
    expect(appSource).toContain(
      "const paths = Array.isArray(event.payload.paths) ? event.payload.paths : [];",
    );
    expect(appSource).toContain("openDroppedPdf(paths, \"drop_tauri\");");
  });
});
