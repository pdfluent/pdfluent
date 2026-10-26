// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * Personal-data detection (J-66) is parked: it is not in the 1.1.0 release.
 * The code stays; this flag decides whether the interface reaches it. Vite
 * replaces `import.meta.env.VITE_PII_ENABLED` at build time, so in a release
 * build the branch below is constant-false and the controls are removed from
 * the bundle, not merely hidden. The backend commands sit behind the cargo
 * feature `pii`, which is off by default; the two must be switched on
 * together. scripts/ci/no-pii-in-release.mjs checks the built bundle.
 */
export const PII_ENABLED: boolean = import.meta.env.VITE_PII_ENABLED === '1';
