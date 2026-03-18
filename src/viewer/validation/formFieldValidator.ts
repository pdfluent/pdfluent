// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Form Field Validator
//
// Validates form field values at the input boundary before they are
// persisted or sent to the PDF engine.
// ---------------------------------------------------------------------------

/** Maximum length accepted for text form fields. */
export const FORM_FIELD_TEXT_MAX_LENGTH = 10_000;

/** All field types the validator understands. */
export const SUPPORTED_FIELD_TYPES = ['text', 'checkbox', 'radio', 'number', 'select'] as const;
export type SupportedFieldType = (typeof SUPPORTED_FIELD_TYPES)[number];

export interface FormFieldValidationResult {
  /** True when the value is acceptable for the given field type. */
  valid: boolean;
  /** Human-readable error (only present when valid is false). */
  error?: string;
  /** Sanitized value ready for storage (empty string on invalid input). */
  sanitized: string;
}

/**
 * Return true when the given type string is a known field type.
 */
export function isKnownFieldType(type: string): boolean {
  return (SUPPORTED_FIELD_TYPES as readonly string[]).includes(type);
}

/**
 * Validate a form field value according to the field's type.
 */
export function validateFormFieldValue(
  value: string,
  fieldType: string,
): FormFieldValidationResult {
  if (!isKnownFieldType(fieldType)) {
    return { valid: false, error: `Onbekend veldtype: ${fieldType}`, sanitized: '' };
  }

  const trimmed = value.trim();

  switch (fieldType as SupportedFieldType) {
    case 'text':
      if (trimmed.length > FORM_FIELD_TEXT_MAX_LENGTH) {
        return {
          valid: false,
          error: `Tekstveld te lang (max ${FORM_FIELD_TEXT_MAX_LENGTH} tekens)`,
          sanitized: trimmed.slice(0, FORM_FIELD_TEXT_MAX_LENGTH),
        };
      }
      return { valid: true, sanitized: trimmed };

    case 'checkbox': {
      const allowed = ['on', 'off', 'true', 'false'];
      if (!allowed.includes(trimmed.toLowerCase())) {
        return { valid: false, error: 'Ongeldige checkbox-waarde', sanitized: '' };
      }
      return { valid: true, sanitized: trimmed.toLowerCase() };
    }

    case 'number': {
      const n = Number(trimmed);
      if (!Number.isFinite(n)) {
        return { valid: false, error: 'Geen geldig getal', sanitized: '' };
      }
      return { valid: true, sanitized: String(n) };
    }

    case 'radio':
    case 'select':
      if (trimmed === '') {
        return { valid: false, error: 'Veld mag niet leeg zijn', sanitized: '' };
      }
      return { valid: true, sanitized: trimmed };

    default:
      return { valid: false, error: 'Onbekend veldtype', sanitized: '' };
  }
}

/**
 * Sanitize a form field value: run validation and return the sanitized
 * value (or an empty string when invalid).
 */
export function sanitizeFormFieldValue(value: string, fieldType: string): string {
  return validateFormFieldValue(value, fieldType).sanitized;
}
