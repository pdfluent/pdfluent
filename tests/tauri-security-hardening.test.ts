// SPDX-License-Identifier: LicenseRef-PDFluent-Proprietary
// Copyright (c) 2026 Innovation Trigger B.V.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readRepoFile(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Tauri security hardening", () => {
  it("routes active attachment I/O through backend dialog commands", () => {
    const viewerApp = readRepoFile("src/viewer/ViewerApp.tsx");
    const backend = readRepoFile("src-tauri/src/lib.rs");

    expect(viewerApp).not.toContain("@tauri-apps/plugin-fs");
    expect(viewerApp).toContain("save_attachment_dialog");
    expect(viewerApp).toContain("add_attachment_dialog");
    expect(backend).toContain("fn save_attachment_dialog");
    expect(backend).toContain("fn add_attachment_dialog");
    expect(backend).toContain("ensure_safe_attachment_name");
  });

  it("keeps raw path commands behind the centralized security policy", () => {
    const backend = readRepoFile("src-tauri/src/lib.rs");
    const policy = readRepoFile("src-tauri/src/security.rs");

    expect(backend).toContain("mod security;");
    expect(backend).toContain("validate_pdf_input_path");
    expect(backend).toContain("validate_pdf_output_path");
    expect(backend).toContain("validate_certificate_input_path");
    expect(backend).toContain("validate_output_dir");
    expect(backend).toContain("pick_pdf_dialog");
    expect(backend).toContain("save_pdf_as_dialog");
    expect(policy).toContain("std::fs::canonicalize");
    expect(policy).toContain("symlink_metadata");
    expect(policy).toContain("DANGEROUS_ATTACHMENT_EXTENSIONS");
  });

  it("surfaces active PDF content preflight information to the viewer", () => {
    const engine = readRepoFile("src-tauri/src/pdf_engine.rs");
    const documentEngine = readRepoFile("src/platform/engine/tauri/TauriDocumentEngine.ts");
    const viewerApp = readRepoFile("src/viewer/ViewerApp.tsx");

    expect(engine).toContain("pub struct ActiveContentInfo");
    expect(engine).toContain("fn scan_active_content");
    expect(engine).toContain("b\"JavaScript\"");
    expect(engine).toContain("b\"Launch\"");
    expect(engine).toContain("b\"SubmitForm\"");
    expect(documentEngine).toContain("active_content");
    expect(documentEngine).toContain("activeContent");
    // The preflight detection is preserved in the engine + document model, but
    // the viewer no longer renders an alarming open-time banner: capability
    // decisions (e.g. opening a URI link) are made at the moment of use.
    expect(viewerApp).not.toContain("active-content-warning");
    expect(viewerApp).toContain("autoOpenLinks");
  });
});
