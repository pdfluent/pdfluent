// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { describe, expect, it, vi } from 'vitest';
import { releaseListener } from '../releaseListener';

describe('releaseListener', () => {
  it('calls the unlisten function once', () => {
    const stop = vi.fn();
    releaseListener(stop);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('does nothing when there is no listener yet', () => {
    expect(() => { releaseListener(undefined); releaseListener(null); }).not.toThrow();
  });

  it('keeps a throwing unlisten away from the crash reporter', () => {
    expect(() => releaseListener(() => { throw new TypeError("undefined is not an object (evaluating 'listeners[eventId].handlerId')"); })).not.toThrow();
  });

  it('swallows a rejecting unlisten instead of leaving an unhandled rejection', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    releaseListener(() => Promise.reject(new TypeError('listeners[eventId] is undefined')));
    await new Promise((r) => setTimeout(r, 20));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
