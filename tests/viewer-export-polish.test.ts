// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const source = readFileSync(
  new URL('../src/viewer/export/exportUtils.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// ExportType and FileExtension types
// ---------------------------------------------------------------------------

describe('exportUtils — exported types', () => {
  it('exports ExportType with review_summary | audit_report | snapshot_diff', () => {
    const typeStart = source.indexOf('export type ExportType');
    const typeLine = source.slice(typeStart, typeStart + 100);
    expect(typeLine).toContain("'review_summary'");
    expect(typeLine).toContain("'audit_report'");
    expect(typeLine).toContain("'snapshot_diff'");
  });

  it('exports FileExtension with json | md | html | pdf', () => {
    const typeStart = source.indexOf('export type FileExtension');
    const typeLine = source.slice(typeStart, typeStart + 80);
    expect(typeLine).toContain("'json'");
    expect(typeLine).toContain("'md'");
    expect(typeLine).toContain("'html'");
    expect(typeLine).toContain("'pdf'");
  });
});

// ---------------------------------------------------------------------------
// buildTimestampSuffix
// ---------------------------------------------------------------------------

describe('buildTimestampSuffix', () => {
  it('exports buildTimestampSuffix function', () => {
    expect(source).toContain('export function buildTimestampSuffix(');
  });

  it('uses zero-padding helper', () => {
    const fnStart = source.indexOf('export function buildTimestampSuffix');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('padStart');
  });

  it('builds YYYYMMDD_HHmmss pattern', () => {
    const fnStart = source.indexOf('export function buildTimestampSuffix');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('getFullYear()');
    expect(body).toContain('getMonth()');
    expect(body).toContain('getDate()');
    expect(body).toContain('getHours()');
    expect(body).toContain('getMinutes()');
    expect(body).toContain('getSeconds()');
  });

  it('uses underscore separator between date and time', () => {
    const fnStart = source.indexOf('export function buildTimestampSuffix');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('_');
  });
});

// ---------------------------------------------------------------------------
// sanitiseTitle
// ---------------------------------------------------------------------------

describe('sanitiseTitle', () => {
  it('exports sanitiseTitle function', () => {
    expect(source).toContain('export function sanitiseTitle(title: string)');
  });

  it('replaces non-alphanumeric chars with underscores', () => {
    const fnStart = source.indexOf('export function sanitiseTitle');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain("replace(/[^a-zA-Z0-9_\\-]/g, '_')");
  });

  it('collapses consecutive underscores', () => {
    const fnStart = source.indexOf('export function sanitiseTitle');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain("replace(/_+/g, '_')");
  });

  it('falls back to document when title is empty', () => {
    const fnStart = source.indexOf('export function sanitiseTitle');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain("|| 'document'");
  });
});

// ---------------------------------------------------------------------------
// buildExportFilename
// ---------------------------------------------------------------------------

describe('buildExportFilename', () => {
  it('exports buildExportFilename function', () => {
    expect(source).toContain('export function buildExportFilename(');
  });

  it('accepts baseTitle, exportType, extension, and optional date', () => {
    const fnStart = source.indexOf('export function buildExportFilename(');
    const fnSig = source.slice(fnStart, fnStart + 200);
    expect(fnSig).toContain('baseTitle');
    expect(fnSig).toContain('exportType');
    expect(fnSig).toContain('extension');
    expect(fnSig).toContain('date');
  });

  it('calls sanitiseTitle and buildTimestampSuffix', () => {
    const fnStart = source.indexOf('export function buildExportFilename(');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('sanitiseTitle(baseTitle)');
    expect(body).toContain('buildTimestampSuffix(date)');
  });

  it('combines parts with underscores and dot-extension', () => {
    const fnStart = source.indexOf('export function buildExportFilename(');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('`${safeTitle}_');
    expect(body).toContain('.${extension}');
  });
});

// ---------------------------------------------------------------------------
// formatToExtension
// ---------------------------------------------------------------------------

describe('formatToExtension', () => {
  it('exports formatToExtension function', () => {
    expect(source).toContain('export function formatToExtension(');
  });

  it('maps markdown to md', () => {
    const fnStart = source.indexOf('export function formatToExtension');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain("return 'md'");
  });

  it('maps json to json', () => {
    const fnStart = source.indexOf('export function formatToExtension');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain("return 'json'");
  });
});

// ---------------------------------------------------------------------------
// suggestExportDirectory
// ---------------------------------------------------------------------------

describe('suggestExportDirectory', () => {
  it('exports suggestExportDirectory function', () => {
    expect(source).toContain('export function suggestExportDirectory(');
  });

  it('returns empty string when currentFilePath is null', () => {
    const fnStart = source.indexOf('export function suggestExportDirectory');
    const fnEnd = source.slice(fnStart).indexOf('}') + fnStart + 1;
    const body = source.slice(fnStart, fnEnd + 100);
    expect(body).toContain("return ''");
  });

  it('removes the file name by popping the last path segment', () => {
    const fnStart = source.indexOf('export function suggestExportDirectory');
    const body = source.slice(fnStart, fnStart + 400);
    expect(body).toContain('parts.pop()');
  });
});
