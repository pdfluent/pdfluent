// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.
export type CommentThreadStatus = "open" | "resolved";
export type CommentThreadFilter = "all" | CommentThreadStatus;

export interface CommentReply {
  id: string;
  author: string;
  message: string;
  createdAt: string;
}

export interface CommentThread {
  id: string;
  pageIndex: number;
  author: string;
  message: string;
  createdAt: string;
  updatedAt: string;
  status: CommentThreadStatus;
  replies: CommentReply[];
}

function createId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${random}`;
}

function normalizeMessage(message: string): string {
  return message.trim().replace(/\s+/g, " ");
}

function toPdfDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "D:19700101000000Z";
  }

  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  return `D:${year}${month}${day}${hours}${minutes}${seconds}Z`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

function escapePdfLiteral(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r");
}

function buildThreadBody(thread: CommentThread): string {
  const replyLines = thread.replies.map(
    (reply) => `${reply.author} (${reply.createdAt}): ${reply.message}`,
  );
  const lines = [
    `Status: ${thread.status}`,
    `Thread: ${thread.message}`,
    ...replyLines,
  ];
  return lines.join("\n");
}

export function addCommentThread(
  threads: CommentThread[],
  payload: {
    pageIndex: number;
    author: string;
    message: string;
    createdAt?: string;
  },
): CommentThread[] {
  const message = normalizeMessage(payload.message);
  if (message.length === 0) {
    return threads;
  }

  const timestamp = payload.createdAt ?? new Date().toISOString();
  const next: CommentThread = {
    id: createId("comment_thread"),
    pageIndex: Math.max(0, Math.round(payload.pageIndex)),
    author: payload.author.trim() || "Reviewer",
    message,
    createdAt: timestamp,
    updatedAt: timestamp,
    status: "open",
    replies: [],
  };
  return [...threads, next];
}

export function addCommentReply(
  threads: CommentThread[],
  threadId: string,
  payload: {
    author: string;
    message: string;
    createdAt?: string;
  },
): CommentThread[] {
  const message = normalizeMessage(payload.message);
  if (message.length === 0) {
    return threads;
  }

  const timestamp = payload.createdAt ?? new Date().toISOString();
  return threads.map((thread) => {
    if (thread.id !== threadId) {
      return thread;
    }

    const reply: CommentReply = {
      id: createId("comment_reply"),
      author: payload.author.trim() || "Reviewer",
      message,
      createdAt: timestamp,
    };

    return {
      ...thread,
      updatedAt: timestamp,
      replies: [...thread.replies, reply],
    };
  });
}

export function setCommentThreadStatus(
  threads: CommentThread[],
  threadId: string,
  status: CommentThreadStatus,
): CommentThread[] {
  const now = new Date().toISOString();
  return threads.map((thread) =>
    thread.id === threadId
      ? {
          ...thread,
          status,
          updatedAt: now,
        }
      : thread,
  );
}

export function filterCommentThreads(
  threads: CommentThread[],
  filter: CommentThreadFilter,
): CommentThread[] {
  if (filter === "all") {
    return threads;
  }
  return threads.filter((thread) => thread.status === filter);
}

export function exportCommentThreadsAsXfdf(
  threads: CommentThread[],
  sourcePath: string | null,
): string {
  const href = escapeXml(sourcePath ?? "");
  const annots = threads
    .map((thread) => {
      const body = escapeXml(buildThreadBody(thread));
      const author = escapeXml(thread.author);
      const id = escapeXml(thread.id);
      const date = escapeXml(toPdfDate(thread.createdAt));
      const status = escapeXml(thread.status);
      return `<text page="${thread.pageIndex}" subject="Comment Thread" title="${author}" name="${id}" creationdate="${date}" status="${status}"><contents>${body}</contents></text>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<xfdf xmlns="http://ns.adobe.com/xfdf/" xml:space="preserve">\n  <f href="${href}"/>\n  <annots>${annots}</annots>\n</xfdf>\n`;
}

export function exportCommentThreadsAsFdf(
  threads: CommentThread[],
  sourcePath: string | null,
): string {
  const escapedPath = escapePdfLiteral(sourcePath ?? "");
  const annots = threads
    .map((thread) => {
      const body = escapePdfLiteral(buildThreadBody(thread));
      const author = escapePdfLiteral(thread.author);
      const id = escapePdfLiteral(thread.id);
      const date = escapePdfLiteral(toPdfDate(thread.createdAt));
      return `<< /Type /Annot /Subtype /Text /Page ${thread.pageIndex} /T (${author}) /NM (${id}) /CreationDate (${date}) /Contents (${body}) >>`;
    })
    .join("\n");

  return `%FDF-1.7\n1 0 obj\n<<\n/FDF << /F (${escapedPath}) /Annots [\n${annots}\n] >>\n>>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`;
}
