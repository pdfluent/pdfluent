// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

describe("app operation logging", () => {
  it("logs lifecycle for document mutations", () => {
    expect(appSource).toContain("document_mutation_start");
    expect(appSource).toContain("document_mutation_success");
    expect(appSource).toContain("document_mutation_failure");
  });

  it("logs lifecycle for form updates and text edits", () => {
    expect(appSource).toContain("form_field_update_start");
    expect(appSource).toContain("form_field_update_success");
    expect(appSource).toContain("form_field_update_failure");
    expect(appSource).toContain("edit_text_line_start");
    expect(appSource).toContain("edit_text_line_success");
    expect(appSource).toContain("edit_text_line_failure");
  });

  it("logs lifecycle for signing flow", () => {
    expect(appSource).toContain("sign_document_start");
    expect(appSource).toContain("sign_document_success");
    expect(appSource).toContain("sign_document_failure");
  });

  it("logs global crash diagnostics and safe-write rollback paths", () => {
    expect(appSource).toContain("window_error");
    expect(appSource).toContain("unhandled_rejection");
    expect(appSource).toContain("safe_write_start");
    expect(appSource).toContain("safe_write_rollback_success");
  });
});
