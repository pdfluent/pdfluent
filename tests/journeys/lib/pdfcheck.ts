// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The suite's reader for the files the app writes: src-tauri/examples/pdfcheck.rs.
// A journey is judged here, on the saved bytes, and not on what the screen says.

import { spawnSync } from 'node:child_process';

export interface AnnotationReport {
  id: string;
  page_index: number;
  annotation_type: string;
  contents: string | null;
  color: [number, number, number] | null;
}

export interface FormFieldReport {
  name: string;
  field_type: string;
  value: string | null;
  options: Array<{ export: string; display: string }>;
}

export interface SignatureReport {
  field_name: string;
  signer: string | null;
  status: string;
  valid: boolean;
  usage_rights: boolean;
}

export interface NeedleReport {
  needle: string;
  raw_bytes: boolean;
  objects: boolean;
  pages: number[] | null;
}

export interface PdfReport {
  path: string;
  bytes: number;
  header: string;
  revisions: number;
  encrypt_dictionary: boolean;
  needs_password: boolean;
  opens: boolean;
  open_error: string | null;
  page_count?: number;
  pages?: Array<{ index: number; text: string }>;
  info?: { page_count: number; title: string | null; author: string | null; form_type: string; xfa_detected: boolean };
  annotations?: AnnotationReport[];
  form_fields?: FormFieldReport[];
  is_signed?: boolean;
  signatures?: SignatureReport[];
  needles: NeedleReport[];
  raw: {
    images?: number;
    error?: string;
    pages?: Array<{ page: number; rotate: number; annotations: Array<{ subtype: string | null; contents: string | null }> }>;
    info?: Record<string, string>;
    fonts?: Array<{ base_font: string | null; subtype: string | null; embedded: boolean }>;
    has_xmp?: boolean;
    has_acroform?: boolean;
    has_prev?: boolean;
  };
}

function bin(): string {
  const b = process.env.PDFLUENT_PDFCHECK;
  if (!b) throw new Error('PDFLUENT_PDFCHECK is not set');
  return b;
}

export function inspect(file: string, opts: { password?: string; needles?: string[] } = {}): PdfReport {
  const args = ['inspect', file];
  if (opts.password !== undefined) args.push('--password', opts.password);
  for (const n of opts.needles ?? []) args.push('--needle', n);
  const r = spawnSync(bin(), args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 120_000 });
  if (r.status !== 0) throw new Error(`pdfcheck inspect ${file} exited ${r.status}: ${r.stderr}`);
  return JSON.parse(r.stdout) as PdfReport;
}

export function make(kind: 'make-encrypted' | 'make-signed' | 'make-form' | 'make-scan', ...args: string[]): void {
  const r = spawnSync(bin(), [kind, ...args], { encoding: 'utf8', timeout: 120_000 });
  if (r.status !== 0) throw new Error(`pdfcheck ${kind} exited ${r.status}: ${r.stderr}`);
}

/** All page text of an opened report, pages joined by a newline. */
export function allText(r: PdfReport): string {
  if (!r.opens || !r.pages) throw new Error(`${r.path} does not open: ${r.open_error}`);
  return r.pages.map((p) => p.text).join('\n');
}

/** Subtypes on a page as lopdf reads them, independent of the editor's reader. */
export function rawSubtypes(r: PdfReport, page: number): string[] {
  const p = r.raw.pages?.find((x) => x.page === page);
  return (p?.annotations ?? []).map((a) => a.subtype ?? '?');
}
