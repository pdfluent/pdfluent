// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-79: "Convert files to PDF" (/vs-adobe-acrobat). Opening a Word document
// should give a PDF of it. The editor converts out of PDF only (plan §2.8);
// until the promise is built or taken down this is a known gap with its owner.

import { writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import { journey } from './lib/journey';
import { openViaMenu } from './lib/ui';

async function tinyDocx(path: string): Promise<void> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello from Word</w:t></w:r></w:p></w:body></w:document>');
  writeFileSync(path, await zip.generateAsync({ type: 'nodebuffer' }));
}

journey('J-79', async (j) => {
  const docx = j.file('letter.docx');
  await tinyDocx(docx);
  await j.start();

  await j.gap('no-create-from-other-formats', async () => {
    await openViaMenu(j, docx);
    await j.waitForDocument();
  });
});
