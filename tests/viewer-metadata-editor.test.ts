// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

const rightPanelSource = readFileSync(
  new URL('../src/viewer/components/RightContextPanel.tsx', import.meta.url),
  'utf8'
);

const pdfEngineSource = readFileSync(
  new URL('../src-tauri/src/pdf_engine.rs', import.meta.url),
  'utf8'
);

const libSource = readFileSync(
  new URL('../src-tauri/src/lib.rs', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// ViewerApp — handleMetadataChange
// ---------------------------------------------------------------------------

describe('ViewerApp — handleMetadataChange', () => {
  it('is defined as a useCallback', () => {
    expect(viewerAppSource).toContain('const handleMetadataChange = useCallback(');
  });

  it('guards against null pdfDoc and non-Tauri env', () => {
    const fnStart = viewerAppSource.indexOf('const handleMetadataChange = useCallback(');
    const fnEnd = viewerAppSource.indexOf('}, [pdfDoc, markDirty])', fnStart) + 25;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('!pdfDoc');
    expect(fnBody).toContain('!isTauri');
  });

  it('invokes set_metadata with title when key is title', () => {
    const fnStart = viewerAppSource.indexOf('const handleMetadataChange = useCallback(');
    const fnEnd = viewerAppSource.indexOf('}, [pdfDoc, markDirty])', fnStart) + 25;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("invoke('set_metadata'");
    expect(fnBody).toContain("key === 'title' ? value : null");
  });

  it('invokes set_metadata with author when key is author', () => {
    const fnStart = viewerAppSource.indexOf('const handleMetadataChange = useCallback(');
    const fnEnd = viewerAppSource.indexOf('}, [pdfDoc, markDirty])', fnStart) + 25;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("key === 'author' ? value : null");
  });

  it('calls markDirty() after invoking set_metadata', () => {
    const fnStart = viewerAppSource.indexOf('const handleMetadataChange = useCallback(');
    const fnEnd = viewerAppSource.indexOf('}, [pdfDoc, markDirty])', fnStart) + 25;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    const invokePos = fnBody.indexOf("invoke('set_metadata'");
    const markDirtyPos = fnBody.indexOf('markDirty()');
    expect(invokePos).toBeGreaterThan(-1);
    expect(markDirtyPos).toBeGreaterThan(invokePos);
  });

  it('has pdfDoc and markDirty in the dep array', () => {
    expect(viewerAppSource).toContain('}, [pdfDoc, markDirty])');
  });

  it('passes handleMetadataChange to RightContextPanel as onMetadataChange', () => {
    expect(viewerAppSource).toContain('onMetadataChange={handleMetadataChange}');
  });
});

// ---------------------------------------------------------------------------
// RightContextPanelProps — onMetadataChange
// ---------------------------------------------------------------------------

describe('RightContextPanel — onMetadataChange prop contract', () => {
  it('onMetadataChange is in RightContextPanelProps', () => {
    const ifaceStart = rightPanelSource.indexOf('interface RightContextPanelProps');
    const ifaceEnd = rightPanelSource.indexOf('\n}', ifaceStart) + 2;
    const iface = rightPanelSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain("onMetadataChange: (key: 'title' | 'author' | 'subject' | 'keywords', value: string) => void");
  });

  it('onMetadataChange is destructured in RightContextPanel function', () => {
    const componentDecl = rightPanelSource.slice(rightPanelSource.indexOf('export function RightContextPanel('));
    expect(componentDecl).toContain('onMetadataChange');
  });

  it('onMetadataChange is forwarded to MetadataInfo', () => {
    expect(rightPanelSource).toContain('onMetadataChange={onMetadataChange}');
  });
});

// ---------------------------------------------------------------------------
// MetadataInfo — prop signature
// ---------------------------------------------------------------------------

describe('MetadataInfo — receives onMetadataChange prop', () => {
  it('MetadataInfo is defined with onMetadataChange in its props', () => {
    const fnStart = rightPanelSource.indexOf('function MetadataInfo({');
    const fnEnd = rightPanelSource.indexOf('}) {', fnStart) + 4;
    const signature = rightPanelSource.slice(fnStart, fnEnd);
    expect(signature).toContain('onMetadataChange');
  });

  it('MetadataInfo prop type declares onMetadataChange with correct signature', () => {
    const fnStart = rightPanelSource.indexOf('function MetadataInfo({');
    const fnEnd = rightPanelSource.indexOf('}) {', fnStart) + 4;
    const signature = rightPanelSource.slice(fnStart, fnEnd);
    expect(signature).toContain("onMetadataChange: (key: 'title' | 'author' | 'subject' | 'keywords', value: string) => void");
  });
});

// ---------------------------------------------------------------------------
// MetadataInfo — inline editing inputs
// ---------------------------------------------------------------------------

describe('MetadataInfo — metadata-title-input', () => {
  it('renders metadata-title-input', () => {
    expect(rightPanelSource).toContain('data-testid="metadata-title-input"');
  });

  it('title input calls onMetadataChange with title key on blur', () => {
    const inputPos = rightPanelSource.indexOf('data-testid="metadata-title-input"');
    const inputEnd = rightPanelSource.indexOf('/>', inputPos) + 2;
    const inputEl = rightPanelSource.slice(inputPos, inputEnd);
    expect(inputEl).toContain("onMetadataChange('title'");
  });

  it('title input blur handler uses e.currentTarget.value', () => {
    const inputPos = rightPanelSource.indexOf('data-testid="metadata-title-input"');
    const inputEnd = rightPanelSource.indexOf('/>', inputPos) + 2;
    const inputEl = rightPanelSource.slice(inputPos, inputEnd);
    expect(inputEl).toContain('e.currentTarget.value');
  });

  it('title input uses onBlur (not onChange) to save', () => {
    const inputPos = rightPanelSource.indexOf('data-testid="metadata-title-input"');
    const inputEnd = rightPanelSource.indexOf('/>', inputPos) + 2;
    const inputEl = rightPanelSource.slice(inputPos, inputEnd);
    expect(inputEl).toContain('onBlur');
  });
});

describe('MetadataInfo — metadata-author-input', () => {
  it('renders metadata-author-input', () => {
    expect(rightPanelSource).toContain('data-testid="metadata-author-input"');
  });

  it('author input calls onMetadataChange with author key on blur', () => {
    const inputPos = rightPanelSource.indexOf('data-testid="metadata-author-input"');
    const inputEnd = rightPanelSource.indexOf('/>', inputPos) + 2;
    const inputEl = rightPanelSource.slice(inputPos, inputEnd);
    expect(inputEl).toContain("onMetadataChange('author'");
  });

  it('author input blur handler uses e.currentTarget.value', () => {
    const inputPos = rightPanelSource.indexOf('data-testid="metadata-author-input"');
    const inputEnd = rightPanelSource.indexOf('/>', inputPos) + 2;
    const inputEl = rightPanelSource.slice(inputPos, inputEnd);
    expect(inputEl).toContain('e.currentTarget.value');
  });

  it('author input uses onBlur (not onChange) to save', () => {
    const inputPos = rightPanelSource.indexOf('data-testid="metadata-author-input"');
    const inputEnd = rightPanelSource.indexOf('/>', inputPos) + 2;
    const inputEl = rightPanelSource.slice(inputPos, inputEnd);
    expect(inputEl).toContain('onBlur');
  });
});

// ---------------------------------------------------------------------------
// No regressions — existing doc-info panel still intact
// ---------------------------------------------------------------------------

describe('MetadataInfo — no regressions', () => {
  it('doc-info-panel testid still present', () => {
    expect(rightPanelSource).toContain('data-testid="doc-info-panel"');
  });

  it('doc-info-page-count testid still present', () => {
    expect(rightPanelSource).toContain('data-testid="doc-info-page-count"');
  });

  it('doc-info-dimensions testid still present', () => {
    expect(rightPanelSource).toContain('data-testid="doc-info-dimensions"');
  });

  it('doc-info-form-type testid still present', () => {
    expect(rightPanelSource).toContain('data-testid="doc-info-form-type"');
  });

  it('doc-info-pdf-version testid still present', () => {
    expect(rightPanelSource).toContain('data-testid="doc-info-pdf-version"');
  });

  it('doc-info-creation-date testid still present', () => {
    expect(rightPanelSource).toContain('data-testid="doc-info-creation-date"');
  });

  it('handleSetFieldValue still in ViewerApp', () => {
    expect(viewerAppSource).toContain('const handleSetFieldValue = useCallback');
  });

  it('handleFormSubmit still in ViewerApp', () => {
    expect(viewerAppSource).toContain('const handleFormSubmit = useCallback');
  });
});

// ---------------------------------------------------------------------------
// Rust backend — set_document_info
// ---------------------------------------------------------------------------

describe('Rust pdf_engine — set_document_info', () => {
  it('set_document_info method is defined on OpenDocument', () => {
    expect(pdfEngineSource).toContain('pub fn set_document_info(');
  });

  it('accepts title as Option<String>', () => {
    const fnStart = pdfEngineSource.indexOf('pub fn set_document_info(');
    const fnEnd = pdfEngineSource.indexOf(') -> Result<(), String>', fnStart) + 25;
    const sig = pdfEngineSource.slice(fnStart, fnEnd);
    expect(sig).toContain('title: Option<String>');
  });

  it('accepts author as Option<String>', () => {
    const fnStart = pdfEngineSource.indexOf('pub fn set_document_info(');
    const fnEnd = pdfEngineSource.indexOf(') -> Result<(), String>', fnStart) + 25;
    const sig = pdfEngineSource.slice(fnStart, fnEnd);
    expect(sig).toContain('author: Option<String>');
  });

  it('writes Title into the lopdf Info dictionary', () => {
    const fnStart = pdfEngineSource.indexOf('pub fn set_document_info(');
    const fnEnd = pdfEngineSource.indexOf('\n    }', fnStart + 100) + 6;
    const fnBody = pdfEngineSource.slice(fnStart, fnEnd + 200);
    expect(fnBody).toContain('b"Title"');
  });

  it('writes Author into the lopdf Info dictionary', () => {
    const fnStart = pdfEngineSource.indexOf('pub fn set_document_info(');
    const fnEnd = pdfEngineSource.indexOf('\n    }', fnStart + 100) + 6;
    const fnBody = pdfEngineSource.slice(fnStart, fnEnd + 200);
    expect(fnBody).toContain('b"Author"');
  });

  it('sets self.modified = true', () => {
    const fnStart = pdfEngineSource.indexOf('pub fn set_document_info(');
    const fnEnd = pdfEngineSource.indexOf('self.modified = true', fnStart) + 22;
    const fnBody = pdfEngineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('self.modified = true');
  });

  it('handles missing Info dict by creating one', () => {
    const fnStart = pdfEngineSource.indexOf('pub fn set_document_info(');
    const fnEnd = pdfEngineSource.indexOf('self.modified = true', fnStart) + 22;
    const fnBody = pdfEngineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('add_object');
    expect(fnBody).toContain('b"Info"');
  });
});

// ---------------------------------------------------------------------------
// Rust backend — set_metadata Tauri command
// ---------------------------------------------------------------------------

describe('Rust lib — set_metadata command', () => {
  it('set_metadata is defined as a Tauri command', () => {
    expect(libSource).toContain('fn set_metadata(');
  });

  it('set_metadata calls set_document_info', () => {
    const fnStart = libSource.indexOf('fn set_metadata(');
    const fnEnd = libSource.indexOf('}', fnStart) + 1;
    const fnBody = libSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('set_document_info');
  });

  it('set_metadata is registered in generate_handler', () => {
    expect(libSource).toContain('set_metadata,');
  });
});
