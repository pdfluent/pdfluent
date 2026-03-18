// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Quick verification script for Tauri engine
 */

// Test if TauriRuntimeAdapter can be created
import { createTauriRuntimeAdapter } from './src/platform/runtime/adapters/TauriRuntimeAdapter';

console.log('=== Tauri Engine Verification ===');

// 1. Test adapter creation
const adapter = createTauriRuntimeAdapter();
console.log('1. Adapter creation:', adapter.runtime, 'priority:', adapter.priority);

// 2. Test adapter availability
const isAvailable = adapter.isAvailable();
console.log('2. Adapter availability:', isAvailable);

// 3. Test adapter metadata
const metadata = adapter.getMetadata();
console.log('3. Adapter metadata:', metadata.name, metadata.version);

// 4. Test adapter capabilities
const capabilities = adapter.getCapabilities();
console.log('4. Adapter capabilities:', capabilities.supportedOperations.length);

// 5. Try to create engine (this will fail in test environment)
try {
  const enginePromise = adapter.createEngine();
  console.log('5. Engine creation attempt: Promise created');
} catch (error) {
  console.log('5. Engine creation error:', error.message);
}

console.log('=== Verification Complete ===');

// Check what Tauri commands are available in backend
console.log('\n=== Backend Tauri Commands ===');
console.log('Available in src-tauri/src/lib.rs:');
console.log('- open_pdf');
console.log('- get_document_info');
console.log('- render_page');
console.log('- render_thumbnail');
console.log('- extract_page_text');
console.log('- search_text');
console.log('- save_pdf');
console.log('- get_form_fields');
console.log('- set_form_field_value');
console.log('- merge_pdfs');
console.log('- split_pdf');
console.log('- rotate_pages');
console.log('- delete_pages');
console.log('- reorder_pages');
console.log('- compress_pdf');
console.log('- add_watermark');
console.log('- add_highlight_annotation');
console.log('- add_underline_annotation');
console.log('- add_comment_annotation');
console.log('- add_shape_annotation');
console.log('- add_ink_annotation');
console.log('- validate_pdfa');
console.log('- convert_to_pdfa');
console.log('- verify_signatures');