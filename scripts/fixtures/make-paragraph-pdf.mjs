// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Writes src-tauri/tests/fixtures/paragraph_3_lines.pdf: one page, a heading
// and a three-line Helvetica paragraph, one text run per line. The fixture of
// the paragraph edit (J-42): src-tauri/tests/paragraph_edit.rs and the
// real-app spec tests/journeys/J-42-*.e2e.ts. Deterministic, so re-running it
// gives the same bytes.
//
// Usage: node scripts/fixtures/make-paragraph-pdf.mjs

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isMainModule } from '../lib/main-module.mjs';

export const LINES = [
  'The quick brown fox jumps over',
  'the lazy dog and keeps running',
  'until the end of the paragraph.',
];

export function paragraphPdf() {
  let content = 'BT /F1 18 Tf 72 740 Td (Heading stays) Tj ET\n';
  LINES.forEach((line, i) => {
    content += `BT /F1 12 Tf 72 ${700 - i * 14} Td (${line}) Tj ET\n`;
  });
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  let out = '%PDF-1.7\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

if (isMainModule(import.meta.url)) {
  const target = fileURLToPath(new URL('../../src-tauri/tests/fixtures/paragraph_3_lines.pdf', import.meta.url));
  writeFileSync(target, paragraphPdf());
  process.stdout.write(`wrote ${target}\n`);
}
