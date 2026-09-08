// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// The one door to the Rust backend.
//
// Every Tauri command goes through `invokeCommand`, and a command that fails
// leaves three traces: an AppError on screen naming the command and the reason,
// a line in the durable app log, and the original rejection, rethrown so the
// caller still decides what to do next.
//
// Before this module there were 86 call sites reaching `@tauri-apps/api/core`
// themselves, each with its own idea of what a failure meant. Most had none:
// `.catch(() => {})`, or a `console.error` the user never sees. The OCR path is
// the one that shows the cost -- on a machine without the Python bridge,
// `handleRunOcr` logged "OCR runtime unavailable" to a console nobody has open
// and returned, so the button spun once and stopped.
//
// `scripts/quality/no-silent-failures.mjs` keeps it the only door: an import of
// `@tauri-apps/api/core` anywhere else is a `raw-invoke` finding.
// ---------------------------------------------------------------------------

import i18n from '../i18n';
import type { AppError, ErrorSeverity, ErrorTaxonomy } from '../viewer/state/errorCenter';
import { makeAppError } from '../viewer/state/errorCenter';

type Listener = (error: AppError) => void;

type CoreModule = typeof import('@tauri-apps/api/core');

/**
 * The IPC module, imported once. Kept lazy so a browser or test harness never
 * loads it, and kept single so two calls in flight cannot each start their own
 * import of it.
 */
let corePromise: Promise<CoreModule> | null = null;
function core(): Promise<CoreModule> {
  corePromise ??= import('@tauri-apps/api/core');
  return corePromise;
}

const listeners = new Set<Listener>();

/**
 * Listen for failures and visible fallbacks. `ViewerApp` subscribes once and
 * appends what arrives to the error stack, so a command failing inside a hook
 * five levels down still reaches the screen without threading a setter through.
 */
export function subscribeCommandFailures(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Hand an error to every subscriber. A listener that throws must not stop the rest. */
export function publishAppError(error: AppError): void {
  for (const listener of [...listeners]) {
    try {
      listener(error);
    } catch (listenerError) {
      console.error('error listener threw', listenerError);
    }
  }
}

/**
 * Write a line to the durable app log (`~/Library/Logs/com.pdfluent.app/` on
 * macOS, stderr elsewhere). Best effort by design: logging is what we do when
 * something already went wrong, so it must never become the thing that goes
 * wrong next.
 */
export async function logToApp(message: string): Promise<void> {
  try {
    const { invoke } = await core();
    await invoke('frontend_log', { message });
  } catch {
    // Outside Tauri (vitest, a browser harness) there is no backend to log to.
    console.warn('[applog]', message);
  }
}

/** Message text of anything a rejected promise can carry. */
export function describeError(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return i18n.t('errors.unknownError');
}

/**
 * Best-guess taxonomy for a backend message, so support bundles and the error
 * panel can group failures. Wrong guesses cost nothing; the message itself is
 * always shown verbatim underneath.
 */
export function classifyCommandError(command: string, message: string): ErrorTaxonomy {
  const text = message.toLowerCase();
  if (text.includes('permission') || text.includes('denied') || text.includes('sandbox')) {
    return 'tauri_runtime_failure.fs_permission';
  }
  if (text.includes('not compiled') || text.includes('feature') || text.includes('unsupported')) {
    return 'unsupported_feature.not_compiled';
  }
  if (text.includes('no space') || text.includes('disk full')) return 'environment_failure.disk_full';
  if (command.includes('ocr')) return 'environment_failure.ocr_model_missing';
  if (command.includes('sign')) return 'validation_failure.signature_invalid';
  if (command.includes('open') || command.includes('parse')) return 'parser_crash.invalid_object';
  if (command.includes('render')) return 'render_crash.invalid_geometry';
  return 'tauri_runtime_failure.plugin_crash';
}

/**
 * Turn a rejected command into an AppError, publish it and log it.
 *
 * Exported because a few call sites catch their own rejection to add context
 * before it reaches the user; they report through here rather than inventing a
 * second path to the screen.
 */
export function reportCommandFailure(command: string, error: unknown): AppError {
  const message = describeError(error);
  const taxonomy = classifyCommandError(command, message);
  // A feature the build does not carry is not a crash, and saying "did not
  // complete" invites the user to try again at something that cannot work.
  const title = taxonomy === 'unsupported_feature.not_compiled'
    ? i18n.t('fallbacks.featureUnavailableTitle', { feature: command })
    : i18n.t('errors.commandFailedTitle', { command });
  const appError = makeAppError(
    'error',
    title,
    message,
    command,
    taxonomy,
    true,
    'COMMAND_FAILED',
  );
  publishAppError(appError);
  void logToApp(`command ${command} failed: ${message}`);
  return appError;
}

/**
 * Announce that the app did something less than what was asked -- a static XFA
 * write where the interactive commit loop is not compiled in, OCR that cannot
 * start, a feature fenced off in this build.
 *
 * A fallback that says nothing is indistinguishable from a feature that worked,
 * which is the failure this whole module exists to remove. Severity defaults to
 * `warning`: the action did not do what its label promised, but nothing broke.
 */
export function reportFallback(options: {
  source: string;
  title: string;
  message: string;
  code: string;
  taxonomy?: ErrorTaxonomy;
  severity?: ErrorSeverity;
}): AppError {
  const appError = makeAppError(
    options.severity ?? 'warning',
    options.title,
    options.message,
    options.source,
    options.taxonomy ?? 'unsupported_feature.not_compiled',
    false,
    options.code,
  );
  publishAppError(appError);
  void logToApp(`fallback ${options.source}/${options.code}: ${options.message}`);
  return appError;
}

/**
 * Call a Tauri command. On failure the user is told, the log records it, and
 * the rejection is rethrown unchanged so existing call-site handling keeps
 * working.
 */
export async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await core();
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    reportCommandFailure(command, error);
    throw error;
  }
}
