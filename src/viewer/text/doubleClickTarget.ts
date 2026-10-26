// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import type { TextParagraphTarget } from './textInteractionModel';
import { getMutationSupport } from './textMutationSupport';

/**
 * What a double-click on text opens in the editor (J-42). A paragraph of
 * several single-run lines is edited as one text; anything the backend cannot
 * write as a whole (a styled multi-run line, a single line) keeps the
 * line-level edit the caller builds.
 */
export function chooseDoubleClickTarget(
  paragraph: TextParagraphTarget | null,
  lineLevel: () => TextParagraphTarget,
): TextParagraphTarget {
  if (paragraph && paragraph.lines.length > 1 && getMutationSupport(paragraph).writable) return paragraph;
  return lineLevel();
}
