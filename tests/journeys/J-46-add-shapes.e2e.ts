// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
// J-46: add a rectangle, ellipse or line. The editor has no shape tool (the
// draft rectangle only serves redaction and highlights). Listed known gap
// "shapes-missing": build the tool or take the promise down.

import { expect } from 'vitest';
import { journey } from './lib/journey';

journey('J-46', async (j) => {
  await j.start({ open: 'src-tauri/tests/fixtures/two_pages.pdf' });
  await j.gap('shapes-missing', async () => {
    const n = await j.s.call<number>('count', '[aria-label*="Rectangle" i], [aria-label*="Ellipse" i], [data-testid^="shape-tool"]');
    expect(n, 'a shape tool').toBeGreaterThan(0);
  });
});
