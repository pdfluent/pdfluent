// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.
import { useState } from "react";
import type {
  EnterprisePolicies,
  EnterpriseRole,
  EnterpriseSettings,
} from "../lib/enterprise";
import type { AuditEntry } from "../lib/audit-log";

interface AdminPanelProps {
  settings: EnterpriseSettings;
  auditEntries: AuditEntry[];
  disabled: boolean;
  onAddUser: (email: string, role: EnterpriseRole) => void;
  onRemoveUser: (userId: string) => void;
  onChangeUserRole: (userId: string, role: EnterpriseRole) => void;
  onUpdatePolicies: (policies: Partial<EnterprisePolicies>) => void;
  onSetActiveStorage: (profileId: string) => void;
  onRevokeApiKey: (keyId: string) => void;
}

const roles: EnterpriseRole[] = ["owner", "admin", "member", "viewer"];

export function AdminPanel({
  settings,
  auditEntries,
  disabled,
  onAddUser,
  onRemoveUser,
  onChangeUserRole,
  onUpdatePolicies,
  onSetActiveStorage,
  onRevokeApiKey,
}: AdminPanelProps) {
  const [emailDraft, setEmailDraft] = useState("");
  const [roleDraft, setRoleDraft] = useState<EnterpriseRole>("member");

  return (
    <aside className="admin-panel">
      <div className="admin-panel-header">
        <span>Admin Console</span>
        <span className="admin-panel-badge">Enterprise</span>
      </div>
      <div className="admin-panel-content">
        <section className="admin-section">
          <div className="admin-section-title">Users</div>
          <div className="admin-user-form">
            <input
              className="form-field-input"
              placeholder="name@company.com"
              value={emailDraft}
              onChange={(event) => setEmailDraft(event.target.value)}
              disabled={disabled}
            />
            <select
              className="form-field-input"
              value={roleDraft}
              onChange={(event) => setRoleDraft(event.target.value as EnterpriseRole)}
              disabled={disabled}
            >
              {roles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <button
              className="toolbar-btn"
              disabled={disabled || emailDraft.trim().length === 0}
              onClick={() => {
                onAddUser(emailDraft.trim(), roleDraft);
                setEmailDraft("");
              }}
            >
              Add user
            </button>
          </div>
          <div className="admin-list">
            {settings.users.length === 0 && (
              <div className="admin-muted">No users configured.</div>
            )}
            {settings.users.map((user) => (
              <div className="admin-list-item" key={user.id}>
                <span className="admin-item-label">{user.email}</span>
                <select
                  className="form-field-input"
                  value={user.role}
                  onChange={(event) =>
                    onChangeUserRole(user.id, event.target.value as EnterpriseRole)
                  }
                  disabled={disabled}
                >
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <button
                  className="toolbar-btn"
                  onClick={() => onRemoveUser(user.id)}
                  disabled={disabled}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-section">
          <div className="admin-section-title">Policies</div>
          <label className="form-field-checkbox">
            <input
              type="checkbox"
              checked={settings.policies.requireMfa}
              disabled={disabled}
              onChange={(event) =>
                onUpdatePolicies({ requireMfa: event.target.checked })
              }
            />
            <span>Require MFA</span>
          </label>
          <label className="form-field-checkbox">
            <input
              type="checkbox"
              checked={settings.policies.allowExternalSharing}
              disabled={disabled}
              onChange={(event) =>
                onUpdatePolicies({ allowExternalSharing: event.target.checked })
              }
            />
            <span>Allow external sharing</span>
          </label>
          <label className="form-field-checkbox">
            <input
              type="checkbox"
              checked={settings.policies.allowOfflineExport}
              disabled={disabled}
              onChange={(event) =>
                onUpdatePolicies({ allowOfflineExport: event.target.checked })
              }
            />
            <span>Allow offline export</span>
          </label>
          <div className="admin-inline-input">
            <span>Retention days</span>
            <input
              className="form-field-input"
              type="number"
              min={1}
              max={3650}
              value={settings.policies.retentionDays}
              disabled={disabled}
              onChange={(event) =>
                onUpdatePolicies({
                  retentionDays: Math.max(
                    1,
                    Math.min(3650, Number.parseInt(event.target.value, 10) || 365),
                  ),
                })
              }
            />
          </div>
        </section>

        <section className="admin-section">
          <div className="admin-section-title">Storage Profiles</div>
          <div className="admin-list">
            {settings.storageProfiles.length === 0 && (
              <div className="admin-muted">No BYOS/managed profile configured.</div>
            )}
            {settings.storageProfiles.map((profile) => (
              <div className="admin-list-item" key={profile.id}>
                <span className="admin-item-label">
                  {profile.name} ({profile.kind})
                </span>
                <button
                  className="toolbar-btn"
                  disabled={disabled || settings.activeStorageProfileId === profile.id}
                  onClick={() => onSetActiveStorage(profile.id)}
                >
                  {settings.activeStorageProfileId === profile.id ? "Active" : "Set active"}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-section">
          <div className="admin-section-title">API Keys</div>
          <div className="admin-list">
            {settings.apiKeys.length === 0 && (
              <div className="admin-muted">No API keys generated.</div>
            )}
            {settings.apiKeys.map((key) => (
              <div className="admin-list-item" key={key.id}>
                <span className="admin-item-label">
                  {key.label} · {key.prefix}
                </span>
                <button
                  className="toolbar-btn"
                  onClick={() => onRevokeApiKey(key.id)}
                  disabled={disabled || key.revokedAt !== null}
                >
                  {key.revokedAt ? "Revoked" : "Revoke"}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-section">
          <div className="admin-section-title">E-sign Templates</div>
          <div className="admin-list">
            {settings.eSignTemplates.length === 0 && (
              <div className="admin-muted">No e-sign templates configured.</div>
            )}
            {settings.eSignTemplates
              .slice()
              .reverse()
              .slice(0, 8)
              .map((template) => (
                <div className="admin-list-item" key={template.id}>
                  <span className="admin-item-label">
                    {template.name} · every {template.reminderDays}d
                  </span>
                </div>
              ))}
          </div>
        </section>

        <section className="admin-section">
          <div className="admin-section-title">E-sign Requests</div>
          <div className="admin-list">
            {settings.eSignRequests.length === 0 && (
              <div className="admin-muted">No e-sign requests yet.</div>
            )}
            {settings.eSignRequests
              .slice()
              .reverse()
              .slice(0, 12)
              .map((request) => (
                <div className="admin-list-item" key={request.id}>
                  <span className="admin-item-label">
                    {request.recipientEmail} · {request.status} · reminders={request.reminders.length}
                  </span>
                </div>
              ))}
          </div>
        </section>

        <section className="admin-section">
          <div className="admin-section-title">Batch Jobs</div>
          <div className="admin-list">
            {settings.batchJobs.length === 0 && (
              <div className="admin-muted">No batch runs yet.</div>
            )}
            {settings.batchJobs
              .slice()
              .reverse()
              .slice(0, 8)
              .map((job) => (
                <div className="admin-list-item" key={job.id}>
                  <span className="admin-item-label">
                    {job.operation} · {job.successful}/{job.files}
                  </span>
                </div>
              ))}
          </div>
        </section>

        <section className="admin-section">
          <div className="admin-section-title">Audit Trail</div>
          <div className="admin-list">
            {auditEntries.length === 0 && (
              <div className="admin-muted">No audit events yet.</div>
            )}
            {auditEntries
              .slice()
              .reverse()
              .slice(0, 12)
              .map((entry) => (
                <div className="admin-list-item" key={entry.id}>
                  <span className="admin-item-label">
                    {entry.action} · {entry.outcome}
                  </span>
                </div>
              ))}
          </div>
        </section>
      </div>
    </aside>
  );
}
