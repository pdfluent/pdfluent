// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const toolbarSource = readFileSync(
  new URL("../src/components/Toolbar.tsx", import.meta.url),
  "utf8",
);

describe("e-sign workflow parity", () => {
  it("supports e-sign request, reminder, templates, and status flow actions", () => {
    expect(appSource).toContain("const runESignRequestWorkflow = useCallback(async () => {");
    expect(appSource).toContain("const sendESignReminder = useCallback(async () => {");
    expect(appSource).toContain("const manageESignTemplates = useCallback(async () => {");
    expect(appSource).toContain("const showESignStatus = useCallback(async () => {");
    expect(appSource).toContain("createESignRequest(");
    expect(appSource).toContain("createESignTemplate(");
    expect(appSource).toContain("addESignReminder(");
    expect(appSource).toContain("updateESignRequestStatus(");
    expect(appSource).toContain("recordAudit(\"esign_request_created\"");
    expect(appSource).toContain("recordAudit(\"esign_reminder_sent\"");
  });

  it("surfaces e-sign workflow controls in advanced toolbar menu", () => {
    expect(toolbarSource).toContain("Start e-sign request");
    expect(toolbarSource).toContain("Send e-sign reminder");
    expect(toolbarSource).toContain("Manage e-sign templates");
    expect(toolbarSource).toContain("E-sign status");
  });
});
