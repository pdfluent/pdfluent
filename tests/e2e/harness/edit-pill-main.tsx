// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Browser harness for tests/e2e/edit-pill-hit-test.spec.ts. The real pill in
// the real shell stylesheet, inside the same wrapper chain EditorV3Shell and
// ViewerApp build (.pfv3 > .docarea > .canvas > .page): layout is the thing
// under test and jsdom has none. Browser mode has no text engine, so the
// editing state the journey reaches by double-clicking is faked here.
import React from 'react';
import ReactDOM from 'react-dom/client';
import '../../../src/styles/tokens.css';
import '../../../src/styles/global.css';
import '../../../src/styles/magic-patterns.css';
import '../../../src/styles/viewer-v3.css';
import '../../../src/i18n';
import { TextEditFloatingPill } from '../../../src/viewer/components/TextEditFloatingPill';

const params = new URLSearchParams(window.location.search);
const zoom = 1;
const pageW = 595;
const pageH = 842;
// PDF-space paragraph, bottom-left origin. `top` is the distance from the
// page top in CSS px, so a test can put the paragraph near the top (pill flips
// below it) or low on the page.
const top = Number(params.get('top') ?? 300);
const left = Number(params.get('left') ?? 300);
const rect = { x: left, y: pageH - top - 20, width: 260, height: 20 };
const noop = () => {};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <div className="pfv3" style={{ position: 'fixed', inset: 0 }}>
    <div className="docarea" id="docarea" style={{ position: 'absolute', inset: 0 }}>
      <div className="canvas" role="region">
        <div className="v3-page-stack" dir="ltr">
          <div className="page current" style={{ width: pageW * zoom, height: pageH * zoom }}>
            <div
              data-testid="harness-canvas-layer"
              style={{ position: 'absolute', inset: 0, zIndex: 1 }}
            />
            <div
              data-testid="text-inline-editor"
              style={{
                position: 'absolute', left: rect.x, top, width: rect.width, height: rect.height,
                zIndex: 60, background: '#fff',
              }}
            />
            <TextEditFloatingPill
              isBold={false}
              isItalic={false}
              isUnderline={false}
              isStrikethrough={false}
              fontSize={12}
              onBold={noop}
              onItalic={noop}
              onUnderline={noop}
              onStrikethrough={noop}
              onCommit={() => { (window as unknown as { __committed?: number }).__committed = ((window as unknown as { __committed?: number }).__committed ?? 0) + 1; }}
              onCancel={noop}
              editingParagraphBounds={rect}
              pageHeightPt={pageH}
              zoom={zoom}
            />
          </div>
        </div>
      </div>
    </div>
  </div>,
);
