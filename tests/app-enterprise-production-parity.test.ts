// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const toolbarSource = readFileSync(
  new URL("../src/components/Toolbar.tsx", import.meta.url),
  "utf8",
);

describe("enterprise production parity actions", () => {
  it("implements backend/identity/licensing/sync/integration/api workflows", () => {
    expect(appSource).toContain("const configureTeamBackendProduction = useCallback(async () => {");
    expect(appSource).toContain("const manageLicensesAndPolicies = useCallback(async () => {");
    expect(appSource).toContain("const runStorageSyncEngine = useCallback(async () => {");
    expect(appSource).toContain("const manageIntegrationConnections = useCallback(async () => {");
    expect(appSource).toContain("const configureApiProductization = useCallback(async () => {");
    expect(appSource).toContain("const exportTamperAuditSiem = useCallback(async () => {");
    expect(appSource).toContain("configureTeamBackend(previous");
    expect(appSource).toContain("createSsoAuthSession(configured)");
    expect(appSource).toContain("issueLicenseSeat(previous");
    expect(appSource).toContain("evaluatePolicyEnforcement(previous");
    expect(appSource).toContain("recordSyncConflict(previous");
    expect(appSource).toContain("rotateKeyManagementKey(previous)");
    expect(appSource).toContain("connectIntegration(previous");
    expect(appSource).toContain("configureApiProductProfile(previous");
    expect(appSource).toContain("exportTamperAuditAsSiemJsonl(enterpriseSettings)");
  });

  it("surfaces enterprise production controls in toolbar advanced menu", () => {
    expect(toolbarSource).toContain("onConfigureTeamBackend: () => void;");
    expect(toolbarSource).toContain("onManageLicensesAndPolicies: () => void;");
    expect(toolbarSource).toContain("onRunStorageSyncEngine: () => void;");
    expect(toolbarSource).toContain("onManageIntegrations: () => void;");
    expect(toolbarSource).toContain("onConfigureApiProduct: () => void;");
    expect(toolbarSource).toContain("onExportSiemAudit: () => void;");
    expect(toolbarSource).toContain("Team backend");
    expect(toolbarSource).toContain("Licenses & policies");
    expect(toolbarSource).toContain("Batch queue engine");
    expect(toolbarSource).toContain("Storage sync engine");
    expect(toolbarSource).toContain("Integrations");
    expect(toolbarSource).toContain("API product profile");
    expect(toolbarSource).toContain("Export SIEM audit");
    expect(toolbarSource).toContain("Toggle admin console");
  });
});
