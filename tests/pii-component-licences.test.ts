// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The licence rows of the personal-data component stay tied to its manifest,
 * and an open licence question stops publication.
 *
 * Why a test: the generated third-party inventory is built from lock files,
 * and the lock files cannot see model weights or the data they were trained
 * on. A row nobody checks against the manifest drifts, and a "needs review"
 * that does not block anything is a note, not a control.
 */

interface Row {
  name: string;
  license: string;
  policyStatus: 'allowed' | 'needs-review';
  blocksPublication: boolean;
  note: string;
}

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
const inventory = JSON.parse(read('../compliance/pii-component-licences.json')) as { rows: Row[] };
const manifest = JSON.parse(read('../src-tauri/resources/pii/gliner-pii-component.json')) as {
  published: boolean;
  notices: Array<{ name: string; license: string }>;
};
const policy = JSON.parse(read('../compliance/policy.json')) as { allowed_licenses: string[]; blocked_licenses: string[] };

describe('PII component licence inventory', () => {
  it('has a row for every notice the manifest ships, with the same licence', () => {
    for (const notice of manifest.notices) {
      const row = inventory.rows.find(r => r.name === notice.name || r.name.startsWith(notice.name));
      expect(row, `no inventory row for ${notice.name}`).toBeTruthy();
      expect(row?.license, notice.name).toBe(notice.license);
    }
  });

  it('marks a row allowed only when its licence is on the allowed list, and never a blocked one', () => {
    for (const row of inventory.rows) {
      expect(policy.blocked_licenses, row.name).not.toContain(row.license);
      if (row.policyStatus === 'allowed') expect(policy.allowed_licenses, row.name).toContain(row.license);
      else expect(row.blocksPublication, `${row.name}: needs-review must say whether it blocks`).toBe(true);
    }
  });

  it('records the training-data licence question as an open row that blocks publication', () => {
    const row = inventory.rows.find(r => /training data/i.test(r.name));
    expect(row, 'the training-data row is the one the research raised').toBeTruthy();
    expect(row?.note).toMatch(/Knowledgator/);
    // Closing the question means editing this row, which is a reviewed change.
    if (row?.policyStatus === 'needs-review') expect(row.blocksPublication).toBe(true);
  });

  it('cannot be published while any row blocks publication', () => {
    const blocking = inventory.rows.filter(r => r.blocksPublication).map(r => r.name);
    if (manifest.published) expect(blocking, 'published while a licence question is open').toEqual([]);
  });
});
