// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const source = readFileSync(
  new URL('../src/viewer/ai/aiProvider.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('AI provider constants', () => {
  it('exports AI_DEFAULT_MODEL pointing to claude-haiku', () => {
    expect(source).toContain('export const AI_DEFAULT_MODEL');
    expect(source).toContain('claude-haiku');
  });

  it('exports AI_MAX_TOKENS_DEFAULT', () => {
    expect(source).toContain('export const AI_MAX_TOKENS_DEFAULT = 1024');
  });

  it('exports AI_STORAGE_KEY with pdfluent namespace', () => {
    expect(source).toContain("export const AI_STORAGE_KEY = 'pdfluent.ai.config'");
  });

  it('exports AI_API_ENDPOINT pointing to Anthropic', () => {
    expect(source).toContain('export const AI_API_ENDPOINT');
    expect(source).toContain('anthropic.com');
  });

  it('exports AI_API_VERSION', () => {
    expect(source).toContain('export const AI_API_VERSION');
  });
});

// ---------------------------------------------------------------------------
// AiConfig interface
// ---------------------------------------------------------------------------

describe('AiConfig', () => {
  it('declares apiKey field', () => {
    const ifaceStart = source.indexOf('interface AiConfig');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('apiKey: string');
  });

  it('declares model field', () => {
    const ifaceStart = source.indexOf('interface AiConfig');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('model: string');
  });

  it('declares maxTokens field', () => {
    const ifaceStart = source.indexOf('interface AiConfig');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('maxTokens: number');
  });
});

// ---------------------------------------------------------------------------
// AiMessage interface
// ---------------------------------------------------------------------------

describe('AiMessage', () => {
  it('declares role as union type', () => {
    const ifaceStart = source.indexOf('interface AiMessage');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain("role: 'user' | 'assistant'");
  });

  it('declares content field', () => {
    const ifaceStart = source.indexOf('interface AiMessage');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('content: string');
  });
});

// ---------------------------------------------------------------------------
// AiResponse interface
// ---------------------------------------------------------------------------

describe('AiResponse', () => {
  it('declares success boolean', () => {
    const ifaceStart = source.indexOf('interface AiResponse');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('success: boolean');
  });

  it('declares content string', () => {
    const ifaceStart = source.indexOf('interface AiResponse');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('content: string');
  });

  it('declares optional error string', () => {
    const ifaceStart = source.indexOf('interface AiResponse');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('error?: string');
  });

  it('declares optional tokensUsed number', () => {
    const ifaceStart = source.indexOf('interface AiResponse');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('tokensUsed?: number');
  });
});

// ---------------------------------------------------------------------------
// makeDefaultAiConfig
// ---------------------------------------------------------------------------

describe('makeDefaultAiConfig', () => {
  it('exports makeDefaultAiConfig function', () => {
    expect(source).toContain('export function makeDefaultAiConfig()');
  });

  it('sets empty apiKey', () => {
    const fnStart = source.indexOf('export function makeDefaultAiConfig');
    const fnEnd = source.indexOf('\n}', fnStart) + 2;
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain("apiKey: ''");
  });

  it('uses AI_DEFAULT_MODEL', () => {
    const fnStart = source.indexOf('export function makeDefaultAiConfig');
    const fnEnd = source.indexOf('\n}', fnStart) + 2;
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('model: AI_DEFAULT_MODEL');
  });

  it('uses AI_MAX_TOKENS_DEFAULT', () => {
    const fnStart = source.indexOf('export function makeDefaultAiConfig');
    const fnEnd = source.indexOf('\n}', fnStart) + 2;
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('maxTokens: AI_MAX_TOKENS_DEFAULT');
  });
});

// ---------------------------------------------------------------------------
// loadAiConfig / saveAiConfig
// ---------------------------------------------------------------------------

describe('loadAiConfig', () => {
  it('exports loadAiConfig function', () => {
    expect(source).toContain('export function loadAiConfig()');
  });

  it('reads from localStorage using AI_STORAGE_KEY', () => {
    const fnStart = source.indexOf('export function loadAiConfig');
    const fnEnd = source.indexOf('\n}', fnStart) + 2;
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('localStorage.getItem(AI_STORAGE_KEY)');
  });

  it('wraps in try/catch', () => {
    const fnStart = source.indexOf('export function loadAiConfig');
    const fnEnd = source.indexOf('\n}', fnStart) + 2;
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('catch');
  });
});

describe('saveAiConfig', () => {
  it('exports saveAiConfig function', () => {
    expect(source).toContain('export function saveAiConfig(config: AiConfig)');
  });

  it('writes to localStorage using AI_STORAGE_KEY', () => {
    const fnStart = source.indexOf('export function saveAiConfig');
    const fnEnd = source.indexOf('\n}', fnStart) + 2;
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('localStorage.setItem(AI_STORAGE_KEY');
  });
});

// ---------------------------------------------------------------------------
// isAiConfigured
// ---------------------------------------------------------------------------

describe('isAiConfigured', () => {
  it('exports isAiConfigured function', () => {
    expect(source).toContain('export function isAiConfigured(config: AiConfig)');
  });

  it('checks apiKey trim length > 0', () => {
    const fnStart = source.indexOf('export function isAiConfigured');
    const fnEnd = source.indexOf('\n}', fnStart) + 2;
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('apiKey.trim().length > 0');
  });
});

// ---------------------------------------------------------------------------
// makeAiRequest
// ---------------------------------------------------------------------------

describe('makeAiRequest', () => {
  it('exports makeAiRequest async function', () => {
    expect(source).toContain('export async function makeAiRequest(');
  });

  it('accepts messages array and config', () => {
    const fnStart = source.indexOf('export async function makeAiRequest(');
    const sig = source.slice(fnStart, fnStart + 150);
    expect(sig).toContain('messages: AiMessage[]');
    expect(sig).toContain('config: AiConfig');
  });

  it('returns Promise<AiResponse>', () => {
    const fnStart = source.indexOf('export async function makeAiRequest(');
    const sig = source.slice(fnStart, fnStart + 150);
    expect(sig).toContain('Promise<AiResponse>');
  });

  it('sends request to AI_API_ENDPOINT', () => {
    const fnStart = source.indexOf('export async function makeAiRequest(');
    const fnEnd = source.indexOf('\n}', fnStart + source.slice(fnStart).indexOf('\n}') - 1);
    const body = source.slice(fnStart, fnStart + 800);
    expect(body).toContain('AI_API_ENDPOINT');
  });

  it('catches errors and returns success: false', () => {
    const fnStart = source.indexOf('export async function makeAiRequest(');
    const body = source.slice(fnStart, fnStart + 900);
    expect(body).toContain('catch');
    expect(body).toContain('success: false');
  });

  it('sends x-api-key header', () => {
    const fnStart = source.indexOf('export async function makeAiRequest(');
    const body = source.slice(fnStart, fnStart + 700);
    expect(body).toContain("'x-api-key'");
  });
});
