// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-38: the palette's list is a listbox of options, filtered by what is typed.
// The rows were plain buttons: a screen reader heard no list, and the journey
// that counts options found none.

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import '../../../i18n';
import { CommandPalette, type Command } from '../CommandPalette';

const commands: Command[] = [
  { id: 'zoom-in', label: 'Zoom in', keywords: ['zoom'], action: () => undefined },
  { id: 'zoom-out', label: 'Zoom out', keywords: ['zoom'], action: () => undefined },
  { id: 'next-page', label: 'Next page', action: () => undefined },
];

const html = () =>
  renderToStaticMarkup(createElement(CommandPalette, { isOpen: true, onClose: () => undefined, commands }));

describe('CommandPalette list semantics', () => {
  it('marks the list as a listbox and every command as an option', () => {
    const out = html();
    expect(out).toContain('role="listbox"');
    expect(out.match(/role="option"/g)?.length).toBe(commands.length);
  });

  it('marks exactly the highlighted row as selected', () => {
    const out = html();
    expect(out.match(/aria-selected="true"/g)?.length).toBe(1);
    expect(out.match(/aria-selected="false"/g)?.length).toBe(commands.length - 1);
  });
});
