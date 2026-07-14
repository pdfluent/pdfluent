// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { useState } from 'react';
import type { ViewerMode } from '../types';

export function useModeManager() {
  const [mode, setMode] = useState<ViewerMode>('read');

  return { mode, setMode };
}
