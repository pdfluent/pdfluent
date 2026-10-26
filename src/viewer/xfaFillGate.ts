// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * Whether the editable XFA overlay is shown (J-59).
 *
 * On in every build, release included. Release builds compile the
 * `xfa-interactive` Cargo feature (a default feature), so a fill goes through
 * the engine's commit loop: the field's change and calculate scripts run, a
 * calculated total updates, and the saved file reopens with the value, in this
 * app and in Adobe Reader. The Mac App Store build leaves the feature out; its
 * fill takes the static Phase-1 path and the overlay says so once per document
 * (`announceXfaStaticWrite`).
 *
 * This used to be `import.meta.env.DEV`, which hid XFA fill from every
 * shipped build. src/viewer/__tests__/xfaFillGate.test.ts checks it under a
 * non-DEV environment.
 */
export const XFA_INTERACTIVE_FILL: boolean = true;
