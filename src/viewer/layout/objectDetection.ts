// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Content Object Detection Layer — OBJECT_AND_LAYOUT_EDITING_EXCELLENCE_BLOCK Batch 1
 *
 * Detects and classifies layout objects extracted from the PDF content stream.
 * The Rust backend extracts raw content descriptors via `extract_layout_objects`
 * IPC command; this module classifies them into typed LayoutObjects and provides
 * the front-end model for the object interaction layer.
 *
 * Detectable object types:
 *   text_block    — text operators (Tj, TJ, Td, Tf…) forming a coherent block
 *   image         — raster image XObjects (Do operator referencing an XImage)
 *   vector_graphics — path/stroke/fill operators without a referenced XObject
 *   shape         — closed filled path forming a geometric shape
 *   form_widget   — AcroForm widget annotation overlaid on the page
 *
 * Coordinate system: PDF page space (origin bottom-left, y upward).
 * All bounding boxes and transform matrices are in points (1/72 inch).
 *
 * Transform matrix: CSS-like 6-value affine [a, b, c, d, e, f] where:
 *   [a c e]   [x']   [a·x + c·y + e]
 *   [b d f] × [y'] = [b·x + d·y + f]
 *   [0 0 1]   [1 ]   [1            ]
 * Identity matrix: [1, 0, 0, 1, 0, 0]
 */

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** Bounding rectangle in PDF page coordinate space (points). */
export interface LayoutRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * 6-component affine transform matrix [a, b, c, d, e, f].
 * Identity: [1, 0, 0, 1, 0, 0].
 */
export type TransformMatrix = [number, number, number, number, number, number];

/** The identity transform matrix. */
export const IDENTITY_MATRIX: TransformMatrix = [1, 0, 0, 1, 0, 0];

// ---------------------------------------------------------------------------
// Object type
// ---------------------------------------------------------------------------

export type LayoutObjectType =
  | 'text_block'
  | 'image'
  | 'vector_graphics'
  | 'shape'
  | 'form_widget';

// ---------------------------------------------------------------------------
// Raw content descriptor (from Rust backend IPC)
// ---------------------------------------------------------------------------

/**
 * Raw descriptor of a content object as provided by the Rust backend.
 * This is what `extract_layout_objects` returns over IPC.
 * The front-end classifies and enriches this into a LayoutObject.
 */
export interface RawContentObject {
  /** Unique identifier within the page (content stream byte offset or xref key). */
  readonly id: string;
  /** Zero-based page index. */
  readonly pageIndex: number;
  /**
   * Raw type hint from the Rust backend.
   * 'text'   → text operators
   * 'ximage' → image XObject (Do operator)
   * 'path'   → path construction + paint operators
   * 'widget' → form widget annotation
   */
  readonly rawType: 'text' | 'ximage' | 'path' | 'widget';
  /** Bounding box in PDF page space. */
  readonly rect: LayoutRect;
  /** Content stream transform matrix at the point of the object. */
  readonly matrix: TransformMatrix;
  /**
   * Additional metadata hints from the Rust backend.
   * 'filled'    — path is filled (shape candidate)
   * 'stroked'   — path is stroked only (vector graphics candidate)
   * 'form_name' — widget field name
   */
  readonly hints?: {
    readonly filled?: boolean;
    readonly stroked?: boolean;
    readonly formName?: string;
  };
}

// ---------------------------------------------------------------------------
// Classified layout object
// ---------------------------------------------------------------------------

export interface LayoutObject {
  /** Unique identifier within the page. */
  readonly id: string;
  /** Zero-based page index. */
  readonly pageIndex: number;
  /** Classified type. */
  readonly type: LayoutObjectType;
  /** Bounding box in PDF page space. */
  readonly rect: LayoutRect;
  /** Content stream transform matrix. */
  readonly matrix: TransformMatrix;
  /** Whether this object can be moved. */
  readonly movable: boolean;
  /** Whether this object can be resized. */
  readonly resizable: boolean;
  /** Whether this object can be replaced (images only). */
  readonly replaceable: boolean;
  /**
   * Source reference — the raw descriptor this object was built from.
   * Kept for round-tripping back to the mutation backend.
   */
  readonly source: RawContentObject;
}

// ---------------------------------------------------------------------------
// Detection result
// ---------------------------------------------------------------------------

export interface ObjectDetectionResult {
  /** All detected layout objects on the page. */
  readonly objects: readonly LayoutObject[];
  /** Zero-based page index this detection ran against. */
  readonly pageIndex: number;
  /** Count per object type — for fast UX summary. */
  readonly counts: Record<LayoutObjectType, number>;
}

// ---------------------------------------------------------------------------
// Classification logic
// ---------------------------------------------------------------------------

/**
 * Classify a raw content object into a LayoutObjectType.
 * Path objects are sub-classified into shape vs. vector_graphics based on hints.
 */
export function classifyRawObject(raw: RawContentObject): LayoutObjectType {
  switch (raw.rawType) {
    case 'text':
      return 'text_block';
    case 'ximage':
      return 'image';
    case 'widget':
      return 'form_widget';
    case 'path':
      // Filled closed path → shape; otherwise → vector_graphics
      return raw.hints?.filled === true ? 'shape' : 'vector_graphics';
  }
}

/**
 * Derive mutation capabilities from the classified object type.
 */
function getCapabilities(type: LayoutObjectType): {
  movable: boolean;
  resizable: boolean;
  replaceable: boolean;
} {
  switch (type) {
    case 'text_block':
      return { movable: true, resizable: false, replaceable: false };
    case 'image':
      return { movable: true, resizable: true, replaceable: true };
    case 'shape':
      return { movable: true, resizable: true, replaceable: false };
    case 'vector_graphics':
      return { movable: true, resizable: false, replaceable: false };
    case 'form_widget':
      return { movable: false, resizable: false, replaceable: false };
  }
}

// ---------------------------------------------------------------------------
// Main detection function
// ---------------------------------------------------------------------------

/**
 * Detect and classify layout objects from a list of raw content descriptors.
 *
 * Input: raw objects from the Rust `extract_layout_objects` IPC command.
 * Output: typed LayoutObjects with mutation capabilities set.
 *
 * Only objects on the specified pageIndex are processed; mixed-page inputs
 * are supported but unusual (the Rust backend typically sends per-page).
 */
export function detectLayoutObjects(
  rawObjects: readonly RawContentObject[],
  pageIndex: number,
): ObjectDetectionResult {
  const counts: Record<LayoutObjectType, number> = {
    text_block: 0,
    image: 0,
    vector_graphics: 0,
    shape: 0,
    form_widget: 0,
  };

  const objects: LayoutObject[] = rawObjects
    .filter(r => r.pageIndex === pageIndex)
    .map(raw => {
      const type = classifyRawObject(raw);
      counts[type]++;
      const capabilities = getCapabilities(type);
      return {
        id: raw.id,
        pageIndex: raw.pageIndex,
        type,
        rect: raw.rect,
        matrix: raw.matrix,
        ...capabilities,
        source: raw,
      };
    });

  return { objects, pageIndex, counts };
}

// ---------------------------------------------------------------------------
// Filter helpers
// ---------------------------------------------------------------------------

/** Return only objects of the given type. */
export function getObjectsByType(
  objects: readonly LayoutObject[],
  type: LayoutObjectType,
): readonly LayoutObject[] {
  return objects.filter(o => o.type === type);
}

/** Return only movable objects. */
export function getMovableObjects(objects: readonly LayoutObject[]): readonly LayoutObject[] {
  return objects.filter(o => o.movable);
}

/** Return only resizable objects. */
export function getResizableObjects(objects: readonly LayoutObject[]): readonly LayoutObject[] {
  return objects.filter(o => o.resizable);
}

/** Return only replaceable objects (currently: images). */
export function getReplaceableObjects(objects: readonly LayoutObject[]): readonly LayoutObject[] {
  return objects.filter(o => o.replaceable);
}

/** Return the object with the given id, or null if not found. */
export function findObjectById(
  objects: readonly LayoutObject[],
  id: string,
): LayoutObject | null {
  return objects.find(o => o.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// Rect utilities
// ---------------------------------------------------------------------------

/** True when rect has positive non-zero dimensions. */
export function isValidRect(rect: LayoutRect): boolean {
  return rect.width > 0 && rect.height > 0;
}

/** Return the center point of a rect. */
export function rectCenter(rect: LayoutRect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** Return a new rect offset by (dx, dy). */
export function translateRect(rect: LayoutRect, dx: number, dy: number): LayoutRect {
  return { x: rect.x + dx, y: rect.y + dy, width: rect.width, height: rect.height };
}

/** True when two rects overlap (strictly — touching edges do not count). */
export function rectsOverlap(a: LayoutRect, b: LayoutRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/** True when rect a is fully contained within rect b. */
export function rectContains(outer: LayoutRect, inner: LayoutRect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}
