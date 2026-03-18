// SPDX-License-Identifier: AGPL-3.0-or-later
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

  it("renders editable controls with save and cancel actions", () => {
    expect(viewerSource).toContain("viewer-text-inline-editor");
    expect(viewerSource).toContain("viewer-text-inline-input");
    expect(viewerSource).toContain("viewer-text-inline-actions");
    expect(viewerSource).toMatch(/>\s*Save\s*</);
    expect(viewerSource).toMatch(/>\s*Cancel\s*</);
    expect(viewerSource).toContain("text_inline_edit_started");
    expect(viewerSource).toContain("text_inline_edit_submit");
    expect(viewerSource).toContain("text_inline_edit_success");
  });
});
