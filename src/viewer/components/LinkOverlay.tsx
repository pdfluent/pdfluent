// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import type { LinkAnnotationDto } from '../../lib/tauri-api';

/**
 * Clickable layer for `/Link` annotations carrying a URI action. The container
 * is pointer-transparent; only the link rects capture clicks, and activation is
 * routed through the capability-trust flow (ask-on-first-use). Rendered above
 * the page bitmap but below the form inputs.
 */

interface LinkOverlayProps {
  links: LinkAnnotationDto[];
  pageIndex: number;
  pageHeightPt: number;
  zoom: number;
  /** When true, draw a faint affordance so links are discoverable. */
  highlight: boolean;
  onActivate: (uri: string) => void;
}

export function LinkOverlay({
  links,
  pageIndex,
  pageHeightPt,
  zoom,
  highlight,
  onActivate,
}: LinkOverlayProps) {
  const onPage = links.filter(l => l.pageIndex === pageIndex);
  if (onPage.length === 0) return null;

  return (
    <div
      data-testid="link-overlay"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 22 }}
    >
      {onPage.map((link, i) => {
        const x0 = Math.min(link.rect[0], link.rect[2]);
        const y0 = Math.min(link.rect[1], link.rect[3]);
        const x1 = Math.max(link.rect[0], link.rect[2]);
        const y1 = Math.max(link.rect[1], link.rect[3]);
        return (
          <button
            key={`${link.uri}#${i}`}
            type="button"
            data-testid="pdf-link"
            title={link.uri}
            onClick={() => onActivate(link.uri)}
            style={{
              position: 'absolute',
              left: x0 * zoom,
              top: (pageHeightPt - y1) * zoom,
              width: (x1 - x0) * zoom,
              height: (y1 - y0) * zoom,
              padding: 0,
              margin: 0,
              border: 'none',
              background: highlight ? 'rgba(37,99,235,0.12)' : 'transparent',
              cursor: 'pointer',
              pointerEvents: 'auto',
            }}
          />
        );
      })}
    </div>
  );
}
