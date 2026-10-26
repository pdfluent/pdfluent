// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * What a click on the page writes into the PDF when a placement is armed:
 * a text box (J-44), an image (J-45), a stamp (J-53), a signature or initials
 * (J-62).
 *
 * Until these landed each one made a React overlay that sat on the page,
 * looked placed, and was gone on save — `LOCAL_OVERLAY_CONTROLS_ENABLED` kept
 * them out of the shipped shell for that reason. Now every placement is a
 * backend command, so it is in the file, it is one undo step, and another
 * viewer shows it. The command is passed in, which is what lets the test call
 * this with a recorder instead of a Tauri runtime.
 */

export type Invoke = (command: string, args: Record<string, unknown>) => Promise<unknown>;

/** A stroke drawn on the signature pad, in pad pixels (origin top-left). */
export type PadStroke = Array<[number, number]>;

export type Placement =
  | { kind: 'text'; text: string; fontSize?: number; color?: [number, number, number] }
  | { kind: 'image'; dataUrl: string }
  | { kind: 'stamp'; name: string }
  | {
      kind: 'signature';
      /** A full signature or initials: decides the box size. */
      role: 'signature' | 'initials';
      /** Who signs; printed under the mark as "Signed by <name> · <date>". */
      signerName: string;
      /** `YYYY-MM-DD`; today when left out. */
      date?: string;
      text?: string;
      /** A bundled signature font (`list_signature_fonts`) for the typed name; plain italic when left out. */
      fontId?: string;
      strokes?: PadStroke[];
      padWidth?: number;
      padHeight?: number;
    };

export interface PageSize {
  width: number;
  height: number;
}

/** The stamps offered, as the backend names them (`/Name` in the file). */
export const STAMP_NAMES = ['Approved', 'NotApproved', 'Draft', 'Confidential', 'Final', 'ForComment', 'Expired'] as const;

/** Height of the caption band under a placed signature (matches annot_write.rs). */
export const SIGNATURE_CAPTION_BAND = 14;

/** A date as `YYYY-MM-DD` in local time: the day the person signed. */
export function localIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A click inside the page element (pixels from its top-left) in PDF space. */
export function clickToPdfPoint(clickX: number, clickY: number, zoom: number, page: PageSize): { x: number; y: number } {
  const z = zoom > 0 ? zoom : 1;
  return { x: clickX / z, y: page.height - clickY / z };
}

/** The default box for a placement, centred on the click and kept on the page. */
export function placementRect(placement: Placement, point: { x: number; y: number }, page: PageSize): [number, number, number, number] {
  let w: number;
  let h: number;
  switch (placement.kind) {
    case 'text': {
      const size = placement.fontSize ?? 12;
      w = 220;
      // The backend wraps at the box width; about half an em per character
      // is Helvetica's average, so the box is tall enough for the wrapped text.
      const lines = placement.text
        .split('\n')
        .reduce((n, line) => n + Math.max(1, Math.ceil((line.length * size * 0.52) / (w - 4))), 0);
      h = lines * size * 1.2 + 8;
      break;
    }
    case 'image': w = 150; h = 150; break;
    case 'stamp': w = 160; h = 50; break;
    // Room for the mark and the "Signed by" caption under it.
    case 'signature': w = placement.role === 'initials' ? 120 : 200; h = placement.role === 'initials' ? 50 : 70; break;
  }
  w = Math.min(w, page.width);
  h = Math.min(h, page.height);
  // A text box starts where the user clicked, the way a cursor would.
  let x0 = placement.kind === 'text' ? point.x : point.x - w / 2;
  let y1 = placement.kind === 'text' ? point.y : point.y + h / 2;
  x0 = Math.max(0, Math.min(x0, page.width - w));
  y1 = Math.max(h, Math.min(y1, page.height));
  return [x0, y1 - h, x0 + w, y1];
}

/**
 * Pad strokes as ink paths inside `rect`: y flipped, aspect kept, centred. A
 * signature drawn wide stays wide on the page.
 */
export function strokesToInkPaths(strokes: PadStroke[], padWidth: number, padHeight: number, rect: [number, number, number, number]): Array<Array<[number, number]>> {
  const points = strokes.flat();
  if (points.length === 0) return [];
  const minX = Math.min(...points.map(p => p[0]));
  const maxX = Math.max(...points.map(p => p[0]));
  const minY = Math.min(...points.map(p => p[1]));
  const maxY = Math.max(...points.map(p => p[1]));
  const srcW = Math.max(maxX - minX, 1, padWidth * 0.05);
  const srcH = Math.max(maxY - minY, 1, padHeight * 0.05);
  const [x0, y0, x1, y1] = rect;
  const scale = Math.min((x1 - x0) / srcW, (y1 - y0) / srcH);
  const offX = x0 + ((x1 - x0) - srcW * scale) / 2;
  const offY = y0 + ((y1 - y0) - srcH * scale) / 2;
  return strokes
    .filter(s => s.length > 0)
    .map(s => (s.length === 1 ? [s[0], s[0]] as PadStroke : s).map(([px, py]) => [
      offX + (px - minX) * scale,
      offY + (maxY - py) * scale,
    ] as [number, number]));
}

/** Write the placement into the PDF. Rejects with the backend's reason. */
export async function commitPlacement(invoke: Invoke, placement: Placement, pageIndex: number, point: { x: number; y: number }, page: PageSize): Promise<void> {
  const rect = placementRect(placement, point, page);
  switch (placement.kind) {
    case 'text':
      await invoke('add_free_text_annotation', {
        pageIndex, rect, text: placement.text, fontSize: placement.fontSize ?? 12, color: placement.color ?? [0, 0, 0],
      });
      return;
    case 'image':
      await invoke('add_image_annotation', { pageIndex, rect, imageBase64: placement.dataUrl });
      return;
    case 'stamp':
      await invoke('add_stamp_annotation', { pageIndex, rect, name: placement.name });
      return;
    case 'signature': {
      const signer = placement.signerName.trim();
      if (!signer) throw new Error('A signature needs the signer\'s name.');
      const date = placement.date ?? localIsoDate(new Date());
      const strokes = placement.strokes ?? [];
      if (strokes.some(s => s.length > 0)) {
        // The strokes go above the caption band, inside the frame.
        const inkArea: [number, number, number, number] = [rect[0] + 4, rect[1] + SIGNATURE_CAPTION_BAND + 2, rect[2] - 4, rect[3] - 4];
        const paths = strokesToInkPaths(strokes, placement.padWidth ?? 1, placement.padHeight ?? 1, inkArea);
        await invoke('add_signature_annotation', { pageIndex, rect, signer, date, paths, text: null, fontId: null });
        return;
      }
      const text = placement.text?.trim();
      if (!text) throw new Error('Nothing to place: draw or type a signature first.');
      await invoke('add_signature_annotation', { pageIndex, rect, signer, date, paths: null, text, fontId: placement.fontId ?? null });
      return;
    }
  }
}
