import { describe, expect, it } from 'vitest';
import {
  makeAppError,
  makeDocumentLoadError,
  type AppError,
  type ErrorTaxonomy,
} from '../src/viewer/state/errorCenter';

// ---------------------------------------------------------------------------
// Crash Fixture Classification
//
// Verifies that different failure modes map to the correct taxonomy bucket.
// These are operational regression tests: if a new crash type is discovered,
// it MUST map to a known taxonomy entry.
// ---------------------------------------------------------------------------

describe('crash fixture — parser crashes', () => {
  it('missing trailer → parser_crash.missing_trailer', () => {
    const err = makeAppError(
      'error',
      'PDF parse failed',
      'missing trailer',
      'document_load',
      'parser_crash.missing_trailer',
      false,
      'CORRUPT_PDF'
    );
    expect(err.taxonomy).toBe('parser_crash.missing_trailer');
    expect(err.recoverable).toBe(false);
  });

  it('bad xref → parser_crash.bad_xref', () => {
    const err = makeAppError(
      'error',
      'PDF parse failed',
      'bad startxref',
      'document_load',
      'parser_crash.bad_xref',
      false,
      'CORRUPT_PDF'
    );
    expect(err.taxonomy).toBe('parser_crash.bad_xref');
  });

  it('invalid object → parser_crash.invalid_object', () => {
    const err = makeAppError(
      'error',
      'PDF parse failed',
      'invalid object stream',
      'document_load',
      'parser_crash.invalid_object',
      false,
      'CORRUPT_PDF'
    );
    expect(err.taxonomy).toBe('parser_crash.invalid_object');
  });

  it('encrypted without password → parser_crash.encrypted_no_password', () => {
    const err = makeAppError(
      'error',
      'Password required',
      'The PDF is encrypted',
      'document_load',
      'parser_crash.encrypted_no_password',
      true,
      'ENCRYPTED'
    );
    expect(err.taxonomy).toBe('parser_crash.encrypted_no_password');
    expect(err.recoverable).toBe(true);
  });
});

describe('crash fixture — render crashes', () => {
  it('font not found → render_crash.font_not_found', () => {
    const err = makeAppError(
      'error',
      'Render failed',
      "Font 'Helvetica' not found",
      'render',
      'render_crash.font_not_found',
      false,
      'FONT_NOT_FOUND'
    );
    expect(err.taxonomy).toBe('render_crash.font_not_found');
  });

  it('limit exceeded → render_crash.limit_exceeded', () => {
    const err = makeAppError(
      'error',
      'Render failed',
      'Allocation cap hit',
      'render',
      'render_crash.limit_exceeded',
      true,
      'LIMIT_EXCEEDED'
    );
    expect(err.taxonomy).toBe('render_crash.limit_exceeded');
    expect(err.recoverable).toBe(true);
  });
});

describe('crash fixture — flatten crashes', () => {
  it('xfa not found → flatten_crash.xfa_not_found', () => {
    const err = makeAppError(
      'error',
      'Flatten failed',
      'Document has no XFA form',
      'flatten',
      'flatten_crash.xfa_not_found',
      false,
      'XFA_FLATTEN_FAILED'
    );
    expect(err.taxonomy).toBe('flatten_crash.xfa_not_found');
  });

  it('unsupported script → flatten_crash.unsupported_script', () => {
    const err = makeAppError(
      'error',
      'Flatten failed',
      'FormCalc script not supported',
      'flatten',
      'flatten_crash.unsupported_script',
      false,
      'XFA_FLATTEN_FAILED'
    );
    expect(err.taxonomy).toBe('flatten_crash.unsupported_script');
  });
});

