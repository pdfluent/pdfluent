// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sidebarSource = readFileSync(
  new URL("../src/components/Sidebar.tsx", import.meta.url),
  "utf8",
);

describe("sidebar width controls", () => {
  it("renders explicit width action buttons", () => {
    expect(sidebarSource).toContain("Decrease thumbnail sidebar width");
    expect(sidebarSource).toContain("Increase thumbnail sidebar width");
    expect(sidebarSource).toContain("onClick={onDecreaseWidth}");
    expect(sidebarSource).toContain("onClick={onIncreaseWidth}");
  });

  it("binds disabled states to width bounds", () => {
    expect(sidebarSource).toContain("disabled={!canDecreaseWidth}");
    expect(sidebarSource).toContain("disabled={!canIncreaseWidth}");
  });
});
