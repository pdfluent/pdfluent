// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Installed typefaces for the edit panel's picker, and the sentence a refused
// typeface gets. The licence decision (OS/2 fsType) is made in the backend
// (src-tauri/src/system_fonts.rs); this only shows it.

import { invokeCommand } from '../../lib/commandBridge';
import type { FontRefusal } from '../../core/engine/TextMutationEngine';

export interface SystemFontFace {
  id: string;
  family: string;
  style: string;
  weight: number;
  italic: boolean;
  embeddable: boolean;
  refusal: string | null;
}

export interface SystemFontFamily {
  family: string;
  faces: SystemFontFace[];
}

let cache: Promise<SystemFontFamily[]> | null = null;

/** The installed fonts, read once per run of the app. */
export function listSystemFonts(): Promise<SystemFontFamily[]> {
  if (!cache) {
    cache = invokeCommand<SystemFontFamily[]>('list_system_fonts').catch((e: unknown) => {
      cache = null;
      throw e;
    });
  }
  return cache;
}

/** i18n key (under `edit.typeface`) and its parameters for a refusal. */
export function refusalMessage(refusal: FontRefusal): { key: string; params: Record<string, string> } {
  const family = refusal.family ?? '';
  switch (refusal.code) {
    case 'embedding-not-permitted':
      return { key: 'edit.typeface.refusedLicence', params: { family } };
    case 'missing-glyphs':
      return { key: 'edit.typeface.refusedGlyphs', params: { family, characters: refusal.characters ?? '' } };
    case 'font-not-found':
      return { key: 'edit.typeface.refusedGone', params: {} };
    case 'text-not-found':
      return { key: 'edit.typeface.refusedText', params: {} };
    default:
      return { key: 'edit.typeface.refusedUnusable', params: { family } };
  }
}
