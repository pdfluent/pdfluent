// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-78: title and author set in Document properties are in the saved file,
// where other readers and search see them.

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { save, setProperties } from './lib/ui';

journey('J-78', async (j) => {
  const doc = j.fixture('src-tauri/tests/fixtures/two_pages.pdf', 'notes.pdf');
  await j.start({ open: doc });
  await j.step('set title and author', () => setProperties(j, 'Board minutes October', 'Grace Hopper'));
  await j.step('save; the file carries both', async () => {
    await save(j);
    const r = j.inspect(doc);
    expect(r.raw.info?.Title).toBe('Board minutes October');
    expect(r.raw.info?.Author).toBe('Grace Hopper');
    expect(r.info?.title).toBe('Board minutes October');
  });
});
