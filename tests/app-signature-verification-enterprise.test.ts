// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

describe("signature verification enterprise reporting", () => {
  it("includes DSS/LTV/timestamp signals in verification summary", () => {
    expect(appSource).toContain("const verifySignatures = useCallback(async () => {");
    expect(appSource).toContain("Timestamp tokens:");
    expect(appSource).toContain("Document timestamps:");
    expect(appSource).toContain("Estimated certificate material:");
    expect(appSource).toContain("DSS present:");
    expect(appSource).toContain("DSS OCSP responses:");
    expect(appSource).toContain("DSS CRLs:");
    expect(appSource).toContain("DSS VRI entries:");
    expect(appSource).toContain("Revocation evidence:");
    expect(appSource).toContain("LTV evidence:");
  });
});
