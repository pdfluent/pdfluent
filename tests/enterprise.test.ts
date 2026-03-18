// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { beforeEach, describe, expect, it } from "vitest";
import {
  addBatchExecutionReport,
  appendTamperAuditEntry,
  addESignReminder,
  addEnterpriseUser,
  completeSsoAuthSession,
  configureApiProductProfile,
  configureTeamBackend,
  connectIntegration,
  createBatchPreset,
  createESignRequest,
  createESignTemplate,
  createSsoAuthSession,
  createApiKey,
  createManagedProfile,
  disconnectIntegration,
  enqueueBatchQueueItem,
  evaluatePolicyEnforcement,
  exportTamperAuditAsSiemJsonl,
  getPendingESignRequests,
  issueLicenseSeat,
  loadEnterpriseSettings,
  markBatchQueueItemResult,
  markIntegrationSynced,
  recordSyncConflict,
  recordTeamBackendSync,
  removeEnterpriseUser,
  resolveSyncConflict,
  rotateKeyManagementKey,
  revokeLicenseSeat,
  revokeApiKey,
  setActiveStorageProfile,
  updateESignRequestStatus,
  updateEnterprisePolicies,
  upsertStorageProfile,
  verifyTamperAuditTrail,
} from "../src/lib/enterprise";
import {
  appendAuditEntry,
  clearAuditEntries,
  exportAuditEntriesAsJsonl,
  listAuditEntries,
} from "../src/lib/audit-log";

class LocalStorageMock {
  private store = new Map<string, string>();

  clear() {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  get length(): number {
    return this.store.size;
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: new LocalStorageMock(),
    writable: true,
    configurable: true,
  });
});

