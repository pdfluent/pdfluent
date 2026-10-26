// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// #563 (owner decision 18-10): compliance freshness is a push gate, and a soft
// failure would recreate the gap it closes.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const wf = readFileSync(new URL('../.github/workflows/compliance.yml', import.meta.url), 'utf8');

describe('compliance workflow is a gate (#563)', () => {
  it('runs on push and on pull requests, not only by hand', () => {
    const on = wf.slice(wf.indexOf('\non:'), wf.indexOf('\npermissions:'));
    expect(on).toMatch(/\n  push:/);
    expect(on).toMatch(/\n  pull_request:/);
  });
  it('never fails softly', () => {
    expect(wf).not.toMatch(/continue-on-error\s*:\s*true/);
    expect(wf).not.toMatch(/allow_failure/);
  });
  it('compares the committed inventory with the generator and enforces the policy', () => {
    expect(wf).toContain('git diff --exit-code -- THIRD_PARTY.md THIRD_PARTY_ATTRIBUTIONS.md compliance-report.json');
    expect(wf).toContain('npm run compliance:check');
  });
});
