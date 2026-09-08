// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { useEffect, useState } from 'react';
import { runtimeAdapterFactory } from '../../platform/runtime/RuntimeAdapterFactory';
import type { PdfEngine } from '../../core/engine/PdfEngine';
import { perfMark } from '../performance/perfMarks';

interface UseEngineResult {
  engine: PdfEngine | null;
  loading: boolean;
  error: string | null;
  /** True when init exceeded the watchdog timeout without resolving. */
  timedOut: boolean;
}

/** Engine init watchdog — if init hasn't resolved by then, surface an error UI. */
const ENGINE_INIT_TIMEOUT_MS = 15_000;

export function useEngine(): UseEngineResult {
  const [engine, setEngine] = useState<PdfEngine | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let createdEngine: PdfEngine | null = null;

    // Watchdog: the dynamic engine-chunk import has been observed to never
    // resolve in some launch contexts. Without this, the user is stuck on an
    // eternal spinner with no error and no way to recover.
    const watchdog = setTimeout(() => {
      if (!cancelled) {
        setTimedOut(true);
        setLoading(false);
      }
    }, ENGINE_INIT_TIMEOUT_MS);

    async function init(): Promise<void> {
      try {
        runtimeAdapterFactory.initialize();
        const e = await runtimeAdapterFactory.createEngineWithRecommendedAdapter();
        const initResult = e.initialize();

        if (cancelled) {
          e.shutdown();
          return;
        }

        createdEngine = e;
        clearTimeout(watchdog);

        if (initResult.success) {
          perfMark('engine_ready');
          setEngine(e);
          setTimedOut(false);
        } else {
          setError(initResult.error.message);
        }
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          clearTimeout(watchdog);
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
      clearTimeout(watchdog);
      createdEngine?.shutdown();
    };
  }, []);

  return { engine, loading, error, timedOut };
}
