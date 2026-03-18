// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const toolbarSource = readFileSync(
  new URL("../src/components/Toolbar.tsx", import.meta.url),
  "utf8",
);

describe("toolbar single-trigger actions", () => {
  it("submits page input with a single navigation callback", () => {
    const submitStart = toolbarSource.indexOf("function submitPageInput(): void {");
    const submitEnd = toolbarSource.indexOf("return (", submitStart);
    const submitBlock = toolbarSource.slice(submitStart, submitEnd);
    const matches = submitBlock.match(/onGoToPage\(nextPage - 1\);/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("invokes sign action only once per click", () => {
    const signStart = toolbarSource.indexOf("\"Sign document\"");
    const signEnd = toolbarSource.indexOf("!hasDocument || isProcessing", signStart);
    const signBlock = toolbarSource.slice(signStart, signEnd);
    const matches = signBlock.match(/void onSignDocument\(\);/g) ?? [];
    expect(matches).toHaveLength(1);
  });
});
