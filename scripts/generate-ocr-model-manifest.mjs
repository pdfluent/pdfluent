// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const MODEL_EXTENSIONS = new Set([
  ".onnx",
  ".pdparams",
  ".json",
  ".txt",
  ".yml",
  ".yaml",
  ".zip",
  ".tar",
]);

function normalizePath(value) {
  const homeDirectory = os.homedir();
  if (value.startsWith(homeDirectory)) {
    return `~${value.slice(homeDirectory.length)}`;
  }
  return value;
}

function collectFilesRecursively(rootDirectory, output = []) {
  if (!existsSync(rootDirectory)) return output;
  const entries = readdirSync(rootDirectory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDirectory, entry.name);
    if (entry.isDirectory()) {
      collectFilesRecursively(fullPath, output);
      continue;
    }

    if (!entry.isFile()) continue;
    const extension = path.extname(entry.name).toLowerCase();
    if (!MODEL_EXTENSIONS.has(extension)) continue;
    output.push(fullPath);
  }
  return output;
}

function sha256ForFile(filePath) {
  const hash = createHash("sha256");
  const fileBytes = readFileSync(filePath);
  hash.update(fileBytes);
  return hash.digest("hex");
}

function main() {
  const workspaceRoot = process.cwd();
  const explicitRoot = process.env.PDFLUENT_OCR_MODEL_ROOT?.trim();
  const candidateRoots = [
    explicitRoot ? path.resolve(explicitRoot) : null,
    path.join(os.homedir(), ".paddlex"),
    path.join(os.homedir(), ".paddleocr"),
    path.join(os.homedir(), ".cache", "paddle"),
    path.join(workspaceRoot, "src-tauri", "models"),
  ].filter((value) => typeof value === "string");

  const discoveredFiles = candidateRoots.flatMap((candidate) =>
    collectFilesRecursively(candidate),
  );

  const uniqueFiles = [...new Set(discoveredFiles)].sort();
  const manifestFiles = uniqueFiles.map((filePath) => {
    const fileStats = statSync(filePath);
    return {
      path: normalizePath(filePath),
      sizeBytes: fileStats.size,
      sha256: sha256ForFile(filePath),
    };
  });

  const manifest = {
    generatedAt: new Date().toISOString(),
    generatedBy: "scripts/generate-ocr-model-manifest.mjs",
    rootsScanned: candidateRoots.map((candidate) => normalizePath(candidate)),
    files: manifestFiles,
  };

  const outputPath = path.join(
    workspaceRoot,
    "src-tauri",
    "scripts",
    "ocr-models.manifest.json",
  );
  writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(
    `Wrote OCR model manifest: ${outputPath} (${manifestFiles.length} files)`,
  );
}

main();
