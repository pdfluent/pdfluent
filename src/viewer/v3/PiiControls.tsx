// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isTauriRuntime } from '../../lib/tauri-detection';
import type { PiiComponentStatus } from '../../lib/tauri-api';
import {
  groupByKind,
  initialSelection,
  pageNumbers,
  selectAll,
  selectedTexts,
  toggle,
  type PiiCandidate,
  type PiiScan,
} from '../pii/piiReview';

interface PiiRedactReport {
  texts_redacted: number;
  matches_found: number;
}

const DOWNLOAD_NOT_IN_BUILD = 'PII_COMPONENT_DOWNLOAD_NOT_IN_BUILD';

function megabytes(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Find personal data, let the user tick the items to remove, and redact those
 * through the backend, which removes the text from the page content and
 * refuses (changing nothing) if any of it would survive.
 *
 * What is found: IBANs, card numbers, national ID numbers, birth dates, e-mail
 * addresses and phone numbers by checksum and context rules, always. Names and
 * addresses by a language model, only when the user has downloaded that
 * component. Every result is a suggestion: nothing is redacted until the user
 * has ticked it and pressed the button.
 */
export function PiiControls({ onApplied }: { onApplied?: () => void }) {
  const { t } = useTranslation();
  const isTauri = isTauriRuntime();
  const [scan, setScan] = useState<PiiScan | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [component, setComponent] = useState<PiiComponentStatus | null>(null);
  const [useModel, setUseModel] = useState(true);
  const [installing, setInstalling] = useState(false);

  const run = async <T,>(command: string, args?: Record<string, unknown>): Promise<T> => {
    const { invokeCommand: invoke } = await import('../../lib/commandBridge');
    return invoke<T>(command, args);
  };

  const refreshComponent = async (): Promise<void> => {
    try {
      setComponent(await run<PiiComponentStatus>('pii_component_status'));
    } catch {
      // No status means no model offer; the validator layer still works.
      setComponent(null);
    }
  };

  useEffect(() => {
    if (!isTauri) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const { invokeCommand: invoke } = await import('../../lib/commandBridge');
        const status = await invoke<PiiComponentStatus>('pii_component_status');
        if (!cancelled) setComponent(status);
      } catch {
        // No status means no model offer; the checksum rules still run.
        if (!cancelled) setComponent(null);
      }
    })();
    return () => { cancelled = true; };
  }, [isTauri]);

  const candidates: PiiCandidate[] | null = scan ? scan.candidates : null;
  const modelReady = component !== null && component.offered && component.installed;

  const find = async (): Promise<void> => {
    if (busy || !isTauri) return;
    setBusy(true);
    setMessage(null);
    try {
      const found = await run<PiiScan>('detect_pii', { useModel: modelReady && useModel });
      setScan(found);
      setSelected(initialSelection(found.candidates));
    } catch (error) {
      setMessage(t('editorV3.redact.pii.detectFailed', { message: errorText(error) }));
    } finally {
      setBusy(false);
    }
  };

  const redact = async (): Promise<void> => {
    if (busy || !isTauri || !candidates) return;
    const texts = selectedTexts(candidates, selected);
    if (texts.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const report = await run<PiiRedactReport>('redact_pii', { texts });
      setScan(null);
      setSelected(new Set());
      setMessage(t('editorV3.redact.pii.done', { count: report.texts_redacted }));
      onApplied?.();
    } catch (error) {
      setMessage(t('editorV3.redact.pii.failed', { message: errorText(error) }));
    } finally {
      setBusy(false);
    }
  };

  const install = async (): Promise<void> => {
    if (!component || installing) return;
    setInstalling(true);
    setMessage(null);
    try {
      await run<void>('install_pii_component', {
        consentTextVersion: component.consent_text_version,
        consented: true,
      });
      await refreshComponent();
    } catch (error) {
      const text = errorText(error);
      setMessage(
        text.includes(DOWNLOAD_NOT_IN_BUILD)
          ? t('editorV3.redact.pii.model.notInBuild')
          : t('editorV3.redact.pii.model.downloadFailed', { message: text }),
      );
    } finally {
      setInstalling(false);
    }
  };

  const remove = async (): Promise<void> => {
    try {
      setComponent(await run<PiiComponentStatus>('remove_pii_component'));
    } catch (error) {
      setMessage(t('editorV3.redact.pii.model.removeFailed', { message: errorText(error) }));
    }
  };

  const count = candidates ? selectedTexts(candidates, selected).length : 0;
  const modelFailed = scan?.model.state === 'failed' ? scan.model.code : null;
  const modelUsed = scan?.model.state === 'used';

  return (
    <div data-testid="pii-controls" style={{ marginBottom: 16 }}>
      <div className="panel-section-label">{t('editorV3.redact.pii.title')}</div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px' }}>{t('editorV3.redact.pii.lede')}</p>

      {component?.offered && !component.installed && component.platform_supported && (
        <div data-testid="pii-model-offer" style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 8, marginBottom: 8, fontSize: 11 }}>
          <div className="panel-section-label">{t('editorV3.redact.pii.model.consentTitle')}</div>
          <p style={{ margin: '0 0 6px' }}>
            {t('editorV3.redact.pii.model.consentBody', { size: megabytes(component.total_size), host: component.host })}
          </p>
          <ul style={{ margin: '0 0 6px', paddingLeft: 16 }}>
            {component.files.map(f => (
              <li key={f.path}>{f.path} · {megabytes(f.size)}</li>
            ))}
          </ul>
          <p style={{ margin: '0 0 6px', color: 'var(--text-muted)' }}>
            {component.notices.map(n => `${n.name} ${n.version} · ${n.license}`.trim()).join(' · ')}
          </p>
          <button
            type="button"
            className="btn-ghost"
            data-testid="pii-model-download"
            onClick={() => { void install(); }}
            disabled={installing}
            style={{ width: '100%' }}
          >
            {installing ? t('editorV3.redact.pii.model.downloading') : t('editorV3.redact.pii.model.download')}
          </button>
        </div>
      )}

      {modelReady && component && (
        <div data-testid="pii-model-ready" style={{ fontSize: 11, marginBottom: 8 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={useModel} onChange={() => { setUseModel(v => !v); }} />
            <span>{t('editorV3.redact.pii.model.use')}</span>
          </label>
          {component.languages.length > 0 && (
            <span style={{ display: 'block', color: 'var(--text-muted)' }}>
              {t('editorV3.redact.pii.model.languages', { languages: component.languages.join(', ') })}
            </span>
          )}
          <button type="button" className="btn-ghost" onClick={() => { void remove(); }} style={{ marginTop: 4 }}>
            {t('editorV3.redact.pii.model.remove')}
          </button>
        </div>
      )}

      <button
        type="button"
        className="btn-ghost"
        data-testid="pii-find"
        onClick={() => { void find(); }}
        disabled={busy || !isTauri}
        style={{ width: '100%', marginBottom: 8 }}
      >
        {busy && !candidates ? t('editorV3.redact.pii.scanning') : t('editorV3.redact.pii.find')}
      </button>

      {modelFailed && (
        <div role="status" data-testid="pii-model-failed" style={{ fontSize: 11, marginBottom: 8 }}>
          {t('editorV3.redact.pii.model.failed', { code: modelFailed })}
        </div>
      )}

      {candidates && candidates.length === 0 && (
        <div data-testid="pii-none" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('editorV3.redact.pii.none')}</div>
      )}

      {candidates && candidates.length > 0 && (
        <>
          {groupByKind(candidates).map(group => (
            <div key={group.kind} style={{ marginBottom: 8 }}>
              <div className="panel-section-label">{t(`editorV3.redact.pii.kind.${group.kind}`)}</div>
              {group.items.map(item => (
                <label key={`${item.kind}:${item.text}`} data-testid="pii-candidate" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, padding: '2px 0' }}>
                  <input
                    type="checkbox"
                    checked={selected.has(item.text)}
                    onChange={() => { setSelected(prev => toggle(prev, item.text)); }}
                  />
                  <span>
                    <span style={{ wordBreak: 'break-all' }}>{item.text}</span>
                    <span style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)' }}>
                      {t('editorV3.redact.pii.where', { pages: pageNumbers(item.pages), count: item.occurrences })}
                      {' · '}
                      {item.validated
                        ? t('editorV3.redact.pii.source.verified', { detail: item.detail ?? '' })
                        : t('editorV3.redact.pii.source.model', { score: item.score_pct })}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <button type="button" className="btn-ghost" onClick={() => { setSelected(selectAll(candidates)); }}>{t('editorV3.redact.pii.selectAll')}</button>
            <button type="button" className="btn-ghost" onClick={() => { setSelected(new Set()); }}>{t('editorV3.redact.pii.selectNone')}</button>
          </div>
          <button
            type="button"
            className="btn-primary accent"
            data-testid="pii-redact"
            onClick={() => { void redact(); }}
            disabled={busy || count === 0}
            style={{ width: '100%', background: 'var(--danger)', color: '#fff' }}
          >
            {busy ? t('editorV3.redact.pii.redacting') : t('editorV3.redact.pii.redactSelected', { count })}
          </button>
        </>
      )}

      {scan && (
        <p data-testid="pii-caveat" style={{ fontSize: 10, color: 'var(--text-muted)', margin: '6px 0 0' }}>
          {modelUsed ? t('editorV3.redact.pii.suggestionsOnly') : t('editorV3.redact.pii.patternsOnly')}
        </p>
      )}

      {message && <div role="status" data-testid="pii-message" style={{ fontSize: 11, marginTop: 8 }}>{message}</div>}
    </div>
  );
}