describe('crash fixture — Tauri runtime failures', () => {
  it('IPC timeout → tauri_runtime_failure.ipc_timeout', () => {
    const err = makeAppError(
      'error',
      'Desktop operation timed out',
      'Command took too long',
      'tauri',
      'tauri_runtime_failure.ipc_timeout',
      true,
      'IPC_TIMEOUT'
    );
    expect(err.taxonomy).toBe('tauri_runtime_failure.ipc_timeout');
  });

  it('fs permission → tauri_runtime_failure.fs_permission', () => {
    const err = makeAppError(
      'error',
      'File access denied',
      'Sandbox blocked file access',
      'tauri',
      'tauri_runtime_failure.fs_permission',
      true,
      'PERMISSION_DENIED'
    );
    expect(err.taxonomy).toBe('tauri_runtime_failure.fs_permission');
  });

  it('plugin crash → tauri_runtime_failure.plugin_crash', () => {
    const err = makeAppError(
      'error',
      'Native command failed',
      'Rust backend command panicked',
      'tauri',
      'tauri_runtime_failure.plugin_crash',
      false,
      'PLUGIN_CRASH'
    );
    expect(err.taxonomy).toBe('tauri_runtime_failure.plugin_crash');
  });
});

describe('crash fixture — unsupported features', () => {
  it('browser save → unsupported_feature.browser_save', () => {
    const err = makeAppError(
      'error',
      'Export not available',
      'Native save is not available in the browser test harness',
      'export',
      'unsupported_feature.browser_save',
      false,
      'UNSUPPORTED_ON_BROWSER'
    );
    expect(err.taxonomy).toBe('unsupported_feature.browser_save');
  });

  it('tier gated → unsupported_feature.tier_gated', () => {
    const err = makeAppError(
      'error',
      'Feature locked',
      'Requires Professional tier',
      'license',
      'unsupported_feature.tier_gated',
      false,
      'FEATURE_NOT_IN_TIER'
    );
    expect(err.taxonomy).toBe('unsupported_feature.tier_gated');
  });
});

describe('crash fixture — environment failures', () => {
  it('disk full → environment_failure.disk_full', () => {
    const err = makeAppError(
      'error',
      'Save failed',
      'Disk is full',
      'save',
      'environment_failure.disk_full',
      true,
      'IO_ERROR'
    );
    expect(err.taxonomy).toBe('environment_failure.disk_full');
  });

  it('memory exhausted → environment_failure.memory_exhausted', () => {
    const err = makeAppError(
      'error',
      'Out of memory',
      'System RAM exhausted',
      'render',
      'environment_failure.memory_exhausted',
      true,
      'LIMIT_EXCEEDED'
    );
    expect(err.taxonomy).toBe('environment_failure.memory_exhausted');
  });
});

describe('crash fixture — artifact failures', () => {
  it('bundled font cache missing → artifact_failure.font_cache_missing', () => {
    const err = makeAppError(
      'error',
      'Bundled fonts missing',
      'resources/fonts/liberation-2.1.5 not found',
      'artifact',
      'artifact_failure.font_cache_missing',
      false,
      'ARTIFACT_MISSING'
    );
    expect(err.taxonomy).toBe('artifact_failure.font_cache_missing');
  });
});

describe('crash fixture — validation failures', () => {
  it('PDF/A noncompliant → validation_failure.pdfa_noncompliant', () => {
    const err = makeAppError(
      'error',
      'Validation failed',
      'Document does not meet PDF/A-2b',
      'validation',
      'validation_failure.pdfa_noncompliant',
      false,
      'PDFA_VALIDATION_FAILED'
    );
    expect(err.taxonomy).toBe('validation_failure.pdfa_noncompliant');
  });
});

describe('crash fixture — package failures', () => {
  it('version mismatch → package_failure.version_mismatch', () => {
    const err = makeAppError(
      'error',
      'Version mismatch',
      'Workspace version != crate version',
      'package',
      'package_failure.version_mismatch',
      false,
      'VERSION_MISMATCH'
    );
    expect(err.taxonomy).toBe('package_failure.version_mismatch');
  });
});

describe('crash fixture — unknown fallback', () => {
  it('unclassified error defaults to unknown taxonomy', () => {
    const err = makeAppError('error', 'Something broke', 'details', 'other');
    expect(err.taxonomy).toBe('unknown');
    expect(err.code).toBe('UNKNOWN');
  });
});
