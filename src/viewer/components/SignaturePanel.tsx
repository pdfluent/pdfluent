// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useState, useEffect } from 'react';
import { CheckCircleIcon, XCircleIcon, HelpCircleIcon } from 'lucide-react';
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

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SignaturePanelProps {
  pdfDoc: PdfDocument | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

function StatusIcon({ valid, status }: { valid: boolean; status: string }) {
  if (status === 'unknown') return <HelpCircleIcon className="w-3 h-3 text-muted-foreground shrink-0" />;
  if (valid) return <CheckCircleIcon className="w-3 h-3 text-green-500 shrink-0" />;
  return <XCircleIcon className="w-3 h-3 text-destructive shrink-0" />;
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
    if (!pdfDoc || !isTauri) { setSignatures([]); return; }
    setVerifying(true);
    import('@tauri-apps/api/core').then(({ invoke }) =>
      invoke<SignatureResult[]>('verify_signatures')
    ).then(results => {
      setSignatures(results);
    }).catch(() => {
      setSignatures([]);
    }).finally(() => {
      setVerifying(false);
    });
  }, [pdfDoc]);

  async function handleBrowseCert(): Promise<void> {
    if (!isTauri) return;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({ filters: [{ name: 'Certificate', extensions: ['p12', 'pfx'] }] });
    if (typeof path === 'string') setCertPath(path);
  }

  async function handleSign(): Promise<void> {
    if (!pdfDoc || !isTauri || !certPath || signing) return;
    const { save } = await import('@tauri-apps/plugin-dialog');
    const outputPath = await save({ filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (!outputPath) return;

    const taskId = `sign-${Date.now()}`;
    push({ id: taskId, label: t('tasks.signRunning'), progress: null, status: 'running' });
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

  return (
    <div data-testid="signature-panel" className="flex flex-col gap-3">

      {/* ── Sign section ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[9px] text-muted-foreground/70 uppercase tracking-wide">{t('signature.signSection')}</span>

        {/* Certificate picker */}
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] text-muted-foreground/70">{t('signature.certFile')}</span>
          <div className="flex gap-1">
            <span
              data-testid="cert-path-display"
              className="flex-1 text-[10px] text-foreground/60 truncate border border-border rounded px-1.5 py-1 bg-card"
            >
              {certPath ? certPath.split(/[/\\]/).pop() : t('signature.noCert')}
            </span>
            <button
              data-testid="browse-cert-btn"
              onClick={() => { void handleBrowseCert(); }}
              className="text-[10px] px-2 py-1 border border-border rounded hover:bg-muted transition-colors shrink-0"
            >
              {t('signature.browseCert')}
            </button>
          </div>
        </div>

        {/* Password */}
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] text-muted-foreground/70">{t('signature.password')}</span>
          <input
            data-testid="cert-password-input"
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); }}
            placeholder={t('signature.password')}
            className="text-[10px] bg-card border border-border rounded px-2 py-1 text-foreground outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Reason */}
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] text-muted-foreground/70">{t('signature.reason')}</span>
          <input
            data-testid="sign-reason-input"
            type="text"
            value={reason}
            onChange={e => { setReason(e.target.value); }}
            placeholder={t('signature.reason')}
            className="text-[10px] bg-card border border-border rounded px-2 py-1 text-foreground outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <button
          data-testid="sign-btn"
          onClick={() => { void handleSign(); }}
          disabled={!certPath || !password || signing || !pdfDoc || !isTauri}
          className="w-full py-1 text-[10px] font-medium rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {signing ? t('signature.signing') : t('signature.signBtn')}
        </button>
      </div>

      {/* ── Verify section ───────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <span className="text-[9px] text-muted-foreground/70 uppercase tracking-wide">{t('signature.verifySection')}</span>

        {verifying && (
          <p className="text-[10px] text-muted-foreground">{t('common.loading')}</p>
        )}

        {!verifying && signatures.length === 0 && (
          <p data-testid="no-signatures" className="text-[10px] text-muted-foreground">{t('signature.noSignatures')}</p>
        )}

        {!verifying && signatures.map((sig, i) => (
          <div
            key={i}
            data-testid="signature-item"
            className="flex flex-col gap-0.5 p-1.5 rounded border border-border bg-card/50 text-[10px]"
          >
            <div className="flex items-center gap-1">
              <StatusIcon valid={sig.valid} status={sig.status} />
              <span className="font-medium text-foreground truncate flex-1">{sig.field_name}</span>
              <span className={`text-[9px] ${sig.valid ? 'text-green-600' : sig.status === 'unknown' ? 'text-muted-foreground' : 'text-destructive'}`}>
                {sig.status === 'unknown' ? t('signature.statusUnknown') : sig.valid ? t('signature.statusValid') : t('signature.statusInvalid')}
              </span>
            </div>
            {sig.signer && (
              <span className="text-muted-foreground">{t('signature.signer')}: {sig.signer}</span>
            )}
            {sig.timestamp && (
              <span className="text-muted-foreground">{t('signature.date')}: {sig.timestamp}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
