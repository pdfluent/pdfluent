// SPDX-License-Identifier: LicenseRef-PDFluent-Proprietary
// Copyright (c) 2026 Innovation Trigger B.V.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const toolbarSource = readFileSync(
  new URL("../src/components/Toolbar.tsx", import.meta.url),
  "utf8",
);

describe("toolbar zoom display", () => {
  it("shows rounded zoom percentage label", () => {
    expect(toolbarSource).toContain("const zoomLabel = `${Math.round(scale * 100)}%`;");
    expect(toolbarSource).toContain("{zoomLabel}");
  });

  it("provides an explicit actual-size reset control", () => {
    expect(toolbarSource).toContain("aria-label=\"Actual size\"");
    expect(toolbarSource).toContain("title=\"Actual size\"");
    expect(toolbarSource).toContain("onClick={onZoomReset}");
  });
});
