// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const source = readFileSync(
  new URL('../src/viewer/validation/formFieldValidator.ts', import.meta.url),
  'utf8'
);

describe('constants', () => {
  it('exports FORM_FIELD_TEXT_MAX_LENGTH = 10_000', () => {
    expect(source).toContain('export const FORM_FIELD_TEXT_MAX_LENGTH = 10_000');
  });

  it('exports SUPPORTED_FIELD_TYPES tuple', () => {
    expect(source).toContain('export const SUPPORTED_FIELD_TYPES');
    expect(source).toContain("'text'");
    expect(source).toContain("'checkbox'");
    expect(source).toContain("'radio'");
    expect(source).toContain("'number'");
    expect(source).toContain("'select'");
  });
});

describe('FormFieldValidationResult', () => {
  it('declares valid boolean', () => {
    const s = source.indexOf('interface FormFieldValidationResult');
    expect(source.slice(s, source.indexOf('\n}', s) + 2)).toContain('valid: boolean');
  });

  it('declares optional error string', () => {
    const s = source.indexOf('interface FormFieldValidationResult');
    expect(source.slice(s, source.indexOf('\n}', s) + 2)).toContain('error?: string');
  });

  it('declares sanitized string', () => {
    const s = source.indexOf('interface FormFieldValidationResult');
    expect(source.slice(s, source.indexOf('\n}', s) + 2)).toContain('sanitized: string');
  });
});

describe('isKnownFieldType', () => {
  it('exports isKnownFieldType function', () => {
    expect(source).toContain('export function isKnownFieldType(type: string)');
  });

  it('uses SUPPORTED_FIELD_TYPES.includes', () => {
    const fn = source.indexOf('export function isKnownFieldType');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain('SUPPORTED_FIELD_TYPES');
    expect(body).toContain('includes(');
  });
});

describe('validateFormFieldValue', () => {
  it('exports validateFormFieldValue function', () => {
    expect(source).toContain('export function validateFormFieldValue(');
  });

  it('accepts value and fieldType params', () => {
    const fn = source.indexOf('export function validateFormFieldValue(');
    const sig = source.slice(fn, fn + 120);
    expect(sig).toContain('value: string');
    expect(sig).toContain('fieldType: string');
  });

  it('handles checkbox type', () => {
    const fn = source.indexOf('export function validateFormFieldValue');
    const body = source.slice(fn, fn + 1200);
    expect(body).toContain("'checkbox'");
    expect(body).toContain("'on'");
    expect(body).toContain("'off'");
  });

  it('handles number type with parseability check', () => {
    const fn = source.indexOf('export function validateFormFieldValue');
    const body = source.slice(fn, fn + 1200);
    expect(body).toContain("'number'");
    expect(body).toContain('Number.isFinite');
  });

  it('handles text type with max length check', () => {
    const fn = source.indexOf('export function validateFormFieldValue');
    const body = source.slice(fn, fn + 1200);
    expect(body).toContain('FORM_FIELD_TEXT_MAX_LENGTH');
  });

  it('returns valid: false for unknown field type', () => {
    const fn = source.indexOf('export function validateFormFieldValue');
    const body = source.slice(fn, fn + 300);
    expect(body).toContain('valid: false');
  });
});

describe('sanitizeFormFieldValue', () => {
  it('exports sanitizeFormFieldValue function', () => {
    expect(source).toContain('export function sanitizeFormFieldValue(value: string, fieldType: string)');
  });

  it('delegates to validateFormFieldValue', () => {
    const fn = source.indexOf('export function sanitizeFormFieldValue');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain('validateFormFieldValue(value, fieldType)');
    expect(body).toContain('.sanitized');
  });
});
