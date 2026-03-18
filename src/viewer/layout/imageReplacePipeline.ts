// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Image Replacement Pipeline — OBJECT_AND_LAYOUT_EDITING_EXCELLENCE_BLOCK Batch 5
 *
 * Orchestrates replacing a raster image XObject in the PDF document.
 * The pipeline preserves the original transform and scale of the image slot
 * and only replaces the pixel data (and optionally the XObject dimensions).
 *
 * Pipeline stages:
 *   1. validate — check the target is a replaceable image object
 *   2. prepare  — build an ImageReplaceRequest for the Rust backend
 *   3. commit   — (async, via Tauri IPC) send to replace_image_xobject command
 *   4. result   — return ImageReplaceResult with new object metadata
 *
 * Frontend responsibilities (this module):
 *   - Stage 1: validate
 *   - Stage 2: prepare
 *   - Stage 4: interpret the result from the backend
 *
 * Rust backend responsibilities (deferred, via IPC):
 *   - Replace the XObject stream with new image bytes
 *   - Preserve or update the image dimensions and transform
 *   - Return the new XObject reference
 *
 * Scale strategies:
 *   'preserve'     — keep original width/height in PDF points (image may stretch)
 *   'fit'          — scale new image to fit within original bounding box (letterbox)
 *   'fill'         — scale new image to fill original bounding box (crop)
 *   'stretch'      — stretch new image to exactly match original bounding box
 */

import type { LayoutObject, LayoutRect, TransformMatrix } from './objectDetection';

// ---------------------------------------------------------------------------
// Scale strategy
// ---------------------------------------------------------------------------

export type ImageScaleStrategy = 'preserve' | 'fit' | 'fill' | 'stretch';

// ---------------------------------------------------------------------------
// Image replace request (sent to Rust backend)
// ---------------------------------------------------------------------------

export interface ImageReplaceRequest {
  /** Page index of the image. */
  readonly pageIndex: number;
  /** ID of the layout object being replaced. */
  readonly objectId: string;
  /**
   * Image data as a base64-encoded string.
   * Supported formats: PNG, JPEG, WEBP.
   */
  readonly imageDataBase64: string;
  /** MIME type of the replacement image. */
  readonly mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  /**
   * Natural dimensions of the replacement image in pixels.
   * Used by the backend to compute the scale matrix.
   */
  readonly naturalWidthPx: number;
  readonly naturalHeightPx: number;
  /** Scale strategy to apply when fitting the new image into the original slot. */
  readonly scaleStrategy: ImageScaleStrategy;
  /** Original bounding box in PDF points (for scale computation). */
  readonly originalRect: LayoutRect;
  /** Original transform matrix (preserved as-is for 'preserve' strategy). */
  readonly originalMatrix: TransformMatrix;
}

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

export type ImageReplaceValidationCode =
  | 'ok'
  | 'not-replaceable'
  | 'not-image-type'
  | 'unsupported-mime-type'
  | 'image-data-empty'
  | 'invalid-dimensions';

