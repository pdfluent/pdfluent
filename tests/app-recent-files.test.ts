// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

describe("recent files", () => {
  it("stores and persists recent file history", () => {
    expect(appSource).toContain("const RECENT_FILES_STORAGE_KEY = \"pdfluent:recent-files\";");
    expect(appSource).toContain("const RECENT_FILES_LIMIT = 10;");
    expect(appSource).toContain("function readRecentFiles(): string[] {");
    expect(appSource).toContain("function recordRecentFile(current: string[], nextPath: string): string[] {");
    expect(appSource).toContain("localStorage.setItem(RECENT_FILES_STORAGE_KEY, JSON.stringify(recentFiles));");
  });

  it("records files on successful open and supports reopening from history", () => {
    expect(appSource).toContain("setRecentFiles((current) => recordRecentFile(current, resolvedPath));");
    expect(appSource).toContain("const openRecentFile = useCallback(");
    expect(appSource).toContain("openPdfFromPath(path, \"recent\")");
    expect(appSource).toContain("recentFiles={recentFiles}");
    expect(appSource).toContain("onOpenRecentFile={openRecentFile}");
    expect(appSource).toContain("const clearRecentFiles = useCallback(() => {");
    expect(appSource).toContain("recent_files_cleared");
    expect(appSource).toContain("onClearRecentFiles={clearRecentFiles}");
  });
});
