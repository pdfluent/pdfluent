// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useState } from 'react';
import type { ViewerMode } from '../types';

export function useModeManager() {
  const [mode, setMode] = useState<ViewerMode>('read');

  return { mode, setMode };
}
