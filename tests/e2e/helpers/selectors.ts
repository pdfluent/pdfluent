// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/** Build a CSS selector for a data-testid attribute. */
export const tid = (id: string): string => `[data-testid="${id}"]`;

/** All critical viewer testids — used in the readiness/contract spec. */
export const CRITICAL_TESTIDS = [
  // Welcome / shell
  'welcome-screen',
  'welcome-open-btn',
  'viewer-empty-state',
  // Zoom controls (doc loaded)
  'zoom-reset-btn',
  'zoom-fit-width-btn',
  'floating-page-indicator',
  // TopBar (doc loaded)
  'close-document-btn',
  // Left nav rail (doc loaded)
  'thumbnail-scroll-container',
  'nav-prev-page-btn',
  'nav-next-page-btn',
  'nav-go-to-page-input',
  // Right context panel — doc info
  'doc-info-panel',
  'doc-info-page-count',
  // Right context panel — comments
  'reviewer-name-input',
  'comment-filter-input',
  'comment-filter-count',
  // Right context panel — forms
  'forms-completion-summary',
  // Right context panel — redaction
  'redaction-panel',
  // Right context panel — OCR
  'ocr-panel',
  'ocr-language-select',
  'run-ocr-btn',
  // Dialogs
  'shortcut-sheet',
  'shortcut-sheet-close',
  'recovery-dialog',
  'recovery-recover-btn',
  'recovery-discard-btn',
] as const;
