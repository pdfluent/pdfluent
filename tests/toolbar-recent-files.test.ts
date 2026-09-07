// SPDX-License-Identifier: LicenseRef-PDFluent-Proprietary
// Copyright (c) 2026 Innovation Trigger B.V.

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

  it("accepts the complete typed props object without requiring unused aliases", () => {
    expect(toolbarSource).toContain(
      "export function Toolbar(props: ToolbarProps)",
    );
  });
});
