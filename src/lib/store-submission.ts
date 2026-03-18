// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.
export type StorePlatform = 'mac-app-store' | 'microsoft-store';

export interface StoreSubmissionProfile {
  platform: StorePlatform;
  category: string;
  keywords: string[];
  checklist: string[];
}

export const macAppStoreProfile: StoreSubmissionProfile = {
  platform: 'mac-app-store',
  category: 'Productivity',
  keywords: ['pdf editor', 'annotate pdf', 'offline pdf', 'merge pdf', 'sign pdf'],
  checklist: [
    'apple-developer-account',
    'app-sandbox-entitlements',
    'universal-binary',
    'codesigning-notarization',
    'app-store-connect-metadata',
  ],
};

export const microsoftStoreProfile: StoreSubmissionProfile = {
  platform: 'microsoft-store',
  category: 'Productivity',
  keywords: ['pdf editor', 'merge pdf', 'annotate pdf', 'privacy', 'offline'],
  checklist: [
    'partner-center-account',
    'msix-package',
    'wack-test',
    'webview2-runtime',
    'store-listing-metadata',
  ],
};

export function validateStoreSubmissionProfile(profile: StoreSubmissionProfile): string[] {
  const issues: string[] = [];

  if (profile.category.trim().length === 0) {
    issues.push('category');
  }
  if (profile.keywords.length < 3) {
    issues.push('keywords');
  }
  if (profile.checklist.length < 5) {
    issues.push('checklist');
  }

  return issues;
}
