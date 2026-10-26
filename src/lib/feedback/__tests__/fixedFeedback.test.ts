// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { describe, expect, it } from 'vitest';

import {
  fixedFeedbackFromFeed,
  myFixedReports,
  rememberPendingFixed,
  takeFixedNoticeForStart,
  versionAtLeast,
} from '../fixedFeedback';
import { readLocalReports, rememberReport, type KeyValueStore } from '../localReports';

function memory(): KeyValueStore & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

const MINE = 'FB-ABCDEFGH';
const OTHER = 'FB-0123456Z';

describe('fixedFeedbackFromFeed', () => {
  it('reads valid IDs and ignores everything else', () => {
    expect(fixedFeedbackFromFeed({ fixed_feedback: [MINE, 'nonsense', 42, MINE] })).toEqual([MINE]);
    expect(fixedFeedbackFromFeed({})).toEqual([]);
    expect(fixedFeedbackFromFeed(null)).toEqual([]);
    expect(fixedFeedbackFromFeed({ fixed_feedback: 'FB-ABCDEFGH' })).toEqual([]);
  });
});

describe('a reporter hears that their report is fixed', () => {
  it('when an update that fixes it is offered, and only for their own IDs', () => {
    const s = memory();
    rememberReport({ id: MINE, deleteToken: 't', sentAt: '2026-10-18T00:00:00Z', appVersion: '1.0.0' }, s);
    expect(myFixedReports({ fixed_feedback: [OTHER, MINE] }, '1.0.1', s)).toEqual([MINE]);
    expect(myFixedReports({ fixed_feedback: [OTHER] }, '1.0.1', s)).toEqual([]);
  });

  it('once more, after the update, on the first start of the fixed version', () => {
    const s = memory();
    rememberReport({ id: MINE, deleteToken: 't', sentAt: '2026-10-18T00:00:00Z', appVersion: '1.0.0' }, s);
    rememberPendingFixed({ version: '1.0.1', ids: [MINE] }, s);

    expect(takeFixedNoticeForStart('1.0.0', s)).toBe(null); // not updated yet
    expect(takeFixedNoticeForStart('1.0.1', s)).toEqual({ version: '1.0.1', ids: [MINE] });
    expect(takeFixedNoticeForStart('1.0.1', s)).toBe(null); // once
    expect(readLocalReports(s)[0]?.fixedNoticeShownFor).toBe('1.0.1');
    // Not offered again for the version it was already announced in.
    expect(myFixedReports({ fixed_feedback: [MINE] }, '1.0.1', s)).toEqual([]);
  });

  it('works with no storage at all, by saying nothing', () => {
    expect(myFixedReports({ fixed_feedback: [MINE] }, '1.0.1', null)).toEqual([]);
    expect(takeFixedNoticeForStart('1.0.1', null)).toBe(null);
  });
});

describe('versionAtLeast', () => {
  it('compares numerically', () => {
    expect(versionAtLeast('1.0.10', '1.0.9')).toBe(true);
    expect(versionAtLeast('1.1.0', '1.1.0')).toBe(true);
    expect(versionAtLeast('1.0.9', '1.1.0')).toBe(false);
  });
});
