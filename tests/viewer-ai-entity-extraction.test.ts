// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const source = readFileSync(
  new URL('../src/viewer/ai/entityExtractionModule.ts', import.meta.url),
  'utf8'
);

describe('EntityType', () => {
  it('exports EntityType union', () => {
    expect(source).toContain("export type EntityType = 'person'");
    expect(source).toContain("'organization'");
    expect(source).toContain("'date'");
    expect(source).toContain("'amount'");
    expect(source).toContain("'location'");
    expect(source).toContain("'other'");
  });
});

describe('ExtractedEntity', () => {
  it('declares text field', () => {
    const s = source.indexOf('interface ExtractedEntity');
    const e = source.indexOf('\n}', s) + 2;
    expect(source.slice(s, e)).toContain('text: string');
  });

  it('declares type field', () => {
    const s = source.indexOf('interface ExtractedEntity');
    const e = source.indexOf('\n}', s) + 2;
    expect(source.slice(s, e)).toContain('type: EntityType');
  });

  it('declares confidence field', () => {
    const s = source.indexOf('interface ExtractedEntity');
    const e = source.indexOf('\n}', s) + 2;
    expect(source.slice(s, e)).toContain('confidence: EntityConfidence');
  });
});

describe('EntityExtractionResult', () => {
  it('declares entities array', () => {
    const s = source.indexOf('interface EntityExtractionResult');
    const e = source.indexOf('\n}', s) + 2;
    expect(source.slice(s, e)).toContain('entities: ExtractedEntity[]');
  });

  it('declares rawResponse field', () => {
    const s = source.indexOf('interface EntityExtractionResult');
    const e = source.indexOf('\n}', s) + 2;
    expect(source.slice(s, e)).toContain('rawResponse: string');
  });
});

describe('ENTITY_EXTRACTION_SYSTEM_PROMPT', () => {
  it('exports ENTITY_EXTRACTION_SYSTEM_PROMPT', () => {
    expect(source).toContain('export const ENTITY_EXTRACTION_SYSTEM_PROMPT');
  });

  it('instructs JSON output', () => {
    expect(source).toContain('JSON');
  });
});

describe('buildEntityExtractionPrompt', () => {
  it('exports buildEntityExtractionPrompt function', () => {
    expect(source).toContain('export function buildEntityExtractionPrompt(context: DocumentAiContext)');
  });

  it('calls formatContextForPrompt', () => {
    const fnStart = source.indexOf('export function buildEntityExtractionPrompt');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('formatContextForPrompt(safe)');
  });
});

describe('parseEntityResponse', () => {
  it('exports parseEntityResponse function', () => {
    expect(source).toContain('export function parseEntityResponse(responseText: string)');
  });

  it('finds JSON array markers [ and ]', () => {
    const fnStart = source.indexOf('export function parseEntityResponse');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain("indexOf('[')");
    expect(body).toContain("lastIndexOf(']')");
  });

  it('returns empty entities on parse failure', () => {
    const fnStart = source.indexOf('export function parseEntityResponse');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('entities: []');
  });

  it('wraps in try/catch', () => {
    const fnStart = source.indexOf('export function parseEntityResponse');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('catch');
  });
});

describe('groupEntitiesByType', () => {
  it('exports groupEntitiesByType function', () => {
    expect(source).toContain('export function groupEntitiesByType(');
  });

  it('initialises all entity type buckets', () => {
    const fnStart = source.indexOf('export function groupEntitiesByType');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('person: []');
    expect(body).toContain('organization: []');
    expect(body).toContain('date: []');
    expect(body).toContain('amount: []');
  });
});

describe('makeEntityExtractionRequest', () => {
  it('exports makeEntityExtractionRequest async function', () => {
    expect(source).toContain('export async function makeEntityExtractionRequest(');
  });

  it('calls makeAiRequest', () => {
    const fnStart = source.indexOf('export async function makeEntityExtractionRequest');
    const body = source.slice(fnStart, fnStart + 300);
    expect(body).toContain('makeAiRequest(');
  });
});
