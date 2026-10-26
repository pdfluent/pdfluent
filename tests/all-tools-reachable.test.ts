// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The All-tools modal was unreachable: thirty-five registered tools, a modal that
// nothing opened (found by the ui-walk probes, #471). These cases pin the way in.
// There is no DOM in this test environment, so the click is followed through the
// pieces: the button renders and calls what it is given, the shell hands it the
// opener, the app turns the opener into an open modal, the modal lists the tiles,
// and a tile does what the register says. The real-app walk (S5) clicks it for real.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import i18n from '../src/i18n';

// The wording is asserted in English; a machine set to Dutch would render Dutch.
beforeAll(async () => { await i18n.changeLanguage('en'); });
import { AllToolsPanel, activateTile } from '../src/viewer/components/AllToolsPanel';
import { AllToolsButton } from '../src/viewer/v3/AllToolsButton';

const ROOT = resolve(import.meta.dirname, '..');
const read = (rel: string): string => readFileSync(resolve(ROOT, rel), 'utf8');

describe('the top bar opens the All-tools modal', () => {
  it('draws a visible, labelled button with a test id', () => {
    const html = renderToStaticMarkup(createElement(AllToolsButton, { onOpen: () => {} }));
    expect(html).toContain('data-testid="all-tools-btn"');
    expect(html).toContain('aria-label="All tools"');
  });

  it('the button calls the opener it is given, and nothing else', () => {
    const source = read('src/viewer/v3/AllToolsButton.tsx');
    expect(source).toContain('onClick={onOpen}');
  });

  it('the shell puts it in the top bar and hands it the app\'s opener', () => {
    const shell = read('src/viewer/v3/EditorV3Shell.tsx');
    expect(shell).toContain('<AllToolsButton onOpen={props.onOpenAllTools} />');
    expect(shell).toMatch(/<EditorV3TopBar[\s\S]*?onOpenAllTools=\{onOpenAllTools\}[\s\S]*?\/>/);
  });

  it('the app turns that into an open modal, which renders while it is open', () => {
    const app = read('src/viewer/ViewerApp.tsx');
    expect(app).toContain('onOpenAllTools={() => { setAllToolsOpen(true); }}');
    expect(app).toMatch(/\{allToolsOpen && \(\s*<Suspense[\s\S]*?<AllToolsPanel/);
  });

  it('the label is a translation key present in English', () => {
    const en = JSON.parse(read('src/i18n/locales/en.json')) as { editorV3: { topbar: Record<string, string> } };
    expect(en.editorV3.topbar.allTools).toBe('All tools');
  });
});

describe('the modal lists tiles, and a tile does what it should', () => {
  it('renders a tile per wired tool, each with the test id the walk looks for', () => {
    const html = renderToStaticMarkup(createElement(AllToolsPanel, {
      isOpen: true, onClose: () => {}, onModeSelect: () => {}, onOpenPanel: () => {},
    }));
    const ids = [...html.matchAll(/data-testid="all-tools-(toolbar\.[A-Za-z]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(10);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('clicking a tile that opens a panel opens it and closes the modal', () => {
    const onOpenPanel = vi.fn();
    const onModeSelect = vi.fn();
    const onClose = vi.fn();
    activateTile({ opensPanel: 'compress' }, 'edit', { onOpenPanel, onModeSelect, onClose });
    expect(onOpenPanel).toHaveBeenCalledWith('compress');
    expect(onModeSelect).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('clicking a tile without a panel switches to its mode and closes the modal', () => {
    const onOpenPanel = vi.fn();
    const onModeSelect = vi.fn();
    const onClose = vi.fn();
    activateTile({}, 'sign', { onOpenPanel, onModeSelect, onClose });
    expect(onModeSelect).toHaveBeenCalledWith('sign');
    expect(onOpenPanel).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
