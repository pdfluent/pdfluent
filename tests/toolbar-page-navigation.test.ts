// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const toolbarSource = readFileSync(
  new URL("../src/components/Toolbar.tsx", import.meta.url),
  "utf8",
);

describe("toolbar page navigation", () => {
  it("provides previous/next page controls", () => {
    expect(toolbarSource).toContain("First page");
    expect(toolbarSource).toContain("Previous page");
    expect(toolbarSource).toContain("Next page");
    expect(toolbarSource).toContain("Last page");
    expect(toolbarSource).toContain("onGoToPage(0)");
    expect(toolbarSource).toContain("onGoToPage(currentPage - 1)");
    expect(toolbarSource).toContain("onGoToPage(currentPage + 1)");
    expect(toolbarSource).toContain("onGoToPage(pageCount - 1)");
  });

  it("supports direct page input with submit behavior", () => {
    expect(toolbarSource).toContain("aria-label=\"Page number\"");
    expect(toolbarSource).toContain("const [pageInput, setPageInput] = useState");
    expect(toolbarSource).toContain("function submitPageInput(): void {");
    expect(toolbarSource).toContain("onBlur={submitPageInput}");
    expect(toolbarSource).toContain("if (event.key === \"Enter\")");
    expect(toolbarSource).toContain("onGoToPage(nextPage - 1);");
  });
});
