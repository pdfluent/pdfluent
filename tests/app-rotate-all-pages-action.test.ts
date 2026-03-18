// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

describe("rotate all pages action", () => {
  it("defines a dedicated rotate-entire-document callback", () => {
    expect(appSource).toContain("const rotateEntireDocument = useCallback(async () => {");
    expect(appSource).toContain("(bytes) => rotateAllPages(bytes, 90)");
    expect(appSource).toContain("\"rotate_all_pages\"");
  });

  it("wires rotate-all-pages into toolbar props", () => {
    expect(appSource).toContain("onRotateAllPages={() => {");
    expect(appSource).toContain("void rotateEntireDocument();");
  });
});
