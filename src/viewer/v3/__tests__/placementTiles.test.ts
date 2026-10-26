// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-44, J-45, J-51, J-53, J-62: the All-tools tiles for note, stamp, text box,
// image and initials were hidden for having nothing behind them. Each now
// names the control that performs it and the panel that control lives in.

import { describe, it, expect } from 'vitest';
import { TOOLS_BY_MODE, type ToolDefinition } from '../../tools/toolDefinitions';
import { WIRED_TILES_ALL_RUNTIMES, WIRED_TILES_TAURI_ONLY } from '../../tools/wiredTools.generated';

const tiles = new Map<string, ToolDefinition>(
  Object.values(TOOLS_BY_MODE).flat(2).map((tool) => [tool.label, tool]),
);
const offered = new Set([...WIRED_TILES_ALL_RUNTIMES, ...WIRED_TILES_TAURI_ONLY]);

describe('placement tiles', () => {
  it.each([
    ['toolbar.note', 'rail-tool:comment', undefined],
    ['toolbar.stamp', 'button:place-stamp-btn', 'edit'],
    ['toolbar.addText', 'button:insert-text-box-btn', 'edit'],
    ['toolbar.image', 'button:place-image-btn', 'edit'],
    ['toolbar.initials', 'button:add-initials-btn', 'esign'],
  ])('%s is offered and opens the control that performs it', (label, fulfilledBy, panel) => {
    const tile = tiles.get(label);
    expect(tile, `${label} is defined`).toBeDefined();
    expect(tile?.fulfilledBy).toBe(fulfilledBy);
    expect(tile?.opensPanel).toBe(panel);
    expect(offered.has(label), `${label} is rendered in the All-tools panel`).toBe(true);
  });
});
