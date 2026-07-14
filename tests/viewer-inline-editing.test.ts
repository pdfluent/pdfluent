// SPDX-License-Identifier: LicenseRef-PDFluent-Proprietary
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewerSource = readFileSync(
  new URL("../src/components/Viewer.tsx", import.meta.url),
  "utf8",
);

describe("viewer inline text editing", () => {
  it("uses inline editor state and handlers instead of prompt editing", () => {
    expect(viewerSource).toContain(
      "const [inlineEditLine, setInlineEditLine] = useState<EditableTextLine | null>(null);",
    );
    expect(viewerSource).toContain("function openInlineTextEditor(line: EditableTextLine): void {");
    expect(viewerSource).toContain("async function submitInlineTextEditor(): Promise<void> {");
    expect(viewerSource).toContain("const cancelInlineTextEditor = useCallback(");
    expect(viewerSource).not.toContain("window.prompt(");
    expect(viewerSource).not.toContain("window.confirm(");
    expect(viewerSource).not.toContain("window.alert(");
  });

  it("renders in-place input with keyboard submit/cancel and telemetry events", () => {
    // Implementation uses in-place editing (blur-to-submit / Enter-to-submit /
    // Escape-to-cancel) rather than a dialog with explicit Save/Cancel buttons.
    expect(viewerSource).toContain("viewer-text-inline-editor-in-place");
    expect(viewerSource).toContain("viewer-text-edit-hotspot");
    expect(viewerSource).toContain("void submitInlineTextEditor()");
    expect(viewerSource).toContain('cancelInlineTextEditor("user_cancel")');
    expect(viewerSource).toContain("text_inline_edit_started");
    expect(viewerSource).toContain("text_inline_edit_submit");
    expect(viewerSource).toContain("text_inline_edit_success");
  });
});
