// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// What the "Remove password" card asks for (#726). The backend decides
// (OpenDocument::password_removal); this maps its answer to the form.

/** Mirrors pdf_engine::PasswordRemoval (kebab-case on the wire). */
export type PasswordRemovalState = 'not-protected' | 'needs-owner-password' | 'ready';

export interface RemovePasswordForm {
  /** Show the owner-password field. False when the owner password is already proven. */
  askForPassword: boolean;
  /** i18n key of the field label and placeholder. */
  fieldKey: string;
  /** i18n key of the explanation under the card title. */
  helpKey: string;
  /** Whether the button can be pressed for the given input. */
  canSubmit: (typed: string) => boolean;
}

export function removePasswordForm(state: PasswordRemovalState | null): RemovePasswordForm {
  switch (state) {
    case 'ready':
      return {
        askForPassword: false,
        fieldKey: 'protect.ownerPasswordForRemoval',
        helpKey: 'protect.removePasswordReady',
        canSubmit: () => true,
      };
    case 'not-protected':
      return {
        askForPassword: false,
        fieldKey: 'protect.ownerPasswordForRemoval',
        helpKey: 'protect.removePasswordNotProtected',
        canSubmit: () => false,
      };
    default:
      return {
        askForPassword: true,
        fieldKey: 'protect.ownerPasswordForRemoval',
        helpKey: 'protect.removePasswordHelp',
        canSubmit: typed => typed.length > 0,
      };
  }
}
