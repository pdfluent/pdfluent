// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { LayoutGridIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * The top bar's way into the All-tools modal (#471 found that nothing opened it:
 * thirty-five tools were registered, wired and unreachable). A plain button with a
 * test id, so the walk and the tests find it by the same handle.
 */
export function AllToolsButton({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation();
  const label = t('editorV3.topbar.allTools');
  return (
    <button type="button" className="iconbtn" onClick={onOpen} title={label} aria-label={label} data-testid="all-tools-btn">
      <LayoutGridIcon aria-hidden="true" />
    </button>
  );
}
