// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.
import type { StorageProfilePayload } from "./tauri-api";

export type EnterpriseRole = "owner" | "admin" | "member" | "viewer";

export interface EnterpriseUser {
  id: string;
  email: string;
  role: EnterpriseRole;
  active: boolean;
}

export interface EnterprisePolicies {
  requireMfa: boolean;
  allowExternalSharing: boolean;
  allowOfflineExport: boolean;
  retentionDays: number;
}

export interface EnterpriseSsoConfig {
  enabled: boolean;
  provider: "oidc" | "saml";
  issuer: string;
  clientId: string;
  clientSecret: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  redirectUri: string;
  scopes: string;
  audience: string;
  usePkce: boolean;
  samlEntryPoint: string;
  samlCertificate: string;
}

export interface EnterpriseBranding {
  appName: string;
  accentColor: string;
  logoPath: string | null;
}

export interface EnterpriseApiKey {
  id: string;
  label: string;
  prefix: string;
  createdAt: string;
  revokedAt: string | null;
  scopes: string[];
  rateLimitPerMinute: number;
  version: string;
}

export type ESignRequestStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "signed"
  | "declined"
  | "expired"
  | "cancelled";

export interface ESignTemplate {
  id: string;
  name: string;
  subject: string;
  message: string;
  reminderDays: number;
  createdAt: string;
}

export interface ESignReminder {
  id: string;
  sentAt: string;
  channel: "email" | "inapp";
  note: string;
}

export interface ESignRequestRecord {
  id: string;
  documentPath: string;
  recipientEmail: string;
  templateId: string | null;
  subject: string;
  message: string;
  status: ESignRequestStatus;
  createdAt: string;
  updatedAt: string;
  signedAt: string | null;
  lastReminderAt: string | null;
  reminders: ESignReminder[];
}

export interface BatchJobRecord {
  id: string;
  createdAt: string;
  operation: string;
  files: number;
  successful: number;
  failed: number;
}

export interface TeamBackendConfig {
  baseUrl: string;
  workspaceId: string;
  serviceTokenPrefix: string;
  status: "disconnected" | "connected" | "degraded";
  lastSyncAt: string | null;
}

export interface SsoAuthSession {
  id: string;
  provider: "oidc" | "saml";
  state: string;
  nonce: string;
  codeVerifier: string;
  status: "pending" | "completed" | "failed";
  authorizationUrl: string;
  redirectUri: string;
  createdAt: string;
  completedAt: string | null;
}

export type LicenseTier = "pro" | "business" | "enterprise";

export interface LicenseSeat {
  id: string;
  email: string;
  tier: LicenseTier;
  assignedUserId: string | null;
  status: "active" | "revoked" | "expired";
  issuedAt: string;
  revokedAt: string | null;
}

export interface PolicyEnforcementResult {
  allowed: boolean;
  reason: string;
  action: string;
  checkedAt: string;
}

export interface TamperEvidentAuditEntry {
  id: string;
  action: string;
  outcome: "success" | "warning" | "failure";
  payloadJson: string;
  previousHash: string;
  hash: string;
  createdAt: string;
}

export interface BatchPreset {
  id: string;
  name: string;
  operation: string;
  configJson: string;
  createdAt: string;
}

