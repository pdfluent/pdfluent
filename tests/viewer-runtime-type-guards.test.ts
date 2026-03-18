// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const source = readFileSync(
  new URL('../src/viewer/validation/runtimeTypeGuards.ts', import.meta.url),
  'utf8'
);

describe('primitive guards', () => {
  it('exports isString function', () => {
    expect(source).toContain("export function isString(v: unknown): v is string");
  });

  it('exports isNonEmptyString function', () => {
    expect(source).toContain("export function isNonEmptyString(v: unknown): v is string");
  });

  it('isNonEmptyString checks trim().length > 0', () => {
    const fn = source.indexOf('export function isNonEmptyString');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain('trim().length > 0');
  });

  it('exports isNumber function', () => {
    expect(source).toContain("export function isNumber(v: unknown): v is number");
  });

  it('exports isFiniteNumber function', () => {
    expect(source).toContain("export function isFiniteNumber(v: unknown): v is number");
  });

  it('isFiniteNumber uses Number.isFinite', () => {
    const fn = source.indexOf('export function isFiniteNumber');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain('Number.isFinite');
  });

  it('exports isObject function', () => {
    expect(source).toContain('export function isObject(v: unknown)');
  });

  it('isObject rejects null', () => {
    const fn = source.indexOf('export function isObject');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain('v !== null');
  });

  it('isObject rejects arrays', () => {
    const fn = source.indexOf('export function isObject');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain('!Array.isArray(v)');
  });

  it('exports isArray function', () => {
    expect(source).toContain("export function isArray(v: unknown): v is unknown[]");
  });
});

describe('domain-specific guards', () => {
  it('exports isAnnotationLike function', () => {
    expect(source).toContain('export function isAnnotationLike(v: unknown)');
  });

  it('isAnnotationLike checks id, type, page, rect fields', () => {
    const fn = source.indexOf('export function isAnnotationLike');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain("v['id']");
    expect(body).toContain("v['type']");
    expect(body).toContain("v['page']");
    expect(body).toContain("v['rect']");
  });

  it('exports isReplyLike function', () => {
    expect(source).toContain('export function isReplyLike(v: unknown)');
  });

  it('isReplyLike checks id and text', () => {
    const fn = source.indexOf('export function isReplyLike');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain("v['id']");
    expect(body).toContain("v['text']");
  });

  it('exports isFormFieldLike function', () => {
    expect(source).toContain('export function isFormFieldLike(v: unknown)');
  });

  it('isFormFieldLike checks id and type', () => {
    const fn = source.indexOf('export function isFormFieldLike');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain("v['id']");
    expect(body).toContain("v['type']");
  });

  it('exports isDocumentEventLike function', () => {
    expect(source).toContain('export function isDocumentEventLike(v: unknown)');
  });

  it('isDocumentEventLike checks id, type, timestamp', () => {
    const fn = source.indexOf('export function isDocumentEventLike');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain("v['id']");
    expect(body).toContain("v['type']");
    expect(body).toContain("v['timestamp']");
  });
});

describe('assertString', () => {
  it('exports assertString function', () => {
    expect(source).toContain('export function assertString(v: unknown, fieldName: string)');
  });

  it('throws TypeError with field name when not a string', () => {
    const fn = source.indexOf('export function assertString');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain('TypeError');
    expect(body).toContain('fieldName');
  });

  it('returns the string value when valid', () => {
    const fn = source.indexOf('export function assertString');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain('return v');
  });
});
