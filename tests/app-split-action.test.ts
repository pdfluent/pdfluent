// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

describe("split pdf action", () => {
  it("parses split range input into zero-based page ranges", () => {
    expect(appSource).toContain("function parseSplitRangesInput(input: string, totalPages: number): PageRange[] {");
    expect(appSource).toContain("Invalid split range format. Use values like 1-3,4,7-9.");
    expect(appSource).toContain("start: start - 1");
    expect(appSource).toContain("end: end - 1");
  });

  it("opens a dedicated split dialog from the toolbar action", () => {
    expect(appSource).toContain("const [splitDialogOpen, setSplitDialogOpen] = useState(false);");
    expect(appSource).toContain("const openSplitDialog = useCallback(() => {");
    expect(appSource).toContain("setSplitRangesInput(`1-${docInfo.page_count}`);");
    expect(appSource).toContain("setSplitDialogOpen(true);");
    expect(appSource).toContain(
      "if (event.key !== \"Escape\" || documentSaving || signing || loading)",
    );
    expect(appSource).toContain("if (");
    expect(appSource).toContain("splitDialogOpen ||");
    expect(appSource).toContain("signDialogOpen ||");
    expect(appSource).toContain("protectDialogOpen ||");
    expect(appSource).toContain("watermarkDialogOpen");
    expect(appSource).toContain("onSplitPdf={openSplitDialog}");
    expect(appSource).toContain("split_pdf_dialog_opened");
    expect(appSource).toContain("id=\"split-ranges-input\"");
    expect(appSource).toContain("id=\"split-target-directory-input\"");
    expect(appSource).toContain("Split PDF ranges");
  });

  it("splits and writes range outputs to a chosen directory", () => {
    expect(appSource).toContain("const splitDocumentByRanges = useCallback(async () => {");
    expect(appSource).toContain("const pickSplitDirectory = useCallback(async () => {");
    expect(appSource).toContain("directory: true");
    expect(appSource).toContain("const parts = await splitPdf(existingBytes, ranges);");
    expect(appSource).toContain("Choose an output folder for split files.");
    expect(appSource).toContain("split_pdf_validation_failed");
    expect(appSource).toContain("recordAudit(\"split_pdf\", \"success\"");
    expect(appSource).toContain("split_pdf_start");
    expect(appSource).toContain("split_pdf_success");
    expect(appSource).toContain("split_pdf_failure");
    expect(appSource).toContain("targetDirectory: splitTargetDirectory");
    expect(appSource).toContain("setSplitDialogOpen(false);");
  });
});
