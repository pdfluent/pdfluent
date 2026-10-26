// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { FONT_PREFERENCE } from './demo';
import type { Scene } from './scene';

/**
 * Choose the first installed face of the first preferred family in the font
 * picker, so the shot names a real system font. The picker is a native
 * <select> with one <optgroup> per family, so the family is found by its label.
 * Throws when none of the preferred families is installed: a shot with the
 * document's own font would not show the feature.
 */
export async function pickTypeface(c: Scene): Promise<string> {
  const select = '[data-testid="edit-typeface"]';
  const until = Date.now() + 10_000;
  while (await c.s.call<boolean>('exists', `${select}[disabled]`)) {
    if (Date.now() > until) throw new Error('the font list never loaded');
    await new Promise((r) => setTimeout(r, 200));
  }
  for (const family of FONT_PREFERENCE) {
    const option = `${select} optgroup[label="${family}"] option:not([disabled])`;
    const value = await c.s.call<string | null>('attr', option, 'value');
    if (value) {
      await c.s.call('setValue', select, value);
      return family;
    }
  }
  throw new Error(`none of ${FONT_PREFERENCE.join(', ')} is installed on this machine`);
}
