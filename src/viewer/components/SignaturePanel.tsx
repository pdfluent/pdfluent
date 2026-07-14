// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// =============================================================================
// SignaturePanel — sign + verify digital signatures
//
// Lives in the RightContextPanel when Sign mode is active. Reuses the
// .contextpanel-* primitive family so it reads as part of the same
// surface as the other mode-specific panels. Replaces the previous
// text-[9px] / text-[10px] mini-font hierarchy with proper scale.
// =============================================================================

import { isTauriRuntime } from '../../lib/tauri-detection';
import { useEffect, useState } from 'react';
import { CheckCircleIcon, HelpCircleIcon, XCircleIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTaskQueueContext } from '../context/TaskQueueContext';
import type { PdfDocument } from '../../core/document';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SignatureResult {
  field_name: string;
  signer: string | null;
  timestamp: string | null;
  status: string;
  valid: boolean;
}

interface SignaturePanelProps {
  pdfDoc: PdfDocument | null;
}

const isTauri = isTauriRuntime();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatusIcon({ valid, status }: { valid: boolean; status: string }) {
  if (status === 'unknown') {
    return (
      <HelpCircleIcon
        className="signature-status-icon signature-status-icon-unknown"
        aria-hidden="true"
      />
    );
  }
  if (valid) {
    return (
      <CheckCircleIcon
        className="signature-status-icon signature-status-icon-valid"
        aria-hidden="true"
      />
    );
  }
  return (
    <XCircleIcon
      className="signature-status-icon signature-status-icon-invalid"
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SignaturePanel({ pdfDoc }: SignaturePanelProps) {
  const { t } = useTranslation();
  const { push, update } = useTaskQueueContext();

  const [certPath, setCertPath] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [signing, setSigning] = useState(false);

  const [signatures, setSignatures] = useState<SignatureResult[]>([]);
  const [verifying, setVerifying] = useState(false);

  // Verify signatures whenever the document changes.
  useEffect(() => {
    if (!pdfDoc || !isTauri) {
      setSignatures([]);
      return;
    }
    setVerifying(true);
    import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke<SignatureResult[]>('verify_signatures'))
      .then((results) => {
        setSignatures(results);
      })
      .catch(() => {
        setSignatures([]);
      })
      .finally(() => {
        setVerifying(false);
      });
  }, [pdfDoc]);

  async function handleBrowseCert(): Promise<void> {
    if (!isTauri) return;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({
      filters: [{ name: 'Certificate', extensions: ['p12', 'pfx'] }],
    });
    if (typeof path === 'string') setCertPath(path);
  }

  async function handleSign(): Promise<void> {
    if (!pdfDoc || !isTauri || !certPath || signing) return;
    const { save } = await import('@tauri-apps/plugin-dialog');
    const outputPath = await save({
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (!outputPath) return;

    const taskId = `sign-${Date.now()}`;
    push({
      id: taskId,
      label: t('tasks.signRunning'),
      progress: null,
      status: 'running',
    });
    setSigning(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('sign_pdf', { certPath, password, reason, outputPath });
      update(taskId, { status: 'done', label: t('tasks.signDone') });
      // Re-verify after signing
      const results = await invoke<SignatureResult[]>('verify_signatures');
      setSignatures(results);
    } catch {
      update(taskId, { status: 'error', label: t('tasks.signFailed') });
    } finally {
      setSigning(false);
    }
  }

  const canSign = Boolean(certPath && password && pdfDoc && isTauri && !signing);

  return (
    <div data-testid="signature-panel" className="signature-panel">
      {/* ── Sign section ─────────────────────────────────────────────── */}
      <section className="signature-section">
        <span className="contextpanel-sub-title">
          {t('signature.signSection')}
        </span>

        {/* Certificate picker */}
        <div className="signature-row">
          <label className="signature-label">{t('signature.certFile')}</label>
          <div className="signature-cert-picker">
            <span
              data-testid="cert-path-display"
              className="signature-cert-path"
              title={certPath ?? undefined}
            >
              {certPath ? certPath.split(/[/\\]/).pop() : t('signature.noCert')}
            </span>
            <button
              type="button"
              data-testid="browse-cert-btn"
              onClick={() => {
                void handleBrowseCert();
              }}
              className="contextpanel-action"
            >
              {t('signature.browseCert')}
            </button>
          </div>
        </div>

        {/* Password */}
        <div className="signature-row">
          <label className="signature-label" htmlFor="signature-password">
            {t('signature.password')}
          </label>
          <input
            id="signature-password"
            data-testid="cert-password-input"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
            placeholder={t('signature.password')}
            className="contextpanel-input"
          />
        </div>

        {/* Reason */}
        <div className="signature-row">
          <label className="signature-label" htmlFor="signature-reason">
            {t('signature.reason')}
          </label>
          <input
            id="signature-reason"
            data-testid="sign-reason-input"
            type="text"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
            }}
            placeholder={t('signature.reason')}
            className="contextpanel-input"
          />
        </div>

        <button
          type="button"
          data-testid="sign-btn"
          onClick={() => {
            void handleSign();
          }}
          disabled={!canSign}
          className="contextpanel-action contextpanel-action-primary signature-submit"
        >
          {signing ? t('signature.signing') : t('signature.signBtn')}
        </button>
      </section>

      {/* ── Verify section ───────────────────────────────────────────── */}
      <section className="signature-section">
        <span className="contextpanel-sub-title">
          {t('signature.verifySection')}
        </span>

        {verifying && (
          <p className="signature-loading">{t('common.loading')}</p>
        )}

        {!verifying && signatures.length === 0 && (
          <p data-testid="no-signatures" className="contextpanel-empty">
            {t('signature.noSignatures')}
          </p>
        )}

        {!verifying &&
          signatures.map((sig, i) => (
            <div
              key={i}
              data-testid="signature-item"
              className="signature-item"
              data-valid={sig.valid}
              data-status={sig.status}
            >
              <div className="signature-item-header">
                <StatusIcon valid={sig.valid} status={sig.status} />
                <span className="signature-item-name" title={sig.field_name}>
                  {sig.field_name}
                </span>
                <span className="signature-item-status">
                  {sig.status === 'unknown'
                    ? t('signature.statusUnknown')
                    : sig.valid
                      ? t('signature.statusValid')
                      : t('signature.statusInvalid')}
                </span>
              </div>
              {sig.signer && (
                <span className="signature-item-meta">
                  {t('signature.signer')}: {sig.signer}
                </span>
              )}
              {sig.timestamp && (
                <span className="signature-item-meta">
                  {t('signature.date')}: {sig.timestamp}
                </span>
              )}
            </div>
          ))}
      </section>
    </div>
  );
}
