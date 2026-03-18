// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const toolbarSource = readFileSync(
  new URL("../src/components/Toolbar.tsx", import.meta.url),
  "utf8",
);
const commentsPanelSource = readFileSync(
  new URL("../src/components/CommentsPanel.tsx", import.meta.url),
  "utf8",
);

describe("comments pane parity actions", () => {
  it("tracks threaded comments, replies, and status updates in app workflow", () => {
    expect(appSource).toContain("const filteredCommentThreads = useMemo(");
    expect(appSource).toContain("const updateCommentStatus = useCallback(");
    expect(appSource).toContain("const replyToCommentThread = useCallback(");
    expect(appSource).toContain("const exportCommentThreadsXfdf = useCallback(async () => {");
    expect(appSource).toContain("const exportCommentThreadsFdf = useCallback(async () => {");
    expect(appSource).toContain("addCommentThread(previous, {");
    expect(appSource).toContain("addCommentReply(previous, threadId, {");
    expect(appSource).toContain("setCommentThreadStatus(previous, threadId, status)");
    expect(appSource).toContain("recordAudit(\"export_comments_xfdf\", \"success\"");
    expect(appSource).toContain("recordAudit(\"export_comments_fdf\", \"success\"");
    expect(appSource).toContain("<CommentsPanel");
  });

  it("adds comments controls and export entries in the advanced toolbar menu", () => {
    expect(toolbarSource).toContain("commentThreadCount: number;");
    expect(toolbarSource).toContain("onToggleCommentsPanel: () => void;");
    expect(toolbarSource).toContain("onExportCommentsXfdf: () => void;");
    expect(toolbarSource).toContain("onExportCommentsFdf: () => void;");
    expect(toolbarSource).toContain("Toggle comments panel");
    expect(toolbarSource).toContain("Comments pane");
    expect(toolbarSource).toContain("Export comments (XFDF)");
    expect(toolbarSource).toContain("Export comments (FDF)");
  });

  it("renders comments panel controls for filter, status and reply", () => {
    expect(commentsPanelSource).toContain("<aside className=\"comments-panel\">");
    expect(commentsPanelSource).toContain("onFilterChange(event.target.value as CommentThreadFilter)");
    expect(commentsPanelSource).toContain(
      "onSetStatus(thread.id, event.target.value as CommentThreadStatus)",
    );
    expect(commentsPanelSource).toContain("onAddReply(thread.id, draft);");
    expect(commentsPanelSource).toContain("XFDF");
    expect(commentsPanelSource).toContain("FDF");
  });
});
