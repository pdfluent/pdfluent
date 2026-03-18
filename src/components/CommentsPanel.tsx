// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.
import { useState } from "react";
import type {
  CommentThread,
  CommentThreadFilter,
  CommentThreadStatus,
} from "../lib/comments";

interface CommentsPanelProps {
  threads: CommentThread[];
  filter: CommentThreadFilter;
  disabled: boolean;
  onFilterChange: (filter: CommentThreadFilter) => void;
  onSetStatus: (threadId: string, status: CommentThreadStatus) => void;
  onAddReply: (threadId: string, message: string) => void;
  onExportXfdf: () => void;
  onExportFdf: () => void;
}

export function CommentsPanel({
  threads,
  filter,
  disabled,
  onFilterChange,
  onSetStatus,
  onAddReply,
  onExportXfdf,
  onExportFdf,
}: CommentsPanelProps) {
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  return (
    <aside className="comments-panel">
      <div className="form-panel-header">
        <span>Comments</span>
        <div className="form-panel-header-actions">
          <span className="form-panel-count">{threads.length}</span>
          <button
            type="button"
            className="form-panel-action-button"
            disabled={disabled}
            onClick={onExportXfdf}
          >
            XFDF
          </button>
          <button
            type="button"
            className="form-panel-action-button"
            disabled={disabled}
            onClick={onExportFdf}
          >
            FDF
          </button>
        </div>
      </div>
      <div className="comments-panel-content">
        <section className="admin-section">
          <div className="admin-section-title">Filter</div>
          <select
            className="form-field-input"
            value={filter}
            disabled={disabled}
            onChange={(event) =>
              onFilterChange(event.target.value as CommentThreadFilter)
            }
          >
            <option value="all">All threads</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
          </select>
        </section>

        {threads.length === 0 && (
          <div className="form-panel-empty">
            <p>No comment threads for this filter.</p>
          </div>
        )}

        {threads.map((thread) => (
          <section className="admin-section" key={thread.id}>
            <div className="admin-section-title">
              Page {thread.pageIndex + 1} · {thread.author}
            </div>
            <div className="comments-thread-message">{thread.message}</div>
            <select
              className="form-field-input"
              value={thread.status}
              disabled={disabled}
              onChange={(event) =>
                onSetStatus(thread.id, event.target.value as CommentThreadStatus)
              }
            >
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
            </select>
            <div className="comments-thread-replies">
              {thread.replies.length === 0 && (
                <div className="admin-muted">No replies yet.</div>
              )}
              {thread.replies.map((reply) => (
                <div className="comments-thread-reply" key={reply.id}>
                  <span className="comments-thread-reply-meta">
                    {reply.author} · {new Date(reply.createdAt).toLocaleString()}
                  </span>
                  <span>{reply.message}</span>
                </div>
              ))}
            </div>
            <div className="comments-thread-reply-form">
              <input
                className="form-field-input"
                placeholder="Reply..."
                value={replyDrafts[thread.id] ?? ""}
                disabled={disabled}
                onChange={(event) =>
                  setReplyDrafts((previous) => ({
                    ...previous,
                    [thread.id]: event.target.value,
                  }))
                }
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  const draft = (replyDrafts[thread.id] ?? "").trim();
                  if (draft.length === 0) return;
                  onAddReply(thread.id, draft);
                  setReplyDrafts((previous) => ({
                    ...previous,
                    [thread.id]: "",
                  }));
                }}
              />
              <button
                type="button"
                className="form-panel-action-button"
                disabled={disabled || (replyDrafts[thread.id] ?? "").trim().length === 0}
                onClick={() => {
                  const draft = (replyDrafts[thread.id] ?? "").trim();
                  if (draft.length === 0) return;
                  onAddReply(thread.id, draft);
                  setReplyDrafts((previous) => ({
                    ...previous,
                    [thread.id]: "",
                  }));
                }}
              >
                Reply
              </button>
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}
