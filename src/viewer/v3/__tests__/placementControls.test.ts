// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-44, J-45, J-46, J-53, J-62: what each Edit/Sign panel control arms or
// offers. The panel buttons call these functions; tests/journeys/ proves the
// clicks, src-tauri/tests/annotations_persist.rs what lands in the file.

import { describe, it, expect } from 'vitest';
import { armFromControl, selectionActions, signDialogFor } from '../placementControls';

describe('armFromControl', () => {
  it('arms a text box, an image and the chosen stamp', () => {
    expect(armFromControl('insert-text-box-btn', null, 'Draft')).toEqual({ kind: 'text' });
    expect(armFromControl('place-image-btn', null, 'Draft')).toEqual({ kind: 'image' });
    expect(armFromControl('place-stamp-btn', null, 'Approved')).toEqual({ kind: 'stamp', name: 'Approved' });
  });

  it('arms one thing at a time and disarms on a second press', () => {
    expect(armFromControl('place-image-btn', { kind: 'text' }, 'Draft')).toEqual({ kind: 'image' });
    expect(armFromControl('insert-text-box-btn', { kind: 'text' }, 'Draft')).toBeNull();
    expect(armFromControl('place-stamp-btn', { kind: 'stamp', name: 'Draft' }, 'Draft')).toBeNull();
    expect(armFromControl('place-stamp-btn', { kind: 'stamp', name: 'Draft' }, 'Final')).toEqual({ kind: 'stamp', name: 'Final' });
  });
});

describe('selectionActions', () => {
  it('offers colour and delete for a shape', () => {
    expect(selectionActions({ type: 'square' })).toEqual(['annotation-color', 'delete-selected-annotation-btn']);
  });

  it('offers text editing for a text box', () => {
    expect(selectionActions({ type: 'freetext' })).toContain('edit-text-box-btn');
  });

  it('offers a new picture for a placed image, and no colour', () => {
    const actions = selectionActions({ type: 'stamp', name: 'Image' });
    expect(actions).toContain('replace-image-btn');
    expect(actions).not.toContain('annotation-color');
  });

  it('lets a placed signature be moved and deleted but not recoloured', () => {
    expect(selectionActions({ type: 'stamp', name: 'Signature' })).toEqual(['delete-selected-annotation-btn']);
  });

  it('lets a redaction mark be deleted but not recoloured', () => {
    expect(selectionActions({ type: 'redaction' })).toEqual(['delete-selected-annotation-btn']);
  });
});

describe('signDialogFor', () => {
  it('opens the dialog the control names', () => {
    expect(signDialogFor('add-signature-btn')).toBe('signature');
    expect(signDialogFor('add-initials-btn')).toBe('initials');
  });
});
