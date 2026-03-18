// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewerSource = readFileSync(
  new URL("../src/components/Viewer.tsx", import.meta.url),
  "utf8",
);
const manipulatorSource = readFileSync(
  new URL("../src/lib/pdf-manipulator.ts", import.meta.url),
  "utf8",
);

describe("extended annotation parity", () => {
  it("handles new annotation tools in viewer pointer workflow", () => {
    expect(viewerSource).toContain("annotationTool === \"free_text\"");
    expect(viewerSource).toContain("annotationTool === \"stamp\"");
    expect(viewerSource).toContain("annotationTool === \"underline\"");
    expect(viewerSource).toContain("annotationTool === \"strikeout\"");
    expect(viewerSource).toContain("annotationTool === \"callout\"");
    expect(viewerSource).toContain("annotationTool === \"measurement\"");
    expect(viewerSource).toContain("type: \"free_text\"");
    expect(viewerSource).toContain("type: \"stamp\"");
    expect(viewerSource).toContain("type: \"underline\"");
    expect(viewerSource).toContain("type: \"strikeout\"");
    expect(viewerSource).toContain("type: \"callout\"");
    expect(viewerSource).toContain("type: \"measurement\"");
  });

  it("supports extra annotation payload variants in pdf manipulator", () => {
    expect(manipulatorSource).toContain("type: \"free_text\";");
    expect(manipulatorSource).toContain("type: \"stamp\";");
    expect(manipulatorSource).toContain("type: \"underline\";");
    expect(manipulatorSource).toContain("type: \"strikeout\";");
    expect(manipulatorSource).toContain("type: \"callout\";");
    expect(manipulatorSource).toContain("type: \"measurement\";");
    expect(manipulatorSource).toContain("payload.type === \"free_text\"");
    expect(manipulatorSource).toContain("payload.type === \"stamp\"");
    expect(manipulatorSource).toContain("payload.type === \"underline\"");
    expect(manipulatorSource).toContain("payload.type === \"strikeout\"");
    expect(manipulatorSource).toContain("payload.type === \"callout\"");
    expect(manipulatorSource).toContain("payload.type === \"measurement\"");
  });
});
