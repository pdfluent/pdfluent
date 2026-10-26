// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * Images that are already in the page content (#723).
 *
 * They are not annotations, but the selection frame, the drag handles, the
 * Edit panel and the Delete key all work on annotations. A page image is
 * therefore shown to them as a placed-image stamp whose id carries the page
 * and the position of its `Do` operator: `pageimage:<page>:<index>`. The
 * commands behind it are list/move/replace/delete_page_image.
 */

import type { Annotation } from '../core/document';

export const PAGE_IMAGE_PREFIX = 'pageimage:';

/** One placement as `list_page_images` reports it (page space, lower-left origin). */
export interface PageImageInfo {
  index: number;
  name: string;
  rect: [number, number, number, number];
  pixelWidth: number;
  pixelHeight: number;
}

export function pageImageId(pageIndex: number, index: number): string {
  return `${PAGE_IMAGE_PREFIX}${pageIndex}:${index}`;
}

export function parsePageImageId(id: string): { pageIndex: number; index: number } | null {
  if (!id.startsWith(PAGE_IMAGE_PREFIX)) return null;
  const parts = id.slice(PAGE_IMAGE_PREFIX.length).split(':');
  if (parts.length !== 2) return null;
  const pageIndex = Number(parts[0]);
  const index = Number(parts[1]);
  if (!Number.isInteger(pageIndex) || !Number.isInteger(index) || pageIndex < 0 || index < 0) return null;
  return { pageIndex, index };
}

/** The placements of one page as annotation-shaped selection targets. */
export function pageImageAnnotations(pageIndex: number, images: readonly PageImageInfo[]): Annotation[] {
  const epoch = new Date(0);
  return images.map(img => ({
    id: pageImageId(pageIndex, img.index),
    pageIndex,
    rect: { x: img.rect[0], y: img.rect[1], width: img.rect[2] - img.rect[0], height: img.rect[3] - img.rect[1] },
    type: 'stamp',
    name: 'Image',
    createdAt: epoch,
    modifiedAt: epoch,
    author: '',
    visible: true,
    locked: false,
    color: '#808080',
  }));
}

/**
 * The target behind a clicked marker on the page: an annotation, or a picture
 * that is already in the page content. The canvas draws a marker for both
 * (pageAnnotationMarks), so the click handler must look in both lists; with
 * only the annotations, a click on a picture selected nothing.
 */
export function markerTarget(
  id: string,
  annotations: readonly Annotation[],
  images: readonly Annotation[],
): Annotation | undefined {
  return annotations.find(a => a.id === id) ?? images.find(a => a.id === id);
}

/**
 * The picture a placement just added: the "Image" stamp on `pageIndex` whose id
 * was not among the annotations before. The shell selects it, so the person who
 * placed a picture can move, replace or delete it without having to find it on
 * the page first (J-45).
 */
export function newlyPlacedImage(
  before: ReadonlySet<string>,
  after: readonly Annotation[],
  pageIndex: number,
): Annotation | undefined {
  return after.find(a => a.type === 'stamp' && a.name === 'Image' && a.pageIndex === pageIndex && !before.has(a.id));
}
