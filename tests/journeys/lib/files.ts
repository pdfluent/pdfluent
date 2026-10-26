// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { chmodSync } from 'node:fs';

/**
 * Make `file` impossible to save over, or writable again. The editor's save
 * writes a temp file and renames it into place, and when the folder refuses
 * that (a macOS sandbox grant covers the file, not its folder) it rewrites
 * the file in place with a backup. A failed save therefore needs both refused:
 * the folder and the file. On Windows the read-only attribute on the file
 * refuses both the rename over it and the in-place write.
 */
export function lock(dir: string, file: string, locked: boolean): void {
  chmodSync(file, locked ? 0o444 : 0o644);
  if (process.platform !== 'win32') chmodSync(dir, locked ? 0o555 : 0o755);
}
