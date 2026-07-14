// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Crash channel
//
// A tiny module-level event bus that decouples crash *capture* from crash
// *reporting*. The React ErrorBoundary unmounts its children when it catches,
// so it cannot itself host a dialog reliably; instead it (and the global
// window.onerror / unhandledrejection handlers) publish here, and an
// always-mounted CrashReporter sibling subscribes.
//
// Deliberately framework-free and synchronous: no React, no async, nothing
// that could itself throw during a crash. Captures are queued so an event
// fired before the subscriber mounts is not lost.
// ---------------------------------------------------------------------------

/** A captured, not-yet-reviewed error. message/stack are RAW (unscrubbed). */
export interface CapturedCrash {
  /** Raw error message. Scrubbed later, in buildReport(). */
  message: string;
  /** Raw stack trace, if any. */
  stack?: string | null;
  /** Where it came from — useful only for local debugging, never sent. */
  source: 'react' | 'window.onerror' | 'unhandledrejection' | 'rust';
}

type Listener = (crash: CapturedCrash) => void;

const listeners = new Set<Listener>();
const pending: CapturedCrash[] = [];

/** Publish a captured crash. Queues it if no subscriber is mounted yet. */
export function emitCrash(crash: CapturedCrash): void {
  if (listeners.size === 0) {
    pending.push(crash);
    return;
  }
  for (const listener of listeners) {
    try {
      listener(crash);
    } catch {
      /* a reporting listener must never escalate a crash into a crash */
    }
  }
}

/**
 * Subscribe to crashes. Immediately drains anything queued before mount.
 * Returns an unsubscribe function.
 */
export function onCrash(listener: Listener): () => void {
  listeners.add(listener);

  if (pending.length > 0) {
    const drained = pending.splice(0, pending.length);
    for (const crash of drained) {
      try {
        listener(crash);
      } catch {
        /* ignore */
      }
    }
  }

  return () => {
    listeners.delete(listener);
  };
}
