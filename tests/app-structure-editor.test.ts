// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const toolbarSource = readFileSync(
  new URL("../src/components/Toolbar.tsx", import.meta.url),
  "utf8",
);

describe("document structure editor parity", () => {
  it("implements bookmarks/links/attachments workflows in app", () => {
    expect(appSource).toContain("const manageBookmarksOutlines = useCallback(async () => {");
    expect(appSource).toContain("const manageDocumentLinks = useCallback(async () => {");
    expect(appSource).toContain("const managePdfAttachments = useCallback(async () => {");
    expect(appSource).toContain("const exportDocumentStructure = useCallback(async () => {");
    expect(appSource).toContain("addBookmarkNode(previous, {");
    expect(appSource).toContain("removeBookmarkNode(previous, target.id)");
    expect(appSource).toContain("addDocumentLink(previous, {");
    expect(appSource).toContain("removeDocumentLink(previous, target.id)");
    expect(appSource).toContain("pdf.addAttachment(attachmentName, attachmentBytes)");
    expect(appSource).toContain("exportDocumentStructureAsJson(documentStructure)");
  });

  it("exposes structure editor controls in toolbar advanced menu", () => {
    expect(toolbarSource).toContain("onManageBookmarksOutlines: () => void;");
    expect(toolbarSource).toContain("onManageDocumentLinks: () => void;");
    expect(toolbarSource).toContain("onManageAttachments: () => void;");
    expect(toolbarSource).toContain("onExportDocumentStructure: () => void;");
    expect(toolbarSource).toContain("Bookmarks / outlines");
    expect(toolbarSource).toContain("Links editor");
    expect(toolbarSource).toContain("Attachments editor");
    expect(toolbarSource).toContain("Export structure");
    expect(toolbarSource).toContain("onClick={onManageBookmarksOutlines}");
    expect(toolbarSource).toContain("onClick={onManageDocumentLinks}");
    expect(toolbarSource).toContain("onClick={onManageAttachments}");
    expect(toolbarSource).toContain("onClick={onExportDocumentStructure}");
  });
});
