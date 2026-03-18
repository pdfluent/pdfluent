// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useEffect, useState } from 'react';
import { runtimeAdapterFactory } from '../../platform/runtime/RuntimeAdapterFactory';
import type { PdfEngine } from '../../core/engine/PdfEngine';

interface UseEngineResult {
  engine: PdfEngine | null;
  loading: boolean;
  error: string | null;
}

export function useEngine(): UseEngineResult {
  const [engine, setEngine] = useState<PdfEngine | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let createdEngine: PdfEngine | null = null;

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

        if (initResult.success) {
          setEngine(e);
        } else {
          setError(initResult.error.message);
        }
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
      createdEngine?.shutdown();
    };
  }, []);

  return { engine, loading, error };
}
