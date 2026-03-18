// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const eventsSource = readFileSync(
  new URL('../src/viewer/state/documentEvents.ts', import.meta.url),
  'utf8'
);

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// documentEvents.ts — types
// ---------------------------------------------------------------------------

describe('documentEvents — DocumentEventType', () => {
  it('defines annotation_created', () => {
    expect(eventsSource).toContain("'annotation_created'");
  });

  it('defines annotation_updated', () => {
    expect(eventsSource).toContain("'annotation_updated'");
  });

  it('defines annotation_deleted', () => {
    expect(eventsSource).toContain("'annotation_deleted'");
  });

  it('defines redaction_created', () => {
    expect(eventsSource).toContain("'redaction_created'");
  });

  it('defines redaction_applied', () => {
    expect(eventsSource).toContain("'redaction_applied'");
  });

  it('defines metadata_changed', () => {
    expect(eventsSource).toContain("'metadata_changed'");
  });

  it('defines form_field_updated', () => {
    expect(eventsSource).toContain("'form_field_updated'");
  });

  it('defines page_mutated', () => {
    expect(eventsSource).toContain("'page_mutated'");
  });
});

describe('documentEvents — DocumentEvent interface', () => {
  it('has id field', () => {
    expect(eventsSource).toContain('readonly id:');
  });

  it('has type field', () => {
    expect(eventsSource).toContain('readonly type: DocumentEventType');
  });

  it('has timestamp field', () => {
    expect(eventsSource).toContain('readonly timestamp: Date');
  });

  it('has user field', () => {
    expect(eventsSource).toContain('readonly user: string');
  });

  it('has page field', () => {
    expect(eventsSource).toContain('readonly page: number');
  });

  it('has objectId field', () => {
    expect(eventsSource).toContain('readonly objectId: string');
  });

  it('has description field', () => {
    expect(eventsSource).toContain('readonly description: string');
  });
});

describe('documentEvents — DOCUMENT_EVENT_LOG_MAX', () => {
  it('defines a maximum log size constant', () => {
    expect(eventsSource).toContain('DOCUMENT_EVENT_LOG_MAX');
  });

  it('max is 1000', () => {
    expect(eventsSource).toContain('DOCUMENT_EVENT_LOG_MAX = 1000');
  });
});

describe('documentEvents — makeDocumentEvent', () => {
  it('exports makeDocumentEvent function', () => {
    expect(eventsSource).toContain('export function makeDocumentEvent(');
  });

  it('generates a unique id with evt- prefix', () => {
    expect(eventsSource).toContain('`evt-');
  });

  it('sets timestamp to new Date()', () => {
    expect(eventsSource).toContain('timestamp: new Date()');
  });
});

describe('documentEvents — appendEvent', () => {
  it('exports appendEvent function', () => {
    expect(eventsSource).toContain('export function appendEvent(');
  });

  it('spreads existing log and appends new event', () => {
    expect(eventsSource).toContain('[...log, event]');
  });

  it('enforces max size by slicing from end', () => {
    expect(eventsSource).toContain('DOCUMENT_EVENT_LOG_MAX');
    expect(eventsSource).toContain('.slice(');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — event log state
// ---------------------------------------------------------------------------

describe('ViewerApp — documentEventLog state', () => {
  it('declares documentEventLog state', () => {
    expect(viewerAppSource).toContain('documentEventLog');
  });

  it('declares setDocumentEventLog', () => {
    expect(viewerAppSource).toContain('setDocumentEventLog');
  });

  it('imports makeDocumentEvent from documentEvents', () => {
    expect(viewerAppSource).toContain('makeDocumentEvent');
  });

  it('imports appendEvent from documentEvents', () => {
    expect(viewerAppSource).toContain('appendEvent');
  });

  it('imports DocumentEvent type', () => {
    expect(viewerAppSource).toContain('DocumentEvent');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — event emission points
// ---------------------------------------------------------------------------

describe('ViewerApp — emits annotation_created event', () => {
  it('calls setDocumentEventLog after successful annotation create', () => {
    const fnStart = viewerAppSource.indexOf('handleAddComment = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setDocumentEventLog(');
    expect(fnBody).toContain("'annotation_created'");
  });
});

describe('ViewerApp — emits annotation_deleted event', () => {
  it('calls setDocumentEventLog after successful annotation delete', () => {
    const fnStart = viewerAppSource.indexOf('handleDeleteComment = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setDocumentEventLog(');
    expect(fnBody).toContain("'annotation_deleted'");
  });
});

describe('ViewerApp — emits annotation_updated event', () => {
  it('calls setDocumentEventLog after successful annotation update', () => {
    const fnStart = viewerAppSource.indexOf('handleUpdateComment = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setDocumentEventLog(');
    expect(fnBody).toContain("'annotation_updated'");
  });
});

describe('ViewerApp — emits metadata_changed event', () => {
  it('calls setDocumentEventLog after metadata change', () => {
    const fnStart = viewerAppSource.indexOf('handleMetadataChange = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setDocumentEventLog(');
    expect(fnBody).toContain("'metadata_changed'");
  });
});

describe('ViewerApp — emits form_field_updated event', () => {
  it('calls setDocumentEventLog after form field update', () => {
    const fnStart = viewerAppSource.indexOf('handleSetFieldValue = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setDocumentEventLog(');
    expect(fnBody).toContain("'form_field_updated'");
  });
});

describe('ViewerApp — emits redaction_applied event', () => {
  it('calls setDocumentEventLog after redactions applied', () => {
    const fnStart = viewerAppSource.indexOf('handleApplyRedactions = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setDocumentEventLog(');
    expect(fnBody).toContain("'redaction_applied'");
  });
});

describe('ViewerApp — emits page_mutated event', () => {
  it('calls setDocumentEventLog after page mutation', () => {
    const fnStart = viewerAppSource.indexOf('handlePageMutation = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setDocumentEventLog(');
    expect(fnBody).toContain("'page_mutated'");
  });
});

describe('ViewerApp — emits redaction_created event', () => {
  it('calls setDocumentEventLog after redaction drawn', () => {
    const fnStart = viewerAppSource.indexOf('handleRedactionDraw = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setDocumentEventLog(');
    expect(fnBody).toContain("'redaction_created'");
  });
});
