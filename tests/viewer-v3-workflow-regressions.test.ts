// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const viewerAppSource = readFileSync(join(root, 'src/viewer/ViewerApp.tsx'), 'utf8');
const shellSource = readFileSync(join(root, 'src/viewer/v3/EditorV3Shell.tsx'), 'utf8');
const settingsSource = readFileSync(join(root, 'src/components/Settings.tsx'), 'utf8');
const topBarSource = readFileSync(join(root, 'src/viewer/components/TopBar.tsx'), 'utf8');
const organizeSource = readFileSync(join(root, 'src/viewer/components/OrganizeGrid.tsx'), 'utf8');
const queryEngineSource = readFileSync(join(root, 'src/platform/engine/tauri/TauriQueryEngine.ts'), 'utf8');
const transformEngineSource = readFileSync(join(root, 'src/platform/engine/tauri/TauriTransformEngine.ts'), 'utf8');
const fileDialogsSource = readFileSync(join(root, 'src/platform/native/fileDialogs.ts'), 'utf8');
const rustLibSource = readFileSync(join(root, 'src-tauri/src/lib.rs'), 'utf8');
const rustPdfEngineSource = readFileSync(join(root, 'src-tauri/src/pdf_engine.rs'), 'utf8');
const cargoTomlSource = readFileSync(join(root, 'src-tauri/Cargo.toml'), 'utf8');
const cssSource = readFileSync(join(root, 'src/styles/viewer-v3.css'), 'utf8');

describe('V3 summary workflow', () => {
  it('summary panel is removed — no summary entry points remain in the shell', () => {
    // Summary and translation are intentionally removed features.
    expect(shellSource).not.toContain("panel === 'summary'");
    expect(shellSource).not.toContain("'summary' | ");
    expect(shellSource).not.toContain("| 'summary'");
    expect(shellSource).not.toContain('className="panel panel-wide summary-panel"');
    expect(shellSource).not.toContain('summaryText');
    expect(viewerAppSource).not.toContain('documentSummaryText');
    expect(viewerAppSource).not.toContain('documentSummaryTextStatus');
  });

  it('provides a back button from deeper tool panels to the all-tools panel', () => {
    expect(shellSource).toContain("panel !== 'tools'");
    expect(shellSource).toContain("aria-label={t('editorV3.common.backToTools')}");
    expect(shellSource).toContain("onPanelChange('tools')");
    expect(cssSource).toContain('.pfv3 .panel-back');
  });
});

describe('V3 native menu and licensing workflow', () => {
  it('routes native menu events to the same app actions as the toolbar', () => {
    expect(viewerAppSource).toContain("listen<string>('menu-event'");
    expect(viewerAppSource).toContain("case 'file_open'");
    expect(viewerAppSource).toContain('void handleOpenFile()');
    expect(viewerAppSource).toContain('window.setTimeout(() => { void handleOpenFile(); }, 0)');
    expect(viewerAppSource).toContain("case 'file_save'");
    expect(viewerAppSource).toContain('void handleRuntimeSave()');
    expect(viewerAppSource).toContain("case 'view_zoom_in'");
  });

  it('opens PDFs through the async frontend dialog instead of a blocking menu command', () => {
    expect(fileDialogsSource).toContain("@tauri-apps/plugin-dialog");
    expect(fileDialogsSource).toContain("multiple: false");
    expect(fileDialogsSource).toContain("extensions: ['pdf']");
    expect(viewerAppSource).toContain("import { pickPdfPath } from '../platform/native/fileDialogs'");
    expect(shellSource).toContain("import { pickPdfPath } from '../../platform/native/fileDialogs'");
    expect(topBarSource).toContain("import { pickPdfPath } from '../../platform/native/fileDialogs'");
    expect(viewerAppSource).not.toContain("'pick_pdf_dialog'");
    expect(shellSource).not.toContain("'pick_pdf_dialog'");
    expect(topBarSource).not.toContain("'pick_pdf_dialog'");
  });

  it('the editor is free — no in-app licensing/pricing UI remains', () => {
    // The app has no license activation, pricing links, or "buy license" UI
    // anywhere — it is free for everyone, including commercial use.
    expect(settingsSource).not.toContain('pdfluent.com/pricing');
    expect(settingsSource).not.toContain('about.nonCommercial');
    expect(settingsSource).not.toContain('about.buyLicense');
    expect(settingsSource).not.toContain('license.');
    expect(shellSource).not.toContain('editorV3.menu.manageLicense');
    expect(shellSource).not.toContain('editorV3.menu.license');
    expect(rustLibSource).not.toContain('help_open_pricing');
    expect(rustLibSource).not.toContain('Buy Commercial License');
    expect(rustLibSource).not.toContain('Commercial use requires a valid license');
    // Separate Help entries stay: proprietary EULA/terms vs third-party OSS notices.
    expect(rustLibSource).toContain('License & Terms');
    expect(rustLibSource).toContain('Open Source Notices');
    expect(rustLibSource).toContain('THIRD_PARTY.md');
    // OSS notices must NOT route to the proprietary license URL.
    expect(rustLibSource).toContain('open_oss_notices');
  });
});

describe('V3 XFA and active-content workflow', () => {
  it('uses the native XFA feature and exposes a real flatten command', () => {
    expect(cargoTomlSource).toContain('pdf-engine = { path = "../../../XFA/crates/pdf-engine", features = ["xfa", "serde"] }');
    expect(rustPdfEngineSource).toContain('pub fn flatten_xfa(&mut self)');
    expect(rustPdfEngineSource).toContain('pdf_engine::xfa::flatten');
    expect(rustLibSource).toContain('fn flatten_xfa');
    expect(rustLibSource).toContain('flatten_xfa,');
    expect(transformEngineSource).toContain("invoke<TauriDocumentInfo>('flatten_xfa')");
    expect(transformEngineSource).not.toContain('flattenXfa requires Tauri backend');
  });

  it('uses capability-based link trust instead of an active-content banner', () => {
    // The alarming open-time trust prompt is gone; capability decisions
    // (opening a URI link) are made at the moment of use, persisted, and
    // reversible via a visible toggle in the Form Bar.
    expect(viewerAppSource).toContain('pdfluent.links.autoOpen');
    expect(viewerAppSource).toContain('persistAutoOpenLinks');
    expect(viewerAppSource).not.toContain('handleActiveContentDecision');
    expect(viewerAppSource).not.toContain('Alle documenten vertrouwen');
    // The persisted preference is tri-state: ask (null) / always (true) / off.
    expect(viewerAppSource).toContain('autoOpenLinks');
  });
});

describe('V3 organize pages workflow', () => {
  it('lets a single selected page move left or right before applying the order', () => {
    expect(organizeSource).toContain('function moveSelectedPage(direction: -1 | 1)');
    expect(organizeSource).toContain('handleLocalReorder(src, dst)');
    expect(organizeSource).toContain('data-testid="organize-move-left-btn"');
    expect(organizeSource).toContain('data-testid="organize-move-right-btn"');
    expect(organizeSource).toContain('canMoveSelectedLeft');
    expect(organizeSource).toContain('canMoveSelectedRight');
  });
});

describe('V3 personal-use notice (removed)', () => {
  it('does NOT show a "Personal use only" notice — the editor is free for everyone', () => {
    expect(shellSource).not.toContain('personal-use-note');
    expect(shellSource).not.toContain('editorV3.personalUse');
    const cssSource = readFileSync(join(root, 'src/styles/viewer-v3.css'), 'utf8');
    expect(cssSource).not.toContain('.personal-use-note');
  });
});
