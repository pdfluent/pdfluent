// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/** Active work mode in the viewer. */
export type ViewerMode =
  | 'read'
  | 'review'
  | 'edit'
  | 'sign'
  | 'organize'
  | 'forms'
  | 'protect'
  | 'convert';

export interface AnnotationAppearance {
  color: [number, number, number];
  strokeWidth: number;
}

export const DEFAULT_ANNOTATION_APPEARANCE: AnnotationAppearance = {
  color: [1, 1, 0],
  strokeWidth: 1.5,
};

/** Active left-navigation panel. null = panel collapsed. */
export type NavigationPanel =
  | 'thumbnails'
  | 'bookmarks'
  | 'search'
  | 'comments'
  | 'attachments'
  | 'layers'
  | 'fields'
  | 'format';
