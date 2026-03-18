// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

describe("delete page action", () => {
  it("logs delete lifecycle decisions", () => {
    expect(appSource).toContain("delete_page_requested");
    expect(appSource).toContain("delete_page_blocked_no_document");
    expect(appSource).toContain("delete_page_blocked_minimum_pages");
    expect(appSource).toContain("delete_page_cancelled");
    expect(appSource).toContain("delete_page_confirmed");
  });

  it("applies page update callback before docInfo update", () => {
    const mutationStart = appSource.indexOf("const applyDocumentMutation = useCallback(");
    const mutationEnd = appSource.indexOf("const rotateCurrentPage = useCallback(");
    const mutationBlock = appSource.slice(mutationStart, mutationEnd);
    const callbackIndex = mutationBlock.indexOf("onUpdated?.(updatedInfo);");
    const docInfoIndex = mutationBlock.indexOf("setDocInfo(updatedInfo);");

    expect(callbackIndex).toBeGreaterThanOrEqual(0);
    expect(docInfoIndex).toBeGreaterThanOrEqual(0);
    expect(callbackIndex).toBeLessThan(docInfoIndex);
  });

  it("catches rejected delete action invocations from toolbar", () => {
    expect(appSource).toContain("void deleteCurrentPage().catch((err) => {");
    expect(appSource).toContain("delete_page_unhandled_error");
  });
});
