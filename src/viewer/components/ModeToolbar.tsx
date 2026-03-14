// Copyright (c) 2026 PDFluent B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// TODO(pdfluent-viewer): wire all ModeToolbar tool buttons to their respective viewer actions
// Status: design integrated, functionality not implemented yet

import type { ViewerMode } from '../types';
import { TOOLS_BY_MODE, type ToolDefinition } from '../tools/toolDefinitions';

interface ModeToolbarProps {
  mode: ViewerMode;
}

function ToolGroup({ tools }: { tools: ToolDefinition[] }) {
  return (
    <div className="flex items-center gap-0.5">
      {tools.map((t) => (
        // TODO(pdfluent-viewer): connect individual tool buttons to viewer actions
        // Status: design integrated, functionality not implemented yet
        <button
          key={t.label}
          disabled
          title={`${t.label} (not yet available)`}
          aria-label={t.label}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground/50 cursor-default hover:bg-transparent"
        >
          <t.icon className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

function Divider() {
  return <div className="w-px h-4 bg-border mx-1 shrink-0" />;
}

export function ModeToolbar({ mode }: ModeToolbarProps) {
  const groups = TOOLS_BY_MODE[mode];

  return (
    <div className="h-10 flex items-center px-3 border-b border-border bg-background shrink-0 overflow-x-auto gap-0">
      {groups.map((group, gi) => (
        <span key={gi} className="flex items-center">
          {gi > 0 && <Divider />}
          <ToolGroup tools={group} />
        </span>
      ))}
    </div>
  );
}
