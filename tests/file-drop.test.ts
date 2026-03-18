// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { describe, expect, it } from "vitest";
import { pickFirstPdfPath } from "../src/lib/file-drop";

describe("file drop helpers", () => {
  it("picks the first PDF path from dropped files", () => {
    expect(
      pickFirstPdfPath([
        "/tmp/readme.txt",
        "/tmp/contract.PDF",
        "/tmp/notes.pdf",
      ]),
    ).toBe("/tmp/contract.PDF");
  });

  it("returns null when no PDF exists", () => {
    expect(pickFirstPdfPath(["/tmp/image.png", "/tmp/data.json"])).toBeNull();
  });

  it("normalizes file:// paths and quoted input", () => {
    expect(
      pickFirstPdfPath([
        "\"file:///Users/jasperdewinter/Documents/Contract%20v2.PDF\"",
      ]),
    ).toBe("/Users/jasperdewinter/Documents/Contract v2.PDF");
  });

  it("accepts pdf path with query/hash suffix", () => {
    expect(
      pickFirstPdfPath(["/tmp/guide.pdf?download=1#preview"]),
    ).toBe("/tmp/guide.pdf?download=1#preview");
  });
});
