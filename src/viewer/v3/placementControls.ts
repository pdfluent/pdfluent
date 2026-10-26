// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * The V3 panel controls that arm a placement or act on a selection, as data
 * the panel renders from. Each button calls into here, so what a control does
 * is tested without a DOM (src/viewer/v3/__tests__/placementControls.test.ts)
 * and the journey specs under tests/journeys/ prove the clicks reach it.
 */

/** What a click on the page will place next; `null` when nothing is armed. */
export type Armed =
  | { kind: 'text' }
  | { kind: 'image' }
  | { kind: 'stamp'; name: string }
  | null;

export type ArmControl = 'insert-text-box-btn' | 'place-image-btn' | 'place-stamp-btn';

/** The toast that tells the user what to do next, per armed kind. */
export const ARM_HINT: Record<NonNullable<Armed>['kind'], string> = {
  text: 'editorV3.edit.clickToPlaceTextBox',
  image: 'editorV3.edit.clickToPlaceImage',
  stamp: 'editorV3.edit.clickToPlaceStamp',
};

/**
 * Arm the placement a control stands for. Pressing the control that is
 * already armed disarms it; arming one disarms the others, since a click on
 * the page can only place one thing.
 */
export function armFromControl(control: ArmControl, current: Armed, stampChoice: string): Armed {
  const next: Armed =
    control === 'insert-text-box-btn' ? { kind: 'text' } :
    control === 'place-image-btn' ? { kind: 'image' } :
    { kind: 'stamp', name: stampChoice };
  const same = current !== null && current.kind === next.kind && (next.kind !== 'stamp' || (current.kind === 'stamp' && current.name === next.name));
  return same ? null : next;
}

/** An annotation as far as the selection card needs to know it. */
export interface SelectedAnnotationLike {
  type: string;
  name?: string;
}

export type SelectionAction =
  | 'annotation-color'
  | 'edit-text-box-btn'
  | 'replace-image-btn'
  | 'delete-selected-annotation-btn';

/**
 * What the Edit panel offers for the selected annotation (J-46, J-55). A
 * placed image has no colour of its own, a redaction mark is always black
 * and a placed signature keeps its ink; only a text box has text to rewrite,
 * only a placed image a picture to swap. Anything selected can be deleted.
 */
export function selectionActions(a: SelectedAnnotationLike): SelectionAction[] {
  const out: SelectionAction[] = [];
  const isImage = a.type === 'stamp' && a.name === 'Image';
  // A placed signature keeps its ink colour: it is a mark, not a highlight.
  const isSignature = a.type === 'stamp' && a.name === 'Signature';
  if (!isImage && !isSignature && a.type !== 'redaction') out.push('annotation-color');
  if (a.type === 'freetext') out.push('edit-text-box-btn');
  if (isImage) out.push('replace-image-btn');
  out.push('delete-selected-annotation-btn');
  return out;
}

/** What the Sign panel's two placement controls open. */
export type SignControl = 'add-signature-btn' | 'add-initials-btn';

export function signDialogFor(control: SignControl): 'signature' | 'initials' {
  return control === 'add-signature-btn' ? 'signature' : 'initials';
}
