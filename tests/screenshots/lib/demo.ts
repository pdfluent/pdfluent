// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The fixed demo content of the store screenshots. Fictitious throughout
// (fixtures/make-demo-docs.py); no real person, company or figure.

export const DEMO_REPORT = 'tests/screenshots/fixtures/demo-report.pdf';
export const DEMO_IMAGE = 'tests/screenshots/fixtures/demo-floorplan.png';

/** A phrase on page 1 of the report, used to find the line to edit. */
export const LINE_OLD = 'Orders shipped on time';
export const LINE_NEW = 'Orders shipped on time rose again in the third quarter, a record for the studio.';

/** The name typed into the signature field. Invented. */
export const SIGNER = 'Mara Lindqvist';

/** Fonts the picker is asked for, in order; the first one the machine has is used. */
export const FONT_PREFERENCE = ['Georgia', 'Palatino', 'Times New Roman', 'Cambria', 'Garamond'];

/** Fictitious form values. */
export const FORM_NAME = 'Mara Lindqvist';
