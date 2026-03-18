// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.
export type DebugLevel = "debug" | "info" | "warn" | "error";

export interface DebugLogEntry {
  id: string;
  timestamp: string;
  level: DebugLevel;
  event: string;
  details: unknown;
}

type DebugLogContextProvider = () => Record<string, unknown>;

const DEBUG_LOG_KEY = "pdfluent:debug-log";
const MAX_DEBUG_LOG_ENTRIES = 4000;
const DEBUG_SESSION_ID = `dbg_session_${Date.now().toString(36)}_${Math.random()
  .toString(36)
  .slice(2, 10)}`;
let debugLogContextProvider: DebugLogContextProvider | null = null;

function toSerializableDetails(details: unknown): unknown {
  if (details instanceof Error) {
    return {
      name: details.name,
      message: details.message,
      stack: details.stack ?? null,
    };
  }

  try {
    return JSON.parse(
      JSON.stringify(details, (_key, value: unknown) => {
        if (value instanceof Error) {
          return {
            name: value.name,
            message: value.message,
            stack: value.stack ?? null,
          };
        }
        if (typeof value === "bigint") {
          return value.toString();
        }
        return value;
      }),
    );
  } catch {
    return { unserializable: String(details) };
  }
}

function readEntries(): DebugLogEntry[] {
  if (typeof localStorage === "undefined") return [];

  const raw = localStorage.getItem(DEBUG_LOG_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as DebugLogEntry[];
  } catch {
    return [];
  }
}

function writeEntries(entries: DebugLogEntry[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(
    DEBUG_LOG_KEY,
    JSON.stringify(entries.slice(-MAX_DEBUG_LOG_ENTRIES)),
  );
}

function readDebugContextSnapshot(): unknown {
  if (!debugLogContextProvider) {
    return null;
  }

  try {
    return toSerializableDetails(debugLogContextProvider());
  } catch (error) {
    return {
      providerError: String(error),
    };
  }
}

function enrichDetailsWithContext(details: unknown): unknown {
  const context = readDebugContextSnapshot();
  const hasContext = context !== null;

  if (details && typeof details === "object" && !Array.isArray(details)) {
    return {
      ...(details as Record<string, unknown>),
      _sessionId: DEBUG_SESSION_ID,
      ...(hasContext ? { _context: context } : {}),
    };
  }

  return {
    value: details,
    _sessionId: DEBUG_SESSION_ID,
    ...(hasContext ? { _context: context } : {}),
  };
}

function createEntry(
  level: DebugLevel,
  event: string,
  details?: unknown,
): DebugLogEntry {
  const serializableDetails = toSerializableDetails(details ?? null);
  return {
    id: `dbg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    timestamp: new Date().toISOString(),
    level,
    event,
    details: enrichDetailsWithContext(serializableDetails),
  };
}

export function appendDebugLog(
  level: DebugLevel,
  event: string,
  details?: unknown,
): DebugLogEntry {
  const entry = createEntry(level, event, details);
  const entries = readEntries();
  entries.push(entry);
  writeEntries(entries);

  if (level === "error") {
    console.error(`[PDFluent][${event}]`, entry.details);
  } else if (level === "warn") {
    console.warn(`[PDFluent][${event}]`, entry.details);
  } else if (level === "debug") {
    console.debug(`[PDFluent][${event}]`, entry.details);
  } else {
    console.info(`[PDFluent][${event}]`, entry.details);
  }

  return entry;
}

export function listDebugLogs(): DebugLogEntry[] {
  return readEntries();
}

export function clearDebugLogs(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(DEBUG_LOG_KEY);
}

export function getDebugSessionId(): string {
  return DEBUG_SESSION_ID;
}

export function setDebugLogContextProvider(
  provider: DebugLogContextProvider | null,
): void {
  debugLogContextProvider = provider;
}
