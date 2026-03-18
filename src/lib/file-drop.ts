// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.
function normalizeDroppedPath(path: string): string {
  const trimmed = path.trim();
  if (trimmed.length === 0) return "";

  let normalized = trimmed.replace(/^['"]|['"]$/g, "");

  if (normalized.startsWith("file://")) {
    const withoutScheme = normalized.replace(/^file:\/\//, "");
    try {
      normalized = decodeURI(withoutScheme);
    } catch {
      normalized = withoutScheme;
    }
  }

  return normalized;
}

function isPdfPath(path: string): boolean {
  const [pathWithoutQuery] = path.split(/[?#]/, 1);
  return (pathWithoutQuery ?? path).toLowerCase().endsWith(".pdf");
}

export function pickFirstPdfPath(paths: string[]): string | null {
  for (const rawPath of paths) {
    const path = normalizeDroppedPath(rawPath);
    if (path.length === 0) continue;
    if (isPdfPath(path)) {
      return path;
    }
  }
  return null;
}
