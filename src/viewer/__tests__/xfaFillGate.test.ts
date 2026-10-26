// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-59: XFA fill is available in release builds. The gate used to be
// `import.meta.env.DEV`, which vitest sets to true, so a test under the
// default environment could not tell the two apart. These load the module
// under a production environment, the one a shipped build has.

import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('XFA fill gate', () => {
  it('shows the XFA fill overlay in a release build', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('PROD', true);
    vi.stubEnv('MODE', 'production');
    vi.resetModules();
    const { XFA_INTERACTIVE_FILL } = await import('../xfaFillGate');
    expect(XFA_INTERACTIVE_FILL).toBe(true);
  });

  it('shows it in a development build too', async () => {
    vi.stubEnv('DEV', true);
    vi.resetModules();
    const { XFA_INTERACTIVE_FILL } = await import('../xfaFillGate');
    expect(XFA_INTERACTIVE_FILL).toBe(true);
  });
});
