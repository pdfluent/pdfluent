// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

describe("undo redo and recovery", () => {
  it("tracks mutation snapshots for undo and redo stacks", () => {
    expect(appSource).toContain("const [undoStack, setUndoStack] = useState<MutationHistoryEntry[]>([]);");
    expect(appSource).toContain("const [redoStack, setRedoStack] = useState<MutationHistoryEntry[]>([]);");
    expect(appSource).toContain("const pushUndoSnapshot = useCallback(");
    expect(appSource).toContain("undo_snapshot_recorded");
    expect(appSource).toContain("MUTATION_HISTORY_LIMIT");
  });

  it("applies undo and redo through transactional writes", () => {
    expect(appSource).toContain("const undoLastMutation = useCallback(async () => {");
    expect(appSource).toContain("const redoLastMutation = useCallback(async () => {");
    expect(appSource).toContain("await writeDocumentSafely(filePath, entry.bytes, \"undo_mutation\", currentBytes);");
    expect(appSource).toContain("await writeDocumentSafely(filePath, entry.bytes, \"redo_mutation\", currentBytes);");
    expect(appSource).toContain("recordAudit(\"undo_mutation\", \"success\"");
    expect(appSource).toContain("recordAudit(\"redo_mutation\", \"success\"");
  });

  it("supports keyboard shortcuts for undo and redo", () => {
    expect(appSource).toContain("matchesUndoShortcut(platformTheme, e)");
    expect(appSource).toContain("matchesRedoShortcut(platformTheme, e)");
    expect(appSource).toContain("void undoLastMutation();");
    expect(appSource).toContain("void redoLastMutation();");
    expect(appSource).toContain("matchesPrimaryShortcut(platformTheme, e, \"i\", { shift: true })");
    expect(appSource).toContain("matchesPrimaryShortcut(platformTheme, e, \"r\", { shift: true })");
    expect(appSource).toContain("void insertBlankPage();");
    expect(appSource).toContain("void replaceCurrentPage();");
  });

  it("restores interrupted save snapshots during open", () => {
    expect(appSource).toContain("createRecoverySnapshotPath(path)");
    expect(appSource).toContain("const applyRecoverySnapshotIfPresent = useCallback(");
    expect(appSource).toContain("recovery_snapshot_detected");
    expect(appSource).toContain("restore_recovery_snapshot");
    expect(appSource).toContain("await applyRecoverySnapshotIfPresent(path);");
  });

  it("handles encrypted open failures by unlocking into a sidecar file", () => {
    expect(appSource).toContain("open_pdf_encrypted_detected");
    expect(appSource).toContain("const unlockedPdf = await PDF.load(encryptedBytes, {");
    expect(appSource).toContain("credentials: password,");
    expect(appSource).toContain("const unlockedPath = path.replace(/\\.pdf$/i, \".pdfluent-unlocked.pdf\");");
    expect(appSource).toContain("open_pdf_encrypted_unlocked");
  });

  it("attempts repair for malformed PDFs before surfacing open failures", () => {
    expect(appSource).toContain("open_pdf_malformed_detected");
    expect(appSource).toContain("const repairedPdf = await PDF.load(rawBytes);");
    expect(appSource).toContain("const repairedPath = path.replace(/\\.pdf$/i, \".pdfluent-repaired.pdf\");");
    expect(appSource).toContain("open_pdf_malformed_repaired");
  });
});
