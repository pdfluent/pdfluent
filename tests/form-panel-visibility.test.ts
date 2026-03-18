// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const toolbarSource = readFileSync(
  new URL("../src/components/Toolbar.tsx", import.meta.url),
  "utf8",
);

describe("form panel visibility", () => {
  it("tracks and persists forms panel visibility preference", () => {
    expect(appSource).toContain("const FORM_PANEL_VISIBLE_STORAGE_KEY = \"pdfluent:form-panel-visible\";");
    expect(appSource).toContain("const [formPanelVisible, setFormPanelVisible] = useState<boolean>(() =>");
    expect(appSource).toContain("form_panel_visibility_changed");
    expect(appSource).toContain("localStorage.setItem(");
    expect(appSource).toContain("FORM_PANEL_VISIBLE_STORAGE_KEY");
  });

  it("wires toolbar toggle and respects form field count", () => {
    expect(appSource).toContain("formFieldCount={formFields.length}");
    expect(appSource).toContain("formPanelVisible={formPanelVisible}");
    expect(appSource).toContain("onToggleFormPanel={toggleFormPanelVisibility}");
    expect(toolbarSource).toContain("Toggle forms panel");
    expect(toolbarSource).toContain("formFieldCount: number;");
    expect(toolbarSource).toContain("formPanelVisible: boolean;");
    expect(toolbarSource).toContain("onToggleFormPanel: () => void;");
  });
});