describe("enterprise settings", () => {
  it("loads defaults and updates storage profile state", () => {
    const defaults = loadEnterpriseSettings();
    expect(defaults.storageProfiles).toEqual([]);

    const profile = createManagedProfile(
      "managed_1",
      "Managed EU",
      "company-docs",
      "AKIA_TEST",
      "SECRET_TEST",
      "eu-central",
    );

    const withProfile = upsertStorageProfile(defaults, profile);
    const withActive = setActiveStorageProfile(withProfile, profile.id);

    expect(withActive.storageProfiles).toHaveLength(1);
    expect(withActive.activeStorageProfileId).toBe(profile.id);
    expect(withActive.storageProfiles[0]?.region).toBe("eu-central-1");
  });

  it("handles users, policies, and api keys", () => {
    const defaults = loadEnterpriseSettings();
    const withUser = addEnterpriseUser(defaults, "admin@pdfluent.com", "admin");
    expect(withUser.users).toHaveLength(1);

    const userId = withUser.users[0]?.id ?? "";
    const withPolicies = updateEnterprisePolicies(withUser, {
      requireMfa: true,
      retentionDays: 90,
    });
    expect(withPolicies.policies.retentionDays).toBe(90);

    const apiResult = createApiKey(withPolicies, "CI");
    expect(apiResult.settings.apiKeys).toHaveLength(1);
    expect(apiResult.token.startsWith("pfl_")).toBe(true);

    const keyId = apiResult.settings.apiKeys[0]?.id ?? "";
    const revoked = revokeApiKey(apiResult.settings, keyId);
    expect(revoked.apiKeys[0]?.revokedAt).not.toBeNull();

    const removed = removeEnterpriseUser(revoked, userId);
    expect(removed.users).toHaveLength(0);
  });

  it("tracks e-sign templates, requests, reminders, and status transitions", () => {
    const defaults = loadEnterpriseSettings();
    const withTemplate = createESignTemplate(
      defaults,
      "NDA Template",
      "Please sign NDA",
      "Kindly review and sign this NDA document.",
      3,
    );
    expect(withTemplate.eSignTemplates).toHaveLength(1);

    const requestResult = createESignRequest(withTemplate, {
      documentPath: "/tmp/nda.pdf",
      recipientEmail: "legal@customer.com",
      templateId: withTemplate.eSignTemplates[0]?.id ?? null,
      subject: "Sign NDA",
      message: "Please sign this NDA.",
      status: "sent",
    });
    expect(requestResult.settings.eSignRequests).toHaveLength(1);
    const requestId = requestResult.request.id;

    const withReminder = addESignReminder(
      requestResult.settings,
      requestId,
      "Reminder after 3 days",
    );
    expect(withReminder.eSignRequests[0]?.reminders.length ?? 0).toBe(1);
    expect(getPendingESignRequests(withReminder)).toHaveLength(1);

    const signed = updateESignRequestStatus(withReminder, requestId, "signed");
    expect(getPendingESignRequests(signed)).toHaveLength(0);
    expect(signed.eSignRequests[0]?.signedAt).not.toBeNull();
  });

  it("supports team backend sync, production SSO sessions, and server policy decisions", () => {
    const defaults = loadEnterpriseSettings();
    const configuredBackend = configureTeamBackend(defaults, {
      baseUrl: "https://api.pdfluent.dev",
      workspaceId: "ws_123",
      serviceTokenPrefix: "svc_tok",
    });
    expect(configuredBackend.teamBackend.status).toBe("connected");

    const syncedBackend = recordTeamBackendSync(configuredBackend);
    expect(syncedBackend.teamBackend.lastSyncAt).not.toBeNull();

    const ssoConfigured = {
      ...syncedBackend,
      sso: {
        ...syncedBackend.sso,
        enabled: true,
        provider: "oidc" as const,
        authorizationEndpoint: "https://auth.example.com/authorize",
        tokenEndpoint: "https://auth.example.com/token",
        clientId: "client_123",
        clientSecret: "secret_123",
      },
    };
    const ssoSession = createSsoAuthSession(ssoConfigured);
    expect(ssoSession.session.authorizationUrl).toContain("state=");
    const completed = completeSsoAuthSession(
      ssoSession.settings,
      ssoSession.session.state,
      true,
    );
    expect(completed.ssoSessions[0]?.status).toBe("completed");

    const withSeat = issueLicenseSeat(completed, "owner@pdfluent.com", "enterprise");
    expect(withSeat.licenseSeats).toHaveLength(1);
    const revokedSeat = revokeLicenseSeat(withSeat, withSeat.licenseSeats[0]?.id ?? "");
    expect(revokedSeat.licenseSeats[0]?.status).toBe("revoked");

    const policyEval = evaluatePolicyEnforcement(
      {
        ...revokedSeat,
        policies: {
          ...revokedSeat.policies,
          allowExternalSharing: false,
        },
      },
      "share_document",
      { externalShare: true },
    );
    expect(policyEval.decision.allowed).toBe(false);
    expect(policyEval.settings.policyDecisions).toHaveLength(1);
  });

  it("maintains tamper-evident audit trail and SIEM export format", () => {
    const defaults = loadEnterpriseSettings();
    const withAudit1 = appendTamperAuditEntry(defaults, "open_pdf", "success", {
      file: "/tmp/a.pdf",
    });
    const withAudit2 = appendTamperAuditEntry(withAudit1, "export_pdf", "warning", {
      reason: "policy_check",
    });

    expect(withAudit2.tamperAuditTrail).toHaveLength(2);
    expect(verifyTamperAuditTrail(withAudit2)).toBe(true);

    const siemPayload = new TextDecoder().decode(exportTamperAuditAsSiemJsonl(withAudit2));
    const lines = siemPayload.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("\"action\":\"open_pdf\"");
    expect(lines[1]).toContain("\"previous_hash\"");
  });

  it("handles batch presets/queue/reports, sync conflicts, key rotation, integrations, and api profile", () => {
    const defaults = loadEnterpriseSettings();
    const withPreset = createBatchPreset(defaults, "Rotate 90", "rotate", { degrees: 90 });
    expect(withPreset.batchPresets).toHaveLength(1);

    const withQueueItem = enqueueBatchQueueItem(
      withPreset,
      withPreset.batchPresets[0]?.id ?? "",
      "/tmp/contract.pdf",
      2,
    );
    expect(withQueueItem.batchQueue).toHaveLength(1);
    const queuedId = withQueueItem.batchQueue[0]?.id ?? "";
    const retrying = markBatchQueueItemResult(withQueueItem, queuedId, false, "network");
    expect(retrying.batchQueue[0]?.status).toBe("queued");
    const completed = markBatchQueueItemResult(retrying, queuedId, true);
    expect(completed.batchQueue[0]?.status).toBe("completed");

    const withReport = addBatchExecutionReport(completed, {
      presetId: withPreset.batchPresets[0]?.id ?? "",
      startedAt: "2026-03-04T00:00:00.000Z",
      finishedAt: "2026-03-04T00:01:00.000Z",
      total: 1,
      completed: 1,
      failed: 0,
      retried: 1,
    });
    expect(withReport.batchReports).toHaveLength(1);

    const withConflict = recordSyncConflict(withReport, {
      filePath: "/tmp/contract.pdf",
      baseVersion: "v1",
      localVersion: "v2-local",
      remoteVersion: "v2-remote",
    });
    expect(withConflict.syncConflicts).toHaveLength(1);
    const resolved = resolveSyncConflict(
      withConflict,
      withConflict.syncConflicts[0]?.id ?? "",
      "merge_manual",
    );
    expect(resolved.syncConflicts[0]?.resolution).toBe("merge_manual");

    const rotatedKey = rotateKeyManagementKey(resolved);
    const activeKeys = rotatedKey.keyManagement.filter((key) => key.status === "active");
    expect(activeKeys).toHaveLength(1);
    expect(rotatedKey.keyManagement.length).toBeGreaterThan(1);

    const withIntegration = connectIntegration(
      rotatedKey,
      "microsoft",
      "ops@pdfluent.com",
      ["files.read", "files.write"],
    );
    expect(withIntegration.integrations).toHaveLength(1);
    const syncedIntegration = markIntegrationSynced(withIntegration, "microsoft");
    expect(syncedIntegration.integrations[0]?.lastSyncedAt).not.toBeNull();
    const disconnected = disconnectIntegration(syncedIntegration, "microsoft");
    expect(disconnected.integrations[0]?.status).toBe("revoked");

    const apiConfigured = configureApiProductProfile(disconnected, {
      version: "v2",
      docsUrl: "https://docs.pdfluent.dev/api/v2",
      defaultScopes: ["documents.read"],
      rateLimits: [{ scope: "documents.read", requestsPerMinute: 800, burst: 120 }],
    });
    const apiKeyResult = createApiKey(
      apiConfigured,
      "Workflow Automation",
      ["documents.read"],
      800,
    );
    expect(apiKeyResult.settings.apiKeys[0]?.version).toBe("v2");
    expect(apiKeyResult.settings.apiKeys[0]?.scopes).toEqual(["documents.read"]);
    expect(apiKeyResult.settings.apiKeys[0]?.rateLimitPerMinute).toBe(800);
  });
});

describe("audit trail", () => {
  it("appends and exports jsonl entries", () => {
    clearAuditEntries();
    appendAuditEntry("open_pdf", "success", { pageCount: 3 });
    appendAuditEntry("run_batch_processing", "warning", { failed: 1 });

    const entries = listAuditEntries();
    expect(entries).toHaveLength(2);

    const jsonl = new TextDecoder().decode(exportAuditEntriesAsJsonl());
    const lines = jsonl.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("\"open_pdf\"");
    expect(lines[1]).toContain("\"warning\"");
  });
});