export interface ImageReplaceValidation {
  readonly valid: boolean;
  readonly reasonCode: ImageReplaceValidationCode;
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Replace result
// ---------------------------------------------------------------------------

export type ImageReplaceOutcome =
  | 'replaced'         // image successfully replaced
  | 'validation-failed' // frontend validation blocked the request
  | 'backend-error';   // Rust backend reported an error

export interface ImageReplaceResult {
  readonly outcome: ImageReplaceOutcome;
  /** Updated layout object with new dimensions (null when failed). */
  readonly updatedObject: Partial<LayoutObject> | null;
  /** Reason code for logging/messaging. */
  readonly reasonCode: string;
  /** Human-readable message. */
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Supported MIME types
// ---------------------------------------------------------------------------

const SUPPORTED_MIME_TYPES = new Set<string>(['image/png', 'image/jpeg', 'image/webp']);

export function isSupportedMimeType(
  mimeType: string,
): mimeType is ImageReplaceRequest['mimeType'] {
  return SUPPORTED_MIME_TYPES.has(mimeType);
}

// ---------------------------------------------------------------------------
// Stage 1: Validate
// ---------------------------------------------------------------------------

/**
 * Validate that the target object can be replaced with the given image data.
 */
export function validateImageReplace(
  obj: LayoutObject,
  imageDataBase64: string,
  mimeType: string,
  naturalWidthPx: number,
  naturalHeightPx: number,
): ImageReplaceValidation {
  if (!obj.replaceable) {
    return {
      valid: false,
      reasonCode: 'not-replaceable',
      message: 'Dit object ondersteunt geen afbeeldingsvervanging.',
    };
  }

  if (obj.type !== 'image') {
    return {
      valid: false,
      reasonCode: 'not-image-type',
      message: 'Alleen afbeeldingsobjecten kunnen worden vervangen.',
    };
  }

  if (!isSupportedMimeType(mimeType)) {
    return {
      valid: false,
      reasonCode: 'unsupported-mime-type',
      message: `Afbeeldingstype '${mimeType}' wordt niet ondersteund. Gebruik PNG, JPEG of WebP.`,
    };
  }

  if (!imageDataBase64 || imageDataBase64.trim().length === 0) {
    return {
      valid: false,
      reasonCode: 'image-data-empty',
      message: 'Er zijn geen afbeeldingsgegevens opgegeven.',
    };
  }

  if (naturalWidthPx <= 0 || naturalHeightPx <= 0) {
    return {
      valid: false,
      reasonCode: 'invalid-dimensions',
      message: 'Ongeldige afbeeldingsafmetingen. Breedte en hoogte moeten positief zijn.',
    };
  }

  return { valid: true, reasonCode: 'ok', message: 'Afbeeldingsvervanging is geldig.' };
}

// ---------------------------------------------------------------------------
// Stage 2: Prepare request
// ---------------------------------------------------------------------------

/**
 * Build an ImageReplaceRequest from validated inputs.
 * Only call this after validateImageReplace returns valid=true.
 */
export function prepareImageReplaceRequest(
  obj: LayoutObject,
  imageDataBase64: string,
  mimeType: ImageReplaceRequest['mimeType'],
  naturalWidthPx: number,
  naturalHeightPx: number,
  scaleStrategy: ImageScaleStrategy,
): ImageReplaceRequest {
  return {
    pageIndex: obj.pageIndex,
    objectId: obj.id,
    imageDataBase64,
    mimeType,
    naturalWidthPx,
    naturalHeightPx,
    scaleStrategy,
    originalRect: obj.rect,
    originalMatrix: obj.matrix,
  };
}

// ---------------------------------------------------------------------------
// Scale computation helpers
// ---------------------------------------------------------------------------

/**
 * Compute the display rect for the replacement image given a scale strategy.
 * Returns the rect (in PDF points) the new image will occupy.
 */
export function computeImageDisplayRect(
  originalRect: LayoutRect,
  naturalWidthPx: number,
  naturalHeightPx: number,
  strategy: ImageScaleStrategy,
): LayoutRect {
  if (strategy === 'preserve') {
    return { ...originalRect };
  }

  if (strategy === 'stretch') {
    return { ...originalRect };
  }

  if (naturalWidthPx <= 0 || naturalHeightPx <= 0) {
    return { ...originalRect };
  }

  const imageAspect = naturalWidthPx / naturalHeightPx;
  const slotAspect = originalRect.width / originalRect.height;

  if (strategy === 'fit') {
    // Scale to fit within slot, preserving aspect ratio
    let displayW: number;
    let displayH: number;
    if (imageAspect > slotAspect) {
      displayW = originalRect.width;
      displayH = originalRect.width / imageAspect;
    } else {
      displayH = originalRect.height;
      displayW = originalRect.height * imageAspect;
    }
    // Center within original slot
    const offsetX = (originalRect.width - displayW) / 2;
    const offsetY = (originalRect.height - displayH) / 2;
    return {
      x: originalRect.x + offsetX,
      y: originalRect.y + offsetY,
      width: displayW,
      height: displayH,
    };
  }

  // strategy === 'fill': scale to fill slot, cropping excess
  let displayW: number;
  let displayH: number;
  if (imageAspect > slotAspect) {
    displayH = originalRect.height;
    displayW = originalRect.height * imageAspect;
  } else {
    displayW = originalRect.width;
    displayH = originalRect.width / imageAspect;
  }
  const offsetX = (originalRect.width - displayW) / 2;
  const offsetY = (originalRect.height - displayH) / 2;
  return {
    x: originalRect.x + offsetX,
    y: originalRect.y + offsetY,
    width: displayW,
    height: displayH,
  };
}

// ---------------------------------------------------------------------------
// Stage 4: Interpret backend result
// ---------------------------------------------------------------------------

/**
 * Interpret the raw IPC result from the Rust backend's replace_image_xobject command.
 * Returns a typed ImageReplaceResult.
 */
export function interpretReplaceResult(
  ipcResult: { success: boolean; error?: { code: string; message: string } },
  originalObj: LayoutObject,
): ImageReplaceResult {
  if (!ipcResult.success) {
    return {
      outcome: 'backend-error',
      updatedObject: null,
      reasonCode: ipcResult.error?.code ?? 'unknown-backend-error',
      message: ipcResult.error?.message ?? 'Onbekende fout bij afbeeldingsvervanging.',
    };
  }

  return {
    outcome: 'replaced',
    updatedObject: { id: originalObj.id, pageIndex: originalObj.pageIndex },
    reasonCode: 'ok',
    message: 'Afbeelding succesvol vervangen.',
  };
}
