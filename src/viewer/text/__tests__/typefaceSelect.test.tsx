// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TypefaceSelect } from '../../components/TypefacePicker';
import type { SystemFontFamily } from '../typeface';

const face = (id: string, style: string, embeddable: boolean) =>
  ({ id, family: 'Fancy Sans', style, weight: 400, italic: false, embeddable, refusal: embeddable ? null : 'restricted' });
const families: SystemFontFamily[] = [
  { family: 'Fancy Sans', faces: [face('FancySans-Regular', 'Regular', true), face('FancySans-Locked', 'Locked', false)] },
];

describe('TypefaceSelect', () => {
  const html = renderToStaticMarkup(<TypefaceSelect families={families} value={null} onChange={() => undefined} />);

  it('lists the installed faces by family', () => {
    expect(html).toContain('<optgroup label="Fancy Sans">');
    expect(html).toContain('value="FancySans-Regular"');
  });
  it('lists a face that may not be embedded, but cannot be chosen', () => {
    expect(html).toMatch(/<option[^>]*value="FancySans-Locked"[^>]*disabled/);
    expect(html).not.toMatch(/<option[^>]*value="FancySans-Regular"[^>]*disabled/);
  });
  it('waits for the list before it can be used', () => {
    const waiting = renderToStaticMarkup(<TypefaceSelect families={null} value={null} onChange={() => undefined} />);
    expect(waiting).toMatch(/<select[^>]*disabled/);
  });
});
