// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/** Active work mode in the viewer. */
export type ViewerMode =
  | 'read'
  | 'review'
  | 'edit'
  | 'organize'
  | 'forms'
  | 'protect'
  | 'convert';

/** Active left-navigation panel. null = panel collapsed. */
export type NavigationPanel =
  | 'thumbnails'
  | 'bookmarks'
  | 'search'
  | 'comments'
  | 'attachments'
  | 'layers'
  | 'fields';
