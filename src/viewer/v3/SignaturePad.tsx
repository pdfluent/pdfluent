// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { PadStroke } from './placement';

export const SIGNATURE_PAD_WIDTH = 400;
export const SIGNATURE_PAD_HEIGHT = 160;

/**
 * The "Draw" tab of the signature dialog (J-62). It used to be a dashed box
 * that said "Draw here" and captured nothing. The strokes it records here go
 * to the page as an ink annotation (see placement.ts), so the signature is in
 * the file, not painted over it.
 */
export function SignaturePad({ onChange }: { onChange: (strokes: PadStroke[]) => void }) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [strokes, setStrokes] = useState<PadStroke[]>([]);
  const drawingRef = useRef(false);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, SIGNATURE_PAD_WIDTH, SIGNATURE_PAD_HEIGHT);
    ctx.strokeStyle = 'rgb(13, 38, 115)';  // monochrome-allow: signature ink is blue like a pen (document content)
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const stroke of strokes) {
      ctx.beginPath();
      stroke.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      const first = stroke[0];
      if (stroke.length === 1 && first) ctx.lineTo(first[0] + 0.5, first[1] + 0.5);
      ctx.stroke();
    }
  }, [strokes]);

  const pointAt = (e: ReactPointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    const sx = r.width > 0 ? SIGNATURE_PAD_WIDTH / r.width : 1;
    const sy = r.height > 0 ? SIGNATURE_PAD_HEIGHT / r.height : 1;
    return [(e.clientX - r.left) * sx, (e.clientY - r.top) * sy];
  };

  const update = (next: PadStroke[]) => {
    setStrokes(next);
    onChange(next);
  };

  return (
    <div style={{ position: 'relative' }}>
      <canvas
        ref={canvasRef}
        data-testid="signature-pad"
        width={SIGNATURE_PAD_WIDTH}
        height={SIGNATURE_PAD_HEIGHT}
        aria-label={t('editorV3.sign.drawHere')}
        style={{
          width: '100%',
          height: 180,
          background: 'rgba(30,31,36,0.02)',
          border: '1px dashed var(--border)',
          borderRadius: 8,
          cursor: 'crosshair',
          touchAction: 'none',
        }}
        onPointerDown={(e) => {
          drawingRef.current = true;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          update([...strokes, [pointAt(e)]]);
        }}
        onPointerMove={(e) => {
          if (!drawingRef.current || strokes.length === 0) return;
          const last = strokes[strokes.length - 1] ?? [];
          update([...strokes.slice(0, -1), [...last, pointAt(e)]]);
        }}
        onPointerUp={() => { drawingRef.current = false; }}
        onPointerLeave={() => { drawingRef.current = false; }}
      />
      {strokes.length === 0 && (
        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13, pointerEvents: 'none' }}>
          {t('editorV3.sign.drawHere')}
        </span>
      )}
      <button
        type="button"
        className="btn-ghost"
        data-testid="signature-pad-clear"
        style={{ position: 'absolute', bottom: 8, right: 8, fontSize: 10, height: 22, minHeight: 'unset' }}
        onClick={() => update([])}
      >
        {t('editorV3.sign.clear')}
      </button>
    </div>
  );
}
