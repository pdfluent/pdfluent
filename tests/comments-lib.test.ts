// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { describe, expect, it } from "vitest";
import {
  addCommentReply,
  addCommentThread,
  exportCommentThreadsAsFdf,
  exportCommentThreadsAsXfdf,
  filterCommentThreads,
  setCommentThreadStatus,
  type CommentThread,
} from "../src/lib/comments";

describe("comment thread model helpers", () => {
  it("creates threads, replies, and status changes", () => {
    const withThread = addCommentThread([], {
      pageIndex: 0,
      author: "Legal Reviewer",
      message: "Please verify clause 4.2",
      createdAt: "2026-03-04T10:00:00.000Z",
    });

    expect(withThread).toHaveLength(1);
    const thread = withThread[0];
    expect(thread?.status).toBe("open");

    const withReply = addCommentReply(withThread, thread?.id ?? "", {
      author: "Author",
      message: "Updated the clause wording.",
      createdAt: "2026-03-04T10:05:00.000Z",
    });
    expect(withReply[0]?.replies).toHaveLength(1);

    const resolved = setCommentThreadStatus(withReply, thread?.id ?? "", "resolved");
    expect(resolved[0]?.status).toBe("resolved");
    expect(filterCommentThreads(resolved, "resolved")).toHaveLength(1);
    expect(filterCommentThreads(resolved, "open")).toHaveLength(0);
  });

  it("exports threads as XFDF and FDF payloads", () => {
    const base: CommentThread[] = addCommentThread([], {
      pageIndex: 2,
      author: "Reviewer",
      message: "Need supporting source.",
      createdAt: "2026-03-04T11:00:00.000Z",
    });
    const thread = base[0];
    const withReply = addCommentReply(base, thread?.id ?? "", {
      author: "Counsel",
      message: "Source added in annex B.",
      createdAt: "2026-03-04T11:03:00.000Z",
    });

    const xfdf = exportCommentThreadsAsXfdf(withReply, "/tmp/nda.pdf");
    const fdf = exportCommentThreadsAsFdf(withReply, "/tmp/nda.pdf");

    expect(xfdf).toContain("<xfdf");
    expect(xfdf).toContain("Comment Thread");
    expect(xfdf).toContain("Status: open");
    expect(xfdf).toContain("annex B");
    expect(fdf).toContain("%FDF-1.7");
    expect(fdf).toContain("/Subtype /Text");
    expect(fdf).toContain("Status: open");
    expect(fdf).toContain("annex B");
  });
});
