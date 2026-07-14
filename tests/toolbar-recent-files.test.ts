// SPDX-License-Identifier: LicenseRef-PDFluent-Proprietary
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const toolbarSource = readFileSync(
  new URL("../src/components/Toolbar.tsx", import.meta.url),
  "utf8",
);

describe("toolbar recent files", () => {
  it("declares recent-file props", () => {
    expect(toolbarSource).toContain("recentFiles: string[];");
    expect(toolbarSource).toContain("onOpenRecentFile: (path: string) => void;");
    expect(toolbarSource).toContain("onClearRecentFiles: () => void;");
  });

  it("accepts recent-file props in the component destructuring", () => {
    expect(toolbarSource).toContain("recentFiles: _recentFiles,");
    expect(toolbarSource).toContain("onOpenRecentFile: _onOpenRecentFile,");
    expect(toolbarSource).toContain("onClearRecentFiles: _onClearRecentFiles,");
  });
});
