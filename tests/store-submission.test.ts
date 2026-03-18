// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { describe, expect, it } from 'vitest';
import {
  macAppStoreProfile,
  microsoftStoreProfile,
  validateStoreSubmissionProfile,
} from '../src/lib/store-submission';

describe('store submission profiles', () => {
  it('keeps required fields for Mac App Store profile', () => {
    expect(macAppStoreProfile.platform).toBe('mac-app-store');
    expect(validateStoreSubmissionProfile(macAppStoreProfile)).toEqual([]);
  });

  it('keeps required fields for Microsoft Store profile', () => {
    expect(microsoftStoreProfile.platform).toBe('microsoft-store');
    expect(validateStoreSubmissionProfile(microsoftStoreProfile)).toEqual([]);
  });

  it('flags incomplete submission profiles', () => {
    expect(
      validateStoreSubmissionProfile({
        platform: 'microsoft-store',
        category: '',
        keywords: ['pdf'],
        checklist: ['partner-center-account'],
      }),
    ).toEqual(expect.arrayContaining(['category', 'keywords', 'checklist']));
  });
});
