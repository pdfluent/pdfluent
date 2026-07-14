#!/usr/bin/env node
// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * CI pre-build check: verify the pre-built xfa-wasm pkg was correctly
 * extracted from the XFA_WASM_PKG_TARBALL before the Tauri build starts.
 *
 * This is a desktop-Tauri-specific check. The desktop app does not import
 * xfa-wasm in the frontend (it uses the Rust backend directly). The tarball
 * is extracted into the XFA SDK tree so CI has the full SDK available; this
 * script just asserts the extraction succeeded.
 *
 * If the WASM frontend integration is added later, extend this script to call
 * check-wasm-stale.mjs and check-wasm-contract.mjs.
 */

import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const appRoot = process.cwd();
const pkgWasm = path.resolve(appRoot, '../../XFA/crates/xfa-wasm/pkg/xfa_wasm_bg.wasm');
const pkgDts  = path.resolve(appRoot, '../../XFA/crates/xfa-wasm/pkg/xfa_wasm.d.ts');

let ok = true;

for (const [label, filePath] of [['xfa_wasm_bg.wasm', pkgWasm], ['xfa_wasm.d.ts', pkgDts]]) {
  if (!existsSync(filePath)) {
    console.error(`MISSING: ${label} at ${filePath}`);
    console.error('  The XFA_WASM_PKG_TARBALL extraction may have failed.');
    ok = false;
  } else {
    const data   = readFileSync(filePath);
    const hash   = createHash('sha256').update(data).digest('hex').slice(0, 16);
    console.log(`OK: ${label} (${data.length} bytes, sha256=${hash}...)`);
  }
}

if (!ok) process.exit(1);