export interface BatchQueueItem {
  id: string;
  presetId: string;
  inputPath: string;
  status: "queued" | "running" | "completed" | "failed";
  attempts: number;
  maxRetries: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BatchExecutionReport {
  id: string;
  presetId: string;
  startedAt: string;
  finishedAt: string;
  total: number;
  completed: number;
  failed: number;
  retried: number;
}

export interface SyncConflictRecord {
  id: string;
  filePath: string;
  baseVersion: string;
  localVersion: string;
  remoteVersion: string;
  resolution: "unresolved" | "keep_local" | "keep_remote" | "merge_manual";
  createdAt: string;
  resolvedAt: string | null;
}

export interface KeyManagementRecord {
  id: string;
  algorithm: "AES-256-GCM";
  status: "active" | "rotated";
  createdAt: string;
  rotatedAt: string | null;
}

export type IntegrationProvider = "microsoft" | "google" | "box";

export interface IntegrationConnection {
  id: string;
  provider: IntegrationProvider;
  accountEmail: string;
  status: "connected" | "expired" | "revoked";
  scopes: string[];
  connectedAt: string;
  lastSyncedAt: string | null;
}

export interface ApiScopeRateLimit {
  scope: string;
  requestsPerMinute: number;
  burst: number;
}

export interface ApiProductProfile {
  version: string;
  docsUrl: string;
  authMode: "api_key" | "oauth2";
  defaultScopes: string[];
  rateLimits: ApiScopeRateLimit[];
}

export interface EnterpriseSettings {
  storageProfiles: StorageProfilePayload[];
  activeStorageProfileId: string | null;
  managedStorageRegion: string | null;
  teamBackend: TeamBackendConfig;
  users: EnterpriseUser[];
  policies: EnterprisePolicies;
  enforcePoliciesServerSide: boolean;
  policyDecisions: PolicyEnforcementResult[];
  licenseSeats: LicenseSeat[];
  sso: EnterpriseSsoConfig;
  ssoSessions: SsoAuthSession[];
  branding: EnterpriseBranding;
  apiProfile: ApiProductProfile;
  apiKeys: EnterpriseApiKey[];
  eSignTemplates: ESignTemplate[];
  eSignRequests: ESignRequestRecord[];
  batchJobs: BatchJobRecord[];
  batchPresets: BatchPreset[];
  batchQueue: BatchQueueItem[];
  batchReports: BatchExecutionReport[];
  tamperAuditTrail: TamperEvidentAuditEntry[];
  syncConflicts: SyncConflictRecord[];
  keyManagement: KeyManagementRecord[];
  integrations: IntegrationConnection[];
}

export interface ManagedStorageRegion {
  id: string;
  label: string;
  region: string;
  endpoint: string;
}

const STORAGE_KEY = "pdfluent:enterprise-settings";

export const managedRegions: ManagedStorageRegion[] = [
  {
    id: "eu-central",
    label: "EU (Frankfurt)",
    region: "eu-central-1",
    endpoint: "https://s3.eu-central-1.amazonaws.com",
  },
  {
    id: "eu-west",
    label: "EU (Ireland)",
    region: "eu-west-1",
    endpoint: "https://s3.eu-west-1.amazonaws.com",
  },
  {
    id: "us-east",
    label: "US East (N. Virginia)",
    region: "us-east-1",
    endpoint: "https://s3.us-east-1.amazonaws.com",
  },
  {
    id: "ap-southeast",
    label: "APAC (Singapore)",
    region: "ap-southeast-1",
    endpoint: "https://s3.ap-southeast-1.amazonaws.com",
  },
];

function createId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${random}`;
}

function defaultSettings(): EnterpriseSettings {
  return {
    storageProfiles: [],
    activeStorageProfileId: null,
    managedStorageRegion: null,
    teamBackend: {
      baseUrl: "",
      workspaceId: "",
      serviceTokenPrefix: "",
      status: "disconnected",
      lastSyncAt: null,
    },
    users: [],
    policies: {
      requireMfa: true,
      allowExternalSharing: false,
      allowOfflineExport: true,
      retentionDays: 365,
    },
    enforcePoliciesServerSide: false,
    policyDecisions: [],
    licenseSeats: [],
    sso: {
      enabled: false,
      provider: "oidc",
      issuer: "",
      clientId: "",
      clientSecret: "",
      authorizationEndpoint: "",
      tokenEndpoint: "",
      redirectUri: "pdfluent://callback",
      scopes: "openid profile email",
      audience: "",
      usePkce: true,
      samlEntryPoint: "",
      samlCertificate: "",
    },
    ssoSessions: [],
    branding: {
      appName: "PDFluent",
      accentColor: "#4a9eff",
      logoPath: null,
    },
    apiProfile: {
      version: "v1",
      docsUrl: "https://docs.pdfluent.dev/api",
      authMode: "api_key",
      defaultScopes: ["documents.read", "documents.write"],
      rateLimits: [
        {
          scope: "documents.read",
          requestsPerMinute: 600,
          burst: 100,
        },
        {
          scope: "documents.write",
          requestsPerMinute: 240,
          burst: 40,
        },
      ],
    },
    apiKeys: [],
    eSignTemplates: [],
    eSignRequests: [],
    batchJobs: [],
    batchPresets: [],
    batchQueue: [],
    batchReports: [],
    tamperAuditTrail: [],
    syncConflicts: [],
    keyManagement: [
      {
        id: createId("kms"),
        algorithm: "AES-256-GCM",
        status: "active",
        createdAt: new Date().toISOString(),
        rotatedAt: null,
      },
    ],
    integrations: [],
  };
}

export function loadEnterpriseSettings(): EnterpriseSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return defaultSettings();
    }
    const defaults = defaultSettings();
    const partial = parsed as Partial<EnterpriseSettings>;
    return {
      ...defaults,
      ...partial,
      teamBackend: {
        ...defaults.teamBackend,
        ...partial.teamBackend,
      },
      policies: {
        ...defaults.policies,
        ...partial.policies,
      },
      sso: {
        ...defaults.sso,
        ...partial.sso,
      },
      branding: {
        ...defaults.branding,
        ...partial.branding,
      },
      apiProfile: {
        ...defaults.apiProfile,
        ...partial.apiProfile,
        defaultScopes:
          partial.apiProfile?.defaultScopes ?? defaults.apiProfile.defaultScopes,
        rateLimits:
          partial.apiProfile?.rateLimits ?? defaults.apiProfile.rateLimits,
      },
    };
  } catch {
    return defaultSettings();
  }
}

export function saveEnterpriseSettings(settings: EnterpriseSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function upsertStorageProfile(
  settings: EnterpriseSettings,
  profile: StorageProfilePayload,
): EnterpriseSettings {
  const existing = settings.storageProfiles.filter((item) => item.id !== profile.id);
  return {
    ...settings,
    storageProfiles: [...existing, profile],
  };
}

export function createManagedProfile(
  id: string,
  name: string,
  bucket: string,
  accessKeyId: string,
  secretAccessKey: string,
  regionId: string,
): StorageProfilePayload {
  const region = managedRegions.find((candidate) => candidate.id === regionId);
  if (!region) {
    throw new Error(`Unknown managed region: ${regionId}`);
  }

  return {
    id,
    name,
    kind: "managed_s3",
    bucket,
    region: region.region,
    endpoint: region.endpoint,
    access_key_id: accessKeyId,
    secret_access_key: secretAccessKey,
  };
}

export function setActiveStorageProfile(
  settings: EnterpriseSettings,
  profileId: string | null,
): EnterpriseSettings {
  return {
    ...settings,
    activeStorageProfileId: profileId,
  };
}

export function addEnterpriseUser(
  settings: EnterpriseSettings,
  email: string,
  role: EnterpriseRole,
): EnterpriseSettings {
  const user: EnterpriseUser = {
    id: createId("user"),
    email,
    role,
    active: true,
  };
  return {
    ...settings,
    users: [...settings.users, user],
  };
}

export function removeEnterpriseUser(
  settings: EnterpriseSettings,
  userId: string,
): EnterpriseSettings {
  return {
    ...settings,
    users: settings.users.filter((user) => user.id !== userId),
  };
}

export function updateUserRole(
  settings: EnterpriseSettings,
  userId: string,
  role: EnterpriseRole,
): EnterpriseSettings {
  return {
    ...settings,
    users: settings.users.map((user) =>
      user.id === userId ? { ...user, role } : user,
    ),
  };
}

export function updateEnterprisePolicies(
  settings: EnterpriseSettings,
  policies: Partial<EnterprisePolicies>,
): EnterpriseSettings {
  return {
    ...settings,
    policies: {
      ...settings.policies,
      ...policies,
    },
  };
}

export function updateSsoConfig(
  settings: EnterpriseSettings,
  config: Partial<EnterpriseSsoConfig>,
): EnterpriseSettings {
  return {
    ...settings,
    sso: {
      ...settings.sso,
      ...config,
    },
  };
}

export function updateBranding(
  settings: EnterpriseSettings,
  branding: Partial<EnterpriseBranding>,
): EnterpriseSettings {
  return {
    ...settings,
    branding: {
      ...settings.branding,
      ...branding,
    },
  };
}

export function createApiKey(
  settings: EnterpriseSettings,
  label: string,
  scopes: string[] = settings.apiProfile.defaultScopes,
  rateLimitPerMinute?: number,
): { settings: EnterpriseSettings; token: string } {
  const id = createId("api");
  const random = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const token = `pfl_${id}_${random}`;
  const resolvedRateLimit =
    rateLimitPerMinute ??
    Math.max(
      1,
      ...settings.apiProfile.rateLimits.map((limit) => limit.requestsPerMinute),
    );
  const key: EnterpriseApiKey = {
    id,
    label,
    prefix: token.slice(0, 12),
    createdAt: new Date().toISOString(),
    revokedAt: null,
    scopes,
    rateLimitPerMinute: resolvedRateLimit,
    version: settings.apiProfile.version,
  };

  return {
    settings: {
      ...settings,
      apiKeys: [...settings.apiKeys, key],
    },
    token,
  };
}

export function revokeApiKey(
  settings: EnterpriseSettings,
  keyId: string,
): EnterpriseSettings {
  return {
    ...settings,
    apiKeys: settings.apiKeys.map((key) =>
      key.id === keyId ? { ...key, revokedAt: new Date().toISOString() } : key,
    ),
  };
}

export function createESignTemplate(
  settings: EnterpriseSettings,
  name: string,
  subject: string,
  message: string,
  reminderDays: number,
): EnterpriseSettings {
  const template: ESignTemplate = {
    id: createId("esign_tpl"),
    name,
    subject,
    message,
    reminderDays: Math.max(1, Math.min(30, Math.round(reminderDays))),
    createdAt: new Date().toISOString(),
  };

  return {
    ...settings,
    eSignTemplates: [...settings.eSignTemplates, template].slice(-100),
  };
}

export function createESignRequest(
  settings: EnterpriseSettings,
  payload: {
    documentPath: string;
    recipientEmail: string;
    templateId?: string | null;
    subject: string;
    message: string;
    status?: ESignRequestStatus;
  },
): { settings: EnterpriseSettings; request: ESignRequestRecord } {
  const timestamp = new Date().toISOString();
  const request: ESignRequestRecord = {
    id: createId("esign_req"),
    documentPath: payload.documentPath,
    recipientEmail: payload.recipientEmail,
    templateId: payload.templateId ?? null,
    subject: payload.subject,
    message: payload.message,
    status: payload.status ?? "draft",
    createdAt: timestamp,
    updatedAt: timestamp,
    signedAt: null,
    lastReminderAt: null,
    reminders: [],
  };

  return {
    settings: {
      ...settings,
      eSignRequests: [...settings.eSignRequests, request].slice(-500),
    },
    request,
  };
}

export function updateESignRequestStatus(
  settings: EnterpriseSettings,
  requestId: string,
  status: ESignRequestStatus,
): EnterpriseSettings {
  const now = new Date().toISOString();
  return {
    ...settings,
    eSignRequests: settings.eSignRequests.map((request) =>
      request.id === requestId
        ? {
            ...request,
            status,
            updatedAt: now,
            signedAt: status === "signed" ? now : request.signedAt,
          }
        : request,
    ),
  };
}

export function addESignReminder(
  settings: EnterpriseSettings,
  requestId: string,
  note: string,
  channel: "email" | "inapp" = "email",
): EnterpriseSettings {
  const now = new Date().toISOString();

  return {
    ...settings,
    eSignRequests: settings.eSignRequests.map((request) => {
      if (request.id !== requestId) {
        return request;
      }

      const reminder: ESignReminder = {
        id: createId("esign_reminder"),
        sentAt: now,
        channel,
        note,
      };

      return {
        ...request,
        lastReminderAt: now,
        updatedAt: now,
        reminders: [...request.reminders, reminder].slice(-25),
      };
    }),
  };
}

export function getPendingESignRequests(
  settings: EnterpriseSettings,
): ESignRequestRecord[] {
  return settings.eSignRequests.filter(
    (request) =>
      request.status === "draft" ||
      request.status === "sent" ||
      request.status === "viewed",
  );
}

export function recordBatchJob(
  settings: EnterpriseSettings,
  operation: string,
  files: number,
  successful: number,
  failed: number,
): EnterpriseSettings {
  const nextRecord: BatchJobRecord = {
    id: createId("batch"),
    createdAt: new Date().toISOString(),
    operation,
    files,
    successful,
    failed,
  };

  return {
    ...settings,
    batchJobs: [...settings.batchJobs, nextRecord].slice(-100),
  };
}

export function buildOidcAuthorizationUrl(config: EnterpriseSsoConfig, state: string): string {
  const url = new URL(config.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", config.scopes);
  if (config.audience.trim().length > 0) {
    url.searchParams.set("audience", config.audience);
  }
  url.searchParams.set("state", state);
  return url.toString();
}

function hashString(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function configureTeamBackend(
  settings: EnterpriseSettings,
  payload: {
    baseUrl: string;
    workspaceId: string;
    serviceTokenPrefix: string;
  },
): EnterpriseSettings {
  return {
    ...settings,
    teamBackend: {
      baseUrl: payload.baseUrl.trim(),
      workspaceId: payload.workspaceId.trim(),
      serviceTokenPrefix: payload.serviceTokenPrefix.trim(),
      status: "connected",
      lastSyncAt: settings.teamBackend.lastSyncAt,
    },
  };
}

export function recordTeamBackendSync(
  settings: EnterpriseSettings,
): EnterpriseSettings {
  return {
    ...settings,
    teamBackend: {
      ...settings.teamBackend,
      status: "connected",
      lastSyncAt: new Date().toISOString(),
    },
  };
}

export function createSsoAuthSession(
  settings: EnterpriseSettings,
): { settings: EnterpriseSettings; session: SsoAuthSession } {
  const state = createId("sso_state");
  const nonce = createId("sso_nonce");
  const codeVerifier = createId("sso_pkce");
  const session: SsoAuthSession = {
    id: createId("sso_session"),
    provider: settings.sso.provider,
    state,
    nonce,
    codeVerifier,
    status: "pending",
    authorizationUrl: buildOidcAuthorizationUrl(settings.sso, state),
    redirectUri: settings.sso.redirectUri,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };

  return {
    settings: {
      ...settings,
      ssoSessions: [...settings.ssoSessions, session].slice(-50),
    },
    session,
  };
}

export function completeSsoAuthSession(
  settings: EnterpriseSettings,
  state: string,
  succeeded: boolean,
): EnterpriseSettings {
  const now = new Date().toISOString();
  return {
    ...settings,
    ssoSessions: settings.ssoSessions.map((session) =>
      session.state === state
        ? {
            ...session,
            status: succeeded ? "completed" : "failed",
            completedAt: now,
          }
        : session,
    ),
  };
}

export function issueLicenseSeat(
  settings: EnterpriseSettings,
  email: string,
  tier: LicenseTier,
): EnterpriseSettings {
  const seat: LicenseSeat = {
    id: createId("seat"),
    email: email.trim(),
    tier,
    assignedUserId: null,
    status: "active",
    issuedAt: new Date().toISOString(),
    revokedAt: null,
  };
  return {
    ...settings,
    licenseSeats: [...settings.licenseSeats, seat].slice(-1000),
  };
}

export function revokeLicenseSeat(
  settings: EnterpriseSettings,
  seatId: string,
): EnterpriseSettings {
  const now = new Date().toISOString();
  return {
    ...settings,
    licenseSeats: settings.licenseSeats.map((seat) =>
      seat.id === seatId
        ? { ...seat, status: "revoked", revokedAt: now }
        : seat,
    ),
  };
}

export function evaluatePolicyEnforcement(
  settings: EnterpriseSettings,
  action: string,
  context: { externalShare?: boolean; offlineExport?: boolean } = {},
): { settings: EnterpriseSettings; decision: PolicyEnforcementResult } {
  let allowed = true;
  let reason = "Allowed";

  if (context.externalShare && !settings.policies.allowExternalSharing) {
    allowed = false;
    reason = "External sharing blocked by policy.";
  } else if (context.offlineExport && !settings.policies.allowOfflineExport) {
    allowed = false;
    reason = "Offline export blocked by policy.";
  }

  const decision: PolicyEnforcementResult = {
    allowed,
    reason,
    action,
    checkedAt: new Date().toISOString(),
  };

  return {
    settings: {
      ...settings,
      policyDecisions: [...settings.policyDecisions, decision].slice(-500),
    },
    decision,
  };
}

export function configureApiProductProfile(
  settings: EnterpriseSettings,
  profile: Partial<ApiProductProfile>,
): EnterpriseSettings {
  return {
    ...settings,
    apiProfile: {
      ...settings.apiProfile,
      ...profile,
      defaultScopes:
        profile.defaultScopes ?? settings.apiProfile.defaultScopes,
      rateLimits: profile.rateLimits ?? settings.apiProfile.rateLimits,
    },
  };
}

export function appendTamperAuditEntry(
  settings: EnterpriseSettings,
  action: string,
  outcome: "success" | "warning" | "failure",
  payload: Record<string, unknown> = {},
): EnterpriseSettings {
  const previousHash =
    settings.tamperAuditTrail[settings.tamperAuditTrail.length - 1]?.hash ??
    "00000000";
  const payloadJson = JSON.stringify(payload);
  const hash = hashString(
    `${previousHash}|${action}|${outcome}|${payloadJson}|${new Date().toISOString()}`,
  );
  const entry: TamperEvidentAuditEntry = {
    id: createId("taudit"),
    action,
    outcome,
    payloadJson,
    previousHash,
    hash,
    createdAt: new Date().toISOString(),
  };
  return {
    ...settings,
    tamperAuditTrail: [...settings.tamperAuditTrail, entry].slice(-5000),
  };
}

export function verifyTamperAuditTrail(settings: EnterpriseSettings): boolean {
  let previousHash = "00000000";
  for (const entry of settings.tamperAuditTrail) {
    if (entry.previousHash !== previousHash) {
      return false;
    }
    previousHash = entry.hash;
  }
  return true;
}

export function exportTamperAuditAsSiemJsonl(
  settings: EnterpriseSettings,
): Uint8Array {
  const lines = settings.tamperAuditTrail.map((entry) =>
    JSON.stringify({
      timestamp: entry.createdAt,
      action: entry.action,
      outcome: entry.outcome,
      previous_hash: entry.previousHash,
      hash: entry.hash,
      payload: safeJsonParse(entry.payloadJson),
    }),
  );
  return new TextEncoder().encode(lines.join("\n"));
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function createBatchPreset(
  settings: EnterpriseSettings,
  name: string,
  operation: string,
  config: Record<string, unknown>,
): EnterpriseSettings {
  const preset: BatchPreset = {
    id: createId("batch_preset"),
    name: name.trim(),
    operation: operation.trim(),
    configJson: JSON.stringify(config),
    createdAt: new Date().toISOString(),
  };
  return {
    ...settings,
    batchPresets: [...settings.batchPresets, preset].slice(-200),
  };
}

export function enqueueBatchQueueItem(
  settings: EnterpriseSettings,
  presetId: string,
  inputPath: string,
  maxRetries: number,
): EnterpriseSettings {
  const now = new Date().toISOString();
  const item: BatchQueueItem = {
    id: createId("batch_queue"),
    presetId,
    inputPath,
    status: "queued",
    attempts: 0,
    maxRetries: Math.max(0, Math.min(10, Math.round(maxRetries))),
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
  return {
    ...settings,
    batchQueue: [...settings.batchQueue, item].slice(-5000),
  };
}

export function markBatchQueueItemResult(
  settings: EnterpriseSettings,
  itemId: string,
  succeeded: boolean,
  errorMessage?: string,
): EnterpriseSettings {
  const now = new Date().toISOString();
  return {
    ...settings,
    batchQueue: settings.batchQueue.map((item) => {
      if (item.id !== itemId) return item;
      const attempts = item.attempts + 1;
      const shouldRetry = !succeeded && attempts <= item.maxRetries;
      return {
        ...item,
        attempts,
        status: succeeded ? "completed" : shouldRetry ? "queued" : "failed",
        lastError: succeeded ? null : errorMessage ?? "Unknown error",
        updatedAt: now,
      };
    }),
  };
}

export function addBatchExecutionReport(
  settings: EnterpriseSettings,
  report: Omit<BatchExecutionReport, "id">,
): EnterpriseSettings {
  const nextReport: BatchExecutionReport = {
    id: createId("batch_report"),
    ...report,
  };
  return {
    ...settings,
    batchReports: [...settings.batchReports, nextReport].slice(-500),
  };
}

export function recordSyncConflict(
  settings: EnterpriseSettings,
  payload: Omit<SyncConflictRecord, "id" | "createdAt" | "resolvedAt" | "resolution">,
): EnterpriseSettings {
  const conflict: SyncConflictRecord = {
    id: createId("sync_conflict"),
    filePath: payload.filePath,
    baseVersion: payload.baseVersion,
    localVersion: payload.localVersion,
    remoteVersion: payload.remoteVersion,
    resolution: "unresolved",
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };
  return {
    ...settings,
    syncConflicts: [...settings.syncConflicts, conflict].slice(-1000),
  };
}

export function resolveSyncConflict(
  settings: EnterpriseSettings,
  conflictId: string,
  resolution: "keep_local" | "keep_remote" | "merge_manual",
): EnterpriseSettings {
  const now = new Date().toISOString();
  return {
    ...settings,
    syncConflicts: settings.syncConflicts.map((conflict) =>
      conflict.id === conflictId
        ? { ...conflict, resolution, resolvedAt: now }
        : conflict,
    ),
  };
}

export function rotateKeyManagementKey(
  settings: EnterpriseSettings,
): EnterpriseSettings {
  const now = new Date().toISOString();
  const rotated: KeyManagementRecord[] = settings.keyManagement.map((key) => {
    if (key.status === "active") {
      return {
        ...key,
        status: "rotated",
        rotatedAt: now,
      };
    }
    return key;
  });
  const next: KeyManagementRecord = {
    id: createId("kms"),
    algorithm: "AES-256-GCM",
    status: "active",
    createdAt: now,
    rotatedAt: null,
  };
  return {
    ...settings,
    keyManagement: [...rotated, next].slice(-50),
  };
}

export function connectIntegration(
  settings: EnterpriseSettings,
  provider: IntegrationProvider,
  accountEmail: string,
  scopes: string[],
): EnterpriseSettings {
  const now = new Date().toISOString();
  const connection: IntegrationConnection = {
    id: createId(`int_${provider}`),
    provider,
    accountEmail: accountEmail.trim(),
    status: "connected",
    scopes,
    connectedAt: now,
    lastSyncedAt: null,
  };
  return {
    ...settings,
    integrations: [...settings.integrations.filter((item) => item.provider !== provider), connection],
  };
}

export function disconnectIntegration(
  settings: EnterpriseSettings,
  provider: IntegrationProvider,
): EnterpriseSettings {
  return {
    ...settings,
    integrations: settings.integrations.map((connection) =>
      connection.provider === provider
        ? { ...connection, status: "revoked" }
        : connection,
    ),
  };
}

export function markIntegrationSynced(
  settings: EnterpriseSettings,
  provider: IntegrationProvider,
): EnterpriseSettings {
  const now = new Date().toISOString();
  return {
    ...settings,
    integrations: settings.integrations.map((connection) =>
      connection.provider === provider
        ? { ...connection, lastSyncedAt: now, status: "connected" }
        : connection,
    ),
  };
}
