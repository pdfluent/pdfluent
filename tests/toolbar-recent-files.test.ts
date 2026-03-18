// SPDX-License-Identifier: AGPL-3.0-or-later
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

  it("renders a recent-files dropdown and opens selected entries", () => {
    expect(toolbarSource).toContain("aria-label=\"Open recent file\"");
    expect(toolbarSource).toContain("recentFiles.map((path) => (");
    expect(toolbarSource).toContain("onOpenRecentFile(path);");
    expect(toolbarSource).toContain("path.split(\"/\").pop() ?? path");
    expect(toolbarSource).toContain("Clear recent files");
    expect(toolbarSource).toContain("onClick={onClearRecentFiles}");
  });
});
