// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// AI Provider
//
// Core configuration and request layer for the Claude AI integration.
// AI features are opt-in: the user must supply an API key.
// The key is stored in localStorage under AI_STORAGE_KEY.
// No document data is sent to any external service without an explicit
// user action (pressing a button that triggers a request).
// ---------------------------------------------------------------------------

/** Default model — fast and cost-effective for document intelligence tasks. */
export const AI_DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

/** Default max_tokens for AI responses. */
export const AI_MAX_TOKENS_DEFAULT = 1024;

/** localStorage key under which the AI config is persisted. */
export const AI_STORAGE_KEY = 'pdfluent.ai.config';

/** Anthropic Messages API endpoint. */
export const AI_API_ENDPOINT = 'https://api.anthropic.com/v1/messages';

/** Anthropic API version header value. */
export const AI_API_VERSION = '2023-06-01';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AiConfig {
  /** Anthropic API key (sk-ant-...). Empty string when not configured. */
  apiKey: string;
  /** Model identifier to use for requests. */
  model: string;
  /** Maximum tokens to generate per response. */
  maxTokens: number;
}

export interface AiMessage {
  /** Message role in the conversation. */
  role: 'user' | 'assistant';
  /** Text content of the message. */
  content: string;
}

export interface AiResponse {
  /** True when the API returned a successful response. */
  success: boolean;
  /** Generated content (only present on success). */
  content: string;
  /** Human-readable error description (only present on failure). */
  error?: string;
  /** Total tokens used (input + output), when available. */
  tokensUsed?: number;
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

/** Build a default (unconfigured) AiConfig. */
export function makeDefaultAiConfig(): AiConfig {
  return {
    apiKey: '',
    model: AI_DEFAULT_MODEL,
    maxTokens: AI_MAX_TOKENS_DEFAULT,
  };
}

/** Load AI config from localStorage. Returns null when nothing is stored. */
export function loadAiConfig(): AiConfig | null {
  try {
    const stored = localStorage.getItem(AI_STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as AiConfig;
  } catch {
    return null;
  }
}

/** Persist AI config to localStorage. */
export function saveAiConfig(config: AiConfig): void {
  try {
    localStorage.setItem(AI_STORAGE_KEY, JSON.stringify(config));
  } catch { /* ignore write errors */ }
}

/**
 * Return true when the config contains a non-empty API key.
 * Does NOT validate the key against the Anthropic API.
 */
export function isAiConfigured(config: AiConfig): boolean {
  return config.apiKey.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Request helper
// ---------------------------------------------------------------------------

/**
 * Send a messages request to the Anthropic API.
 * Returns { success: false, error, content: '' } on any failure so callers
 * never need to handle exceptions.
 */
export async function makeAiRequest(
  messages: AiMessage[],
  config: AiConfig,
): Promise<AiResponse> {
  try {
    const response = await fetch(AI_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': AI_API_VERSION,
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.maxTokens,
        messages,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      return { success: false, content: '', error: `API fout ${response.status}: ${text}` };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await response.json() as any;
    const content: string = data?.content?.[0]?.text ?? '';
    const tokensUsed: number | undefined =
      data?.usage ? (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0) : undefined;

    return { success: true, content, tokensUsed };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout';
    return { success: false, content: '', error: `AI verzoek mislukt: ${message}` };
  }
}
