// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import JSZip from 'jszip';

/** All text in the XML parts of an Office file whose names match `parts`. */
export async function officeText(file: string, parts: RegExp): Promise<string> {
  const zip = await JSZip.loadAsync(readFileSync(file));
  const names = Object.keys(zip.files).filter((n) => parts.test(n)).sort();
  if (names.length === 0) throw new Error(`${file} has no part matching ${parts}; parts: ${Object.keys(zip.files).join(', ')}`);
  const xml = await Promise.all(names.map((n) => zip.file(n)?.async('string') ?? ''));
  return xml.join(' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}

/** Words of three letters or more, lower-cased. */
export function words(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/\p{L}{3,}/gu) ?? []));
}

/** Share of the source's words that the export kept. */
export function kept(source: string, exported: string): number {
  const want = words(source);
  const got = words(exported);
  if (want.size === 0) return 1;
  let n = 0;
  for (const w of want) if (got.has(w)) n += 1;
  return n / want.size;
}
