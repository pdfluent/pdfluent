// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { useCallback, useEffect, useState } from 'react';
import { getFormScripts, setFormScriptsAllowed } from '../../lib/tauri-api';
import type { FormScriptsStatus } from '../../lib/tauri-api';
import { isTauriRuntime } from '../../lib/tauri-detection';
import { reportCommandFailure } from '../../lib/commandBridge';
import type { AppSettings } from '../state/appSettings';
import {
  decideConsent,
  loadOsFormScriptsPolicy,
  effectiveFormScriptsMode,
  pinnedFormScriptsMode,
  rememberScriptChoice,
} from '../state/scriptConsent';

export interface FormScriptConsent {
  /** The document's scripts, or null when it has none / nothing is open. */
  status: FormScriptsStatus | null;
  /** Whether the bar is showing. */
  asking: boolean;
  busy: boolean;
  /** "Always run scripts" is not offered when a policy pins the choice. */
  alwaysAvailable: boolean;
  runOnce: () => void;
  runAlways: () => void;
  dontRun: () => void;
}

/**
 * Asks, once per opened document, whether its scripts may run -- or does not
 * ask, when Settings or a policy has already decided. The native side holds
 * the permission; this hook only decides when to give it.
 *
 * `onRan` fires after permission was given and the initial scripts ran, so the
 * views can show what they changed.
 */
export function useFormScriptConsent(
  documentId: string | number | null | undefined,
  settings: Pick<AppSettings, 'formScriptsMode'>,
  onSettingChange: (mode: AppSettings['formScriptsMode']) => void,
  onRan: (fieldsChanged: number) => void,
): FormScriptConsent {
  const [status, setStatus] = useState<FormScriptsStatus | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  // Re-rendered once the OS policy has been read, so the bar and the Always
  // button follow it.
  const [, setPolicyRead] = useState(0);
  const pin = pinnedFormScriptsMode();
  const mode = effectiveFormScriptsMode(settings.formScriptsMode, pin);

  const allow = useCallback(
    async (known: FormScriptsStatus): Promise<boolean> => {
      setBusy(true);
      try {
        const outcome = await setFormScriptsAllowed(true);
        setStatus(outcome.status);
        setAsking(false);
        onRan(outcome.report.fieldsChanged);
        return true;
      } catch (err) {
        reportCommandFailure('form_scripts', err);
        setStatus(known);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [onRan],
  );

  useEffect(() => {
    let cancelled = false;
    setAsking(false);
    setStatus(null);
    if (documentId == null || !isTauriRuntime()) return;
    // The OS policy is read first: a pin to Never must win before anything runs.
    void loadOsFormScriptsPolicy()
      .then(() => { if (!cancelled) setPolicyRead(n => n + 1); })
      .then(() => getFormScripts())
      .then(found => {
        const pinned = pinnedFormScriptsMode();
        const effective = effectiveFormScriptsMode(settings.formScriptsMode, pinned);
        if (cancelled || found.total === 0) return;
        setStatus(found);
        if (found.allowed) return;
        const decision = decideConsent(found, effective);
        if (decision === 'ask') setAsking(true);
        else if (decision === 'run') void allow(found);
      })
      .catch(err => {
        if (!cancelled) reportCommandFailure('form_scripts', err);
      });
    return () => {
      cancelled = true;
    };
    // The decision is taken when a document opens (or the mode changes while
    // one is open), not on every render.
  }, [documentId, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const runOnce = useCallback(() => {
    if (!status) return;
    rememberScriptChoice(status.contentHash, 'run');
    void allow(status);
  }, [status, allow]);

  const runAlways = useCallback(() => {
    if (!status) return;
    // The setting follows the permission, so the open-time effect never sees
    // "always" on a document that is not yet allowed and runs it twice.
    void allow(status).then(ok => {
      if (ok) onSettingChange('always');
    });
  }, [status, allow, onSettingChange]);

  const dontRun = useCallback(() => {
    if (status) rememberScriptChoice(status.contentHash, 'skip');
    setAsking(false);
  }, [status]);

  return { status, asking, busy, alwaysAvailable: pin === null, runOnce, runAlways, dontRun };
}
