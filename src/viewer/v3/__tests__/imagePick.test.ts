// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-45: the picture comes from the native panel opened in Rust, never from an
// <input type=file> made in the page (the picker takes no DOM at all).

import { describe, it, expect, vi } from 'vitest';
import { pickImage } from '../imagePick';

describe('pickImage', () => {
  it('asks the Rust side for the picture and returns its data URL', async () => {
    const invoke = vi.fn().mockResolvedValue('data:image/png;base64,iVBORw0KGgo=');
    await expect(pickImage(invoke)).resolves.toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(invoke).toHaveBeenCalledWith('pick_image_dialog');
  });

  it('returns null when the panel is cancelled', async () => {
    await expect(pickImage(() => Promise.resolve(null))).resolves.toBeNull();
  });

  it('returns null, and does not throw, when the file is refused', async () => {
    await expect(pickImage(() => Promise.reject('This file is not a PNG or JPEG picture.'))).resolves.toBeNull();
  });
});
