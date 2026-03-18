// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calculateFitToWidthScale } from "../src/App";

const toolbarSource = readFileSync(
  new URL("../src/components/Toolbar.tsx", import.meta.url),
  "utf8",
);
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

describe("fit width controls", () => {
  it("renders a dedicated Fit Width button in the toolbar", () => {
    expect(toolbarSource).toContain("onFitWidth");
    expect(toolbarSource).toContain("Fit Width");
  });

  it("wires fit width to continuous mode in app state", () => {
    expect(appSource).toContain("const fitToWidth = useCallback(() => {");
    expect(appSource).toContain('setViewMode("continuous");');
    expect(appSource).toContain("const nextScale = calculateFitToWidthScale({");
    expect(appSource).toContain("setScale(nextScale);");
    expect(appSource).toContain("fit_to_width_applied");
    expect(appSource).toContain("onFitWidth={fitToWidth}");
  });

  it("computes fit width scale from page and layout chrome", () => {
    const scale = calculateFitToWidthScale({
      pageWidthPt: 612,
      viewportWidthPx: 1512,
      sidebarVisible: true,
      sidebarWidthPx: 170,
      formPanelVisible: true,
      hasFormPanel: true,
      adminPanelVisible: false,
    });

    expect(scale).toBeGreaterThan(1.5);
    expect(scale).toBeLessThan(1.7);
  });

  it("clamps fit width scale into safe zoom bounds", () => {
    expect(
      calculateFitToWidthScale({
        pageWidthPt: 100,
        viewportWidthPx: 6000,
        sidebarVisible: false,
        sidebarWidthPx: 0,
        formPanelVisible: false,
        hasFormPanel: false,
        adminPanelVisible: false,
      }),
    ).toBe(5);

    expect(
      calculateFitToWidthScale({
        pageWidthPt: 1200,
        viewportWidthPx: 260,
        sidebarVisible: false,
        sidebarWidthPx: 0,
        formPanelVisible: false,
        hasFormPanel: false,
        adminPanelVisible: false,
      }),
    ).toBe(0.25);
  });
});
