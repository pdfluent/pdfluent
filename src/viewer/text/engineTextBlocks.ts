// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The extraction engine's text blocks for a page (#640), for paragraph
// grouping. A page the engine cannot segment groups with the heuristics alone,
// which is how every page grouped before; that is recorded in the log and is
// not an error the user can act on.

import { invokeCommand, logToApp } from '../../lib/commandBridge';
import type { EngineTextBlock } from './textGrouping';

export async function loadEngineTextBlocks(pageIndex: number): Promise<ReadonlyArray<EngineTextBlock> | null> {
  try {
    return await invokeCommand<EngineTextBlock[]>('get_page_text_blocks', { pageIndex });
  } catch (error) {
    void logToApp(`get_page_text_blocks p${pageIndex} failed, grouping without engine blocks: ${String(error)}`);
    return null;
  }
}
