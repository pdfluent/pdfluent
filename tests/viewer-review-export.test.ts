// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const rightPanelSource = readFileSync(
  new URL('../src/viewer/components/RightContextPanel.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// Export functions — buildExportMarkdown
// ---------------------------------------------------------------------------

describe('ReviewModeContent — buildExportMarkdown', () => {
  it('defines buildExportMarkdown function', () => {
    expect(rightPanelSource).toContain('function buildExportMarkdown()');
  });

  it('includes Review samenvatting heading', () => {
    const fnStart = rightPanelSource.indexOf('function buildExportMarkdown()');
    const fnEnd = rightPanelSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = rightPanelSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('Review samenvatting');
  });

  it('includes page number (pageIndex + 1) in output', () => {
    const fnStart = rightPanelSource.indexOf('function buildExportMarkdown()');
    const fnEnd = rightPanelSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = rightPanelSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('pageIndex + 1');
  });

  it('includes author in output', () => {
    const fnStart = rightPanelSource.indexOf('function buildExportMarkdown()');
    const fnEnd = rightPanelSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = rightPanelSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('author');
  });

  it('includes status in output', () => {
    const fnStart = rightPanelSource.indexOf('function buildExportMarkdown()');
    const fnEnd = rightPanelSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = rightPanelSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('status');
  });

  it('includes contents in output', () => {
    const fnStart = rightPanelSource.indexOf('function buildExportMarkdown()');
    const fnEnd = rightPanelSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = rightPanelSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('contents');
  });

  it('includes replies in output', () => {
    const fnStart = rightPanelSource.indexOf('function buildExportMarkdown()');
    const fnEnd = rightPanelSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = rightPanelSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('replies');
  });
});

// ---------------------------------------------------------------------------
// Export functions — buildExportJson
// ---------------------------------------------------------------------------

describe('ReviewModeContent — buildExportJson', () => {
  it('defines buildExportJson function', () => {
    expect(rightPanelSource).toContain('function buildExportJson()');
  });

  it('calls JSON.stringify', () => {
    const fnStart = rightPanelSource.indexOf('function buildExportJson()');
    const fnEnd = rightPanelSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = rightPanelSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('JSON.stringify');
  });

  it('includes page field (pageIndex + 1)', () => {
    const fnStart = rightPanelSource.indexOf('function buildExportJson()');
    const fnEnd = rightPanelSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = rightPanelSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('pageIndex + 1');
  });

  it('includes author field', () => {
    const fnStart = rightPanelSource.indexOf('function buildExportJson()');
    const fnEnd = rightPanelSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = rightPanelSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('author');
  });

  it('includes status field', () => {
    const fnStart = rightPanelSource.indexOf('function buildExportJson()');
    const fnEnd = rightPanelSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = rightPanelSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('status');
  });

  it('includes contents field', () => {
    const fnStart = rightPanelSource.indexOf('function buildExportJson()');
    const fnEnd = rightPanelSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = rightPanelSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('contents');
  });

  it('includes replies field', () => {
    const fnStart = rightPanelSource.indexOf('function buildExportJson()');
    const fnEnd = rightPanelSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = rightPanelSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('replies');
  });
});

// ---------------------------------------------------------------------------
// Export functions — handleExportReview dispatcher
// ---------------------------------------------------------------------------

describe('ReviewModeContent — handleExportReview', () => {
  it('defines handleExportReview function', () => {
    expect(rightPanelSource).toContain('function handleExportReview(');
  });

  it('accepts a format parameter', () => {
    const fnStart = rightPanelSource.indexOf('function handleExportReview(');
    const fnEnd = rightPanelSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = rightPanelSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('format');
  });

  it('calls buildExportMarkdown for markdown format', () => {
    const fnStart = rightPanelSource.indexOf('function handleExportReview(');
    const fnEnd = rightPanelSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = rightPanelSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('buildExportMarkdown');
  });

  it('calls buildExportJson for json format', () => {
    const fnStart = rightPanelSource.indexOf('function handleExportReview(');
    const fnEnd = rightPanelSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = rightPanelSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('buildExportJson');
  });

  it('creates a Blob and triggers download', () => {
    const fnStart = rightPanelSource.indexOf('function handleExportReview(');
    const fnEnd = rightPanelSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = rightPanelSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('new Blob');
    expect(fnBody).toContain('URL.createObjectURL');
    expect(fnBody).toContain('.click()');
  });

  it('revokes object URL after download', () => {
    const fnStart = rightPanelSource.indexOf('function handleExportReview(');
    const fnEnd = rightPanelSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = rightPanelSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('URL.revokeObjectURL');
  });

  it('uses correct file extension for markdown', () => {
    const fnStart = rightPanelSource.indexOf('function handleExportReview(');
    const fnEnd = rightPanelSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = rightPanelSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("'md'");
  });

  it('uses correct file extension for json', () => {
    const fnStart = rightPanelSource.indexOf('function handleExportReview(');
    const fnEnd = rightPanelSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = rightPanelSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("'json'");
  });
});

// ---------------------------------------------------------------------------
// Export UI — buttons rendered
// ---------------------------------------------------------------------------

describe('ReviewModeContent — export buttons in UI', () => {
  it('renders export-review-md-btn', () => {
    expect(rightPanelSource).toContain('data-testid="export-review-md-btn"');
  });

  it('renders export-review-json-btn', () => {
    expect(rightPanelSource).toContain('data-testid="export-review-json-btn"');
  });

  it('md button calls handleExportReview with markdown', () => {
    const btnStart = rightPanelSource.indexOf('export-review-md-btn');
    const btnEnd = rightPanelSource.indexOf('</button>', btnStart) + 9;
    const btnBody = rightPanelSource.slice(btnStart, btnEnd);
    expect(btnBody).toContain("handleExportReview('markdown')");
  });

  it('json button calls handleExportReview with json', () => {
    const btnStart = rightPanelSource.indexOf('export-review-json-btn');
    const btnEnd = rightPanelSource.indexOf('</button>', btnStart) + 9;
    const btnBody = rightPanelSource.slice(btnStart, btnEnd);
    expect(btnBody).toContain("handleExportReview('json')");
  });
});
