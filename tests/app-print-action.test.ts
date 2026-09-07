// SPDX-License-Identifier: LicenseRef-PDFluent-Proprietary
// Copyright (c) 2026 Innovation Trigger B.V.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/legacy/App.tsx", import.meta.url), "utf8");

describe("print action", () => {
  it("defines print callback with audit and logging", () => {
    expect(appSource).toContain("const printDocument = useCallback(() => {");
    expect(appSource).toContain("window.print();");
    expect(appSource).toContain("recordAudit(\"print_document\", \"success\"");
    expect(appSource).toContain("print_document_start");
    expect(appSource).toContain("print_document_success");
    expect(appSource).toContain("print_document_failure");
  });

  it("wires print callback into toolbar", () => {
    expect(appSource).toContain("onPrintDocument={printDocument}");
  });
});
