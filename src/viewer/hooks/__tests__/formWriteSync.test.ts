// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The two merge rules the form overlays share (formWriteSync.ts).

import { describe, it, expect } from 'vitest';
import { createWriteQueue, mergeCalculated, mergeModelValues } from '../formWriteSync';

describe('createWriteQueue', () => {
  it('runs tasks in call order even when an earlier one is slower', async () => {
    const run = createWriteQueue();
    const log: string[] = [];
    const slow = run(async () => { await new Promise(r => setTimeout(r, 20)); log.push('first'); });
    const fast = run(async () => { log.push('second'); });
    await Promise.all([slow, fast]);
    expect(log).toEqual(['first', 'second']);
  });

  it('keeps going after a task fails, and still reports that failure to its caller', async () => {
    const run = createWriteQueue();
    const failed = run(async () => { throw new Error('boom'); });
    const after = run(async () => 'ok');
    await expect(failed).rejects.toThrow('boom');
    await expect(after).resolves.toBe('ok');
  });
});

describe('mergeCalculated', () => {
  it('sets the calculated fields in the overlay and in the baseline', () => {
    const r = mergeCalculated({ qty: '3', total: '0' }, { qty: '3', total: '0' }, [{ name: 'total', value: '12' }]);
    expect(r.values).toEqual({ qty: '3', total: '12' });
    expect(r.committed).toEqual({ qty: '3', total: '12' });
  });

  it('keeps the text of a field being typed into, but moves its baseline', () => {
    const r = mergeCalculated({ total: '99' }, { total: '0' }, [{ name: 'total', value: '12' }]);
    expect(r.values.total).toBe('99');
    expect(r.committed.total).toBe('12');
  });

  it('adds a field the overlay did not hold yet', () => {
    const r = mergeCalculated({}, {}, [{ name: 'tax', value: '2' }]);
    expect(r.values).toEqual({ tax: '2' });
  });

  it('does nothing when no field was calculated', () => {
    const values = { a: '1' };
    expect(mergeCalculated(values, { a: '1' }, []).values).toBe(values);
  });
});

describe('mergeModelValues', () => {
  it('takes the answer, except for fields typed into since their last commit', () => {
    const merged = mergeModelValues(
      { qty: '4', total: '20', note: 'old' },
      { qty: '4', total: '5', note: 'typing' },
      { qty: '4', total: '5', note: 'old' },
    );
    expect(merged).toEqual({ qty: '4', total: '20', note: 'typing' });
  });
});
