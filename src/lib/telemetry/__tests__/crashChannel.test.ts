// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { emitCrash, onCrash, type CapturedCrash } from '../crashChannel';

const crash = (message: string): CapturedCrash => ({
  message,
  stack: null,
  source: 'react',
});

describe('crashChannel', () => {
  beforeEach(() => {
    // Drain any queued crashes left by a previous test.
    onCrash(() => undefined)();
  });

  it('delivers a crash to a subscribed listener', () => {
    const seen: string[] = [];
    const off = onCrash((c) => seen.push(c.message));
    emitCrash(crash('boom'));
    off();
    expect(seen).toEqual(['boom']);
  });

  it('queues crashes emitted before any subscriber, then drains on subscribe', () => {
    emitCrash(crash('early'));
    const seen: string[] = [];
    const off = onCrash((c) => seen.push(c.message));
    off();
    expect(seen).toEqual(['early']);
  });

  it('stops delivering after unsubscribe', () => {
    const listener = vi.fn();
    const off = onCrash(listener);
    off();
    emitCrash(crash('after'));
    expect(listener).not.toHaveBeenCalled();
  });

  it('a throwing listener never propagates the error to the emitter', () => {
    const off = onCrash(() => {
      throw new Error('listener blew up');
    });
    expect(() => emitCrash(crash('x'))).not.toThrow();
    off();
  });
});
