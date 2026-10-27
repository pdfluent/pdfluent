// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Faults a journey is ABOUT, and only those.
//
// Every journey fails when the app shows an error toast, logs console.error,
// throws or leaves a rejected promise behind (tests/lib/fault-watch.js,
// lib/journey.ts). A journey that drives a failure path on purpose (a Save to a
// read-only folder) lists the error it provokes here, with the reason in
// words. Nothing else belongs in this file:
//
//   * An error toast that appears in a journey about something else is a bug
//     in the app. Fix it; do not list it.
//   * An entry needs a command or a message pattern. "Everything" is not an
//     expectation. tests/fault-guard.test.ts holds both rules.
//   * An entry that nothing matched is said on stderr (STALE-EXPECTATION) and
//     written into the journey's result file: the fault is fixed, or the entry
//     never described it.
//
// Keyed by journey id, as in docs/JOURNEY_TESTS.json.

import type { ExpectedFault } from '../../lib/fault-guard';

export const EXPECTED_FAULTS: Readonly<Record<string, readonly ExpectedFault[]>> = {
  // The four journeys below make a write fail and judge what the person is told.
  // The toast is the product's answer, so it is the thing under test.
  'J-26': [
    { kind: 'error-toast', command: 'save_pdf', reason: 'J-26 saves into a read-only folder; the failed save is reported on screen and that report is the behaviour under test.' },
  ],
  'J-80': [
    { kind: 'error-toast', command: 'save_pdf', reason: 'J-80 makes the write fail on purpose and checks the original stays intact; the on-screen failure is the expected answer.' },
  ],
  'J-82': [
    { kind: 'error-toast', command: 'save_pdf', reason: 'J-82 fails the save inside the unsaved-changes dialog; the failure notice is what the journey waits for.' },
  ],
  'J-83': [
    { kind: 'error-toast', command: 'save_pdf_as_dialog', reason: 'J-83 saves to a place that cannot be written; the refusal is said on screen, which is the behaviour under test.' },
  ],
  // J-A3, J-B1, J-B2 are about saves that fail on purpose (an ungranted path, a read-only
  // file, a full disk, a file another program holds). The refusal is the answer
  // under test; the files are judged next to it.
  'J-A3': [
    { kind: 'error-toast', command: 'save_pdf_as_dialog', reason: 'J-A3 saves to a path the sandbox did not grant to prove the sandbox is in force; the refusal said on screen is the behaviour under test.' },
  ],
  'J-B2': [
    { kind: 'error-toast', command: 'save_pdf', reason: 'J-B2 makes Save fail on purpose (read-only file, full disk, file held by another program) and judges what the person is told and what stays on disk.' },
    { kind: 'error-toast', command: 'save_pdf_as_dialog', reason: 'J-B2 makes Save As fail on purpose with a full disk and judges that no file is left behind.' },
  ],
  // A refusal the journey is about: its last step exports a document with no
  // table and waits for the app to say so. The toast is that message.
  'J-99': [
    { kind: 'error-toast', match: 'No tables were recognised', reason: 'J-99 exports Tables to Excel from a document without a table; the on-screen refusal "No tables were recognised" is the behaviour under test.' },
  ],
};
