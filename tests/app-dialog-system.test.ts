// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../src/styles/global.css", import.meta.url), "utf8");

describe("app dialog system", () => {
  it("removes native prompt/confirm/alert usage from app flows", () => {
    expect(appSource).not.toContain("window.prompt(");
    expect(appSource).not.toContain("window.confirm(");
    expect(appSource).not.toContain("window.alert(");
  });

  it("uses centralized async app dialog helpers", () => {
    expect(appSource).toContain("const [appDialogState, setAppDialogState]");
    expect(appSource).toContain("const requestAppDialog = useCallback(");
    expect(appSource).toContain("const promptDialog = useCallback(");
    expect(appSource).toContain("const confirmDialog = useCallback(");
    expect(appSource).toContain("const alertDialog = useCallback(");
    expect(appSource).toContain("resolveAppDialog(");
  });

  it("renders shared app dialog shell with dedicated styles", () => {
    expect(appSource).toContain('className="app-dialog-backdrop"');
    expect(appSource).toContain('className="app-dialog"');
    expect(appSource).toContain('className="app-dialog-actions"');
    expect(cssSource).toContain(".app-dialog-backdrop");
    expect(cssSource).toContain(".app-dialog");
    expect(cssSource).toContain(".app-dialog-input");
  });
});
