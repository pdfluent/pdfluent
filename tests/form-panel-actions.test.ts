// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const formPanelSource = readFileSync(
  new URL("../src/components/FormPanel.tsx", import.meta.url),
  "utf8",
);

describe("form tooling expansion", () => {
  it("adds and removes form fields through document mutation callbacks", () => {
    expect(appSource).toContain("const addFormField = useCallback(async () => {");
    expect(appSource).toContain("addFormFieldToDocument(bytes, payload)");
    expect(appSource).toContain("\"add_form_field\"");
    expect(appSource).toContain("const removeFormField = useCallback(");
    expect(appSource).toContain("removeFormFieldFromDocument(bytes, fieldName)");
    expect(appSource).toContain("\"remove_form_field\"");
  });

  it("wires form panel actions for add and remove controls", () => {
    expect(formPanelSource).toContain("onAddField: () => Promise<void>;");
    expect(formPanelSource).toContain("onRemoveField: (name: string) => Promise<void>;");
    expect(formPanelSource).toContain("form-panel-action-button");
    expect(formPanelSource).toContain("form-panel-remove-field-button");
    expect(appSource).toContain("onAddField={addFormField}");
    expect(appSource).toContain("onRemoveField={removeFormField}");
  });
});
