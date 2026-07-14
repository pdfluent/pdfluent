// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fixturesDir = join(root, 'tests', 'fixtures');

mkdirSync(fixturesDir, { recursive: true });

function stream(body) {
  return `<< /Length ${Buffer.byteLength(body, 'latin1')} >>\nstream\n${body}\nendstream`;
}

function makePdf(objects, headerComment = '') {
  let output = `%PDF-1.4\n${headerComment}`;
  const offsets = [0];

  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(output, 'latin1'));
    output += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(output, 'latin1');
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) {
    output += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(output, 'latin1');
}

function makeTextPdf() {
  const contents = [
    [
      'BT /F1 24 Tf 72 720 Td (Lorem ipsum visual E2E page one) Tj ET',
      'BT /F1 12 Tf 72 690 Td (Search target Lorem appears on this page.) Tj ET',
    ].join('\n'),
    [
      'BT /F1 24 Tf 72 720 Td (Second page navigation checkpoint) Tj ET',
      'BT /F1 12 Tf 72 690 Td (More Lorem content for search navigation.) Tj ET',
    ].join('\n'),
    [
      'BT /F1 24 Tf 72 720 Td (Third page export checkpoint) Tj ET',
      'BT /F1 12 Tf 72 690 Td (Final Lorem marker for visual tests.) Tj ET',
    ].join('\n'),
  ];

  return makePdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents 4 0 R >>',
    stream(contents[0]),
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents 6 0 R >>',
    stream(contents[1]),
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents 8 0 R >>',
    stream(contents[2]),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]);
}

function makeXfaMarkerPdf() {
  return makePdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    stream('BT /F1 18 Tf 72 720 Td (XFA marker sample document) Tj ET'),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ], '% synthetic /XFA marker for viewer detection\n');
}

writeFileSync(join(fixturesDir, 'sample-text.pdf'), makeTextPdf());
writeFileSync(join(fixturesDir, 'sample-xfa.pdf'), makeXfaMarkerPdf());

console.log('Generated visual E2E fixtures.');
