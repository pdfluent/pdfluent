// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { spawnSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const workspaceRoot = process.cwd();
const reportPath = path.join(workspaceRoot, "compliance-report.json");
const thirdPartyPath = path.join(workspaceRoot, "THIRD_PARTY.md");
const attributionsPath = path.join(workspaceRoot, "THIRD_PARTY_ATTRIBUTIONS.md");
const modelManifestPath = path.join(
  workspaceRoot,
  "src-tauri",
  "scripts",
  "ocr-models.manifest.json",
);
const overridesPath = path.join(workspaceRoot, "compliance-overrides.json");

const allowedLicensePatterns = [
  "MIT",
  "Apache-2",
  "BSD",
  "ISC",
  "MPL-2",
  "Zlib",
  "Unicode",
  "Python-2",
  "CC0",
];

const blockedLicensePatterns = [
  "AGPL",
  "GPL",
  "LGPL",
  "SSPL",
  "BUSL",
  "CC-BY-NC",
];

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function normalizeLicenseExpression(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function inferLicenseByPackageName(source, name) {
  if (source === "npm") {
    if (name.startsWith("@esbuild/")) return "MIT";
    if (name.startsWith("@rollup/rollup-")) return "MIT";
    if (name.startsWith("@tauri-apps/cli-")) return "MIT OR Apache-2.0";
  }
  return "";
}

function evaluateLicensePolicy(licenseExpression, source, name) {
  if (source === "internal") {
    return { licenseStatus: "known", policyStatus: "internal" };
  }

  const normalized = normalizeLicenseExpression(licenseExpression);
  if (!normalized) {
    return { licenseStatus: "unknown", policyStatus: "needs-review" };
  }

  const upper = normalized.toUpperCase();
  const hasAllowedPattern = allowedLicensePatterns.some((pattern) =>
    upper.includes(pattern.toUpperCase()),
  );
  const hasBlockedPattern = blockedLicensePatterns.some((pattern) =>
    upper.includes(pattern),
  );

  if (hasAllowedPattern && hasBlockedPattern) {
    return { licenseStatus: "known", policyStatus: "needs-review" };
  }

  if (hasBlockedPattern && !(name === "pdfluent" && source === "cargo")) {
    return { licenseStatus: "known", policyStatus: "blocked" };
  }

  if (hasAllowedPattern) {
    return { licenseStatus: "known", policyStatus: "allowed" };
  }

  return { licenseStatus: "known", policyStatus: "needs-review" };
}

function findLicenseFileInDirectory(directoryPath) {
  if (!existsSync(directoryPath)) return null;
  const candidates = readdirSync(directoryPath);
  const licenseEntry = candidates.find((entry) =>
    /^(license|copying|notice)(\.|$)/i.test(entry),
  );
  if (!licenseEntry) return null;
  return path.join(directoryPath, licenseEntry);
}

function gatherNpmEntries() {
  const packageLockPath = path.join(workspaceRoot, "package-lock.json");
  const packageJsonPath = path.join(workspaceRoot, "package.json");
  if (!existsSync(packageLockPath) || !existsSync(packageJsonPath)) {
    return [];
  }

  const packageLock = readJsonFile(packageLockPath);
  const packageJson = readJsonFile(packageJsonPath);
  const directDependencies = new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
  ]);

  const lockPackages = packageLock.packages ?? {};
  const entries = [];
  const dedupeMap = new Map();
  for (const [lockPath, lockEntry] of Object.entries(lockPackages)) {
    if (!lockPath.includes("node_modules/")) continue;
    const dependencyName = String(lockPath.split("node_modules/").pop() ?? "");
    if (!dependencyName || typeof lockEntry !== "object" || lockEntry === null) {
      continue;
    }

    const version = String(lockEntry.version ?? "");
    const modulePathFromLock = path.join(workspaceRoot, lockPath);
    const modulePathFromName = path.join(workspaceRoot, "node_modules", dependencyName);
    const nodeModulePath = existsSync(modulePathFromLock)
      ? modulePathFromLock
      : modulePathFromName;
    const modulePackageJsonPath = path.join(nodeModulePath, "package.json");
    let license = "";
    let repository = "";
    let homepage = "";
    if (existsSync(modulePackageJsonPath)) {
      const modulePackageJson = readJsonFile(modulePackageJsonPath);
      if (typeof modulePackageJson.license === "string") {
        license = modulePackageJson.license;
      } else if (
        Array.isArray(modulePackageJson.licenses) &&
        modulePackageJson.licenses.length > 0
      ) {
        license = modulePackageJson.licenses
          .map((value) =>
            typeof value === "string"
              ? value
              : typeof value?.type === "string"
                ? value.type
                : "",
          )
          .filter((value) => value.length > 0)
          .join(" OR ");
      }

      if (typeof modulePackageJson.homepage === "string") {
        homepage = modulePackageJson.homepage;
      }
      if (typeof modulePackageJson.repository === "string") {
        repository = modulePackageJson.repository;
      } else if (typeof modulePackageJson.repository?.url === "string") {
        repository = modulePackageJson.repository.url;
      }
    }

    const entry = {
      source: "npm",
      name: dependencyName,
      version,
      direct: directDependencies.has(dependencyName),
      license,
      repository,
      homepage,
      licenseFilePath: findLicenseFileInDirectory(nodeModulePath),
    };
    const dedupeKey = `${entry.source}::${entry.name}::${entry.version}`;
    const existing = dedupeMap.get(dedupeKey);
    if (!existing || (entry.direct && !existing.direct)) {
      dedupeMap.set(dedupeKey, entry);
    }
  }

  entries.push(...dedupeMap.values());
  return entries.sort((left, right) => left.name.localeCompare(right.name));
}

function gatherCargoEntries() {
  const manifestPath = path.join(workspaceRoot, "src-tauri", "Cargo.toml");
  if (!existsSync(manifestPath)) return [];

  const metadataResult = spawnSync(
    "cargo",
    [
      "metadata",
      "--manifest-path",
      manifestPath,
      "--format-version",
      "1",
      "--locked",
    ],
    {
      cwd: workspaceRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  let metadata;
  try {
    metadata = JSON.parse(metadataResult.stdout);
  } catch (error) {
    console.warn(
      "[generate-third-party] cargo metadata parse failed:",
      String(error),
    );
    if (metadataResult.stderr.trim().length > 0) {
      console.warn(metadataResult.stderr);
    }
    return [];
  }
  const workspaceMembers = new Set(metadata.workspace_members ?? []);
  const rootWorkspacePath = path.join(workspaceRoot, "src-tauri");

  const entries = [];
  for (const pkg of metadata.packages ?? []) {
    const packageId = String(pkg.id ?? "");
    const manifestFilePath = String(pkg.manifest_path ?? "");
    const isWorkspaceMember = workspaceMembers.has(packageId);
    const isInternal = isWorkspaceMember && manifestFilePath.startsWith(rootWorkspacePath);
    const packageDirectory = path.dirname(manifestFilePath);
    const explicitLicenseFile =
      typeof pkg.license_file === "string" && pkg.license_file.length > 0
        ? path.resolve(packageDirectory, pkg.license_file)
        : null;

    entries.push({
      source: isInternal ? "internal" : "cargo",
      name: String(pkg.name ?? ""),
      version: String(pkg.version ?? ""),
      direct: false,
      license: String(pkg.license ?? ""),
      repository: String(pkg.repository ?? ""),
      homepage: String(pkg.homepage ?? ""),
      licenseFilePath:
        explicitLicenseFile && existsSync(explicitLicenseFile)
          ? explicitLicenseFile
          : findLicenseFileInDirectory(packageDirectory),
    });
  }

  return entries.sort((left, right) => left.name.localeCompare(right.name));
}

function gatherPythonEntries() {
  const pythonPath = path.join(workspaceRoot, ".venv-ocr", "bin", "python");
  if (!existsSync(pythonPath)) return [];

  const script = `
import importlib.metadata as metadata
import json

rows = []
for dist in metadata.distributions():
    meta = dist.metadata
    classifiers = meta.get_all("Classifier") or []
    license_classifiers = [entry for entry in classifiers if entry.startswith("License ::")]
    rows.append({
        "name": meta.get("Name") or dist.metadata.get("Summary") or dist._path.name,
        "version": dist.version,
        "license_expression": (meta.get("License-Expression") or "").strip(),
        "license": (meta.get("License") or "").strip(),
        "license_classifiers": license_classifiers,
        "home_page": meta.get("Home-page") or "",
    })

rows.sort(key=lambda row: row["name"].lower())
print(json.dumps(rows))
`;

  const result = spawnSync(pythonPath, ["-c", script], {
    cwd: workspaceRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.warn("[generate-third-party] python metadata failed:", result.stderr);
    return [];
  }

  const rows = JSON.parse(result.stdout);
  return rows.map((row) => {
    const classifierLicense = Array.isArray(row.license_classifiers)
      ? row.license_classifiers.join(" | ")
      : "";
    const primaryLicense =
      typeof row.license_expression === "string" && row.license_expression.length > 0
        ? row.license_expression
        : typeof row.license === "string" && row.license.length > 0
          ? row.license
        : classifierLicense;
    return {
      source: "python",
      name: String(row.name ?? ""),
      version: String(row.version ?? ""),
      direct: false,
      license: primaryLicense,
      repository: "",
      homepage: String(row.home_page ?? ""),
      licenseFilePath: null,
    };
  });
}

function gatherPythonRequirementEntries() {
  const requirementsPath = path.join(
    workspaceRoot,
    "src-tauri",
    "scripts",
    "requirements-ocr.txt",
  );
  if (!existsSync(requirementsPath)) return [];

  const lines = readFileSync(requirementsPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  return lines.map((line) => {
    const [name, versionSpec] = line.split(/(?=[<>=!~])/);
    return {
      source: "python",
      name: name.trim(),
      version: versionSpec?.trim() ?? "",
      direct: true,
      license: "manual-review-required",
      repository: "",
      homepage: "",
      licenseFilePath: null,
    };
  });
}

function gatherBundledPdfiumEntries() {
  const licensesDirectory = path.join(workspaceRoot, "src-tauri", "lib", "licenses");
  if (!existsSync(licensesDirectory)) return [];

  return readdirSync(licensesDirectory)
    .filter((entry) => statSync(path.join(licensesDirectory, entry)).isFile())
    .sort()
    .map((entry) => ({
      source: "bundled",
      name: `pdfium:${entry}`,
      version: "",
      direct: false,
      license: "See bundled notice text",
      repository: "",
      homepage: "",
      licenseFilePath: path.join(licensesDirectory, entry),
    }));
}

function gatherModelAssetEntries() {
  if (!existsSync(modelManifestPath)) return [];
  const manifest = readJsonFile(modelManifestPath);
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  return files.map((fileEntry) => ({
    source: "model-asset",
    name: `ocr-model:${path.basename(String(fileEntry.path ?? ""))}`,
    version: "",
    direct: false,
    license: "manual-review-required",
    repository: "",
    homepage: "",
    licenseFilePath: String(fileEntry.path ?? ""),
    sha256: String(fileEntry.sha256 ?? ""),
    sizeBytes: Number(fileEntry.sizeBytes ?? 0),
  }));
}

function loadOverrides() {
  if (!existsSync(overridesPath)) {
    return [];
  }
  const parsed = readJsonFile(overridesPath);
  if (!Array.isArray(parsed.overrides)) {
    return [];
  }
  return parsed.overrides;
}

function findOverride(overrides, entry) {
  return overrides.find((override) => {
    if (override.source !== entry.source) return false;
    if (override.name !== entry.name) return false;
    if (override.version && override.version !== entry.version) return false;
    return true;
  });
}

function enrichEntries(entries) {
  const overrides = loadOverrides();
  return entries.map((entry) => {
    const normalizedLicense =
      typeof entry.license === "string" && entry.license.length > 1200
        ? entry.license.slice(0, 1200)
        : entry.license;
    const inferredLicenseByName = inferLicenseByPackageName(
      entry.source,
      entry.name,
    );
    const normalizedLicenseValue =
      typeof normalizedLicense === "string" ? normalizedLicense.trim() : "";
    const inferredLicense =
      normalizedLicenseValue.length > 0
        ? normalizedLicenseValue
        : inferredLicenseByName.length > 0
          ? inferredLicenseByName
          : entry.licenseFilePath
            ? "See license file"
            : "";

    const override = findOverride(overrides, entry);
    const effectiveLicense =
      override?.license && String(override.license).trim().length > 0
        ? String(override.license).trim()
        : inferredLicense;
    const policy = override?.policyStatus
      ? {
          licenseStatus:
            override.licenseStatus ??
            (effectiveLicense.length > 0 ? "known" : "unknown"),
          policyStatus: override.policyStatus,
        }
      : evaluateLicensePolicy(effectiveLicense, entry.source, entry.name);
    return {
      ...entry,
      license: effectiveLicense,
      licenseStatus: policy.licenseStatus,
      policyStatus: policy.policyStatus,
      policyReason: override?.reason ?? null,
    };
  });
}

function buildSummary(entries) {
  const sourceSummary = {};
  const policySummary = {};
  for (const entry of entries) {
    sourceSummary[entry.source] = (sourceSummary[entry.source] ?? 0) + 1;
    policySummary[entry.policyStatus] = (policySummary[entry.policyStatus] ?? 0) + 1;
  }

  return {
    totalDependencies: entries.length,
    bySource: sourceSummary,
    byPolicyStatus: policySummary,
  };
}

function toMarkdownTable(entries) {
  const header = "| Name | Version | License | Policy | Direct |";
  const divider = "|---|---:|---|---|---:|";
  const rows = entries.map(
    (entry) =>
      `| ${entry.name} | ${entry.version || "-"} | ${entry.license || "unknown"} | ${entry.policyStatus} | ${entry.direct ? "yes" : "no"} |`,
  );
  return [header, divider, ...rows].join("\n");
}

function writeThirdPartyMarkdown(entries, summary) {
  const grouped = entries.reduce((accumulator, entry) => {
    if (!accumulator[entry.source]) {
      accumulator[entry.source] = [];
    }
    accumulator[entry.source].push(entry);
    return accumulator;
  }, {});

  const sections = Object.entries(grouped)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([source, sourceEntries]) => {
      const table = toMarkdownTable(sourceEntries);
      return `## ${source}\n\n${table}`;
    })
    .join("\n\n");

  const markdown = `# THIRD_PARTY

Generated: ${new Date().toISOString()}
Generator: \`scripts/generate-third-party.mjs\`

## Summary

- Total dependencies/assets: ${summary.totalDependencies}
- Policy status: ${JSON.stringify(summary.byPolicyStatus)}

${sections}
`;

  writeFileSync(thirdPartyPath, markdown, "utf8");
}

function writeAttributionsMarkdown(entries) {
  const bundledEntries = entries.filter(
    (entry) => entry.source === "bundled" && entry.licenseFilePath,
  );

  const modelEntries = entries.filter((entry) => entry.source === "model-asset");
  const bundledNotices = bundledEntries
    .map((entry) => {
      const fullPath = entry.licenseFilePath;
      let content = "";
      if (typeof fullPath === "string" && existsSync(fullPath)) {
        content = readFileSync(fullPath, "utf8").trim();
      }
      return `## ${entry.name}

Source file: \`${fullPath}\`

\`\`\`
${content}
\`\`\``;
    })
    .join("\n\n");

  const modelSection =
    modelEntries.length === 0
      ? "## OCR model assets\n\nNo local OCR model assets were found at generation time.\n"
      : `## OCR model assets\n\n${modelEntries
          .map(
            (entry) =>
              `- ${entry.name} (${entry.licenseFilePath}) sha256=${entry.sha256 ?? "unknown"}`,
          )
          .join("\n")}`;

  const markdown = `# THIRD_PARTY_ATTRIBUTIONS

Generated: ${new Date().toISOString()}
Generator: \`scripts/generate-third-party.mjs\`

This file stores bundled notice texts and model-asset references.

${modelSection}

${bundledNotices}
`;

  writeFileSync(attributionsPath, markdown, "utf8");
}

function writeComplianceReport(entries, summary) {
  const report = {
    generatedAt: new Date().toISOString(),
    generatedBy: "scripts/generate-third-party.mjs",
    entries,
    summary,
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function main() {
  const pythonEntries = gatherPythonEntries();
  const normalizedPythonEntries =
    pythonEntries.length > 0
      ? pythonEntries
      : gatherPythonRequirementEntries();

  const entries = enrichEntries([
    ...gatherNpmEntries(),
    ...gatherCargoEntries(),
    ...normalizedPythonEntries,
    ...gatherBundledPdfiumEntries(),
    ...gatherModelAssetEntries(),
  ]).sort((left, right) => {
    if (left.source === right.source) {
      return left.name.localeCompare(right.name);
    }
    return left.source.localeCompare(right.source);
  });

  const summary = buildSummary(entries);
  writeComplianceReport(entries, summary);
  writeThirdPartyMarkdown(entries, summary);
  writeAttributionsMarkdown(entries);

  console.log(
    `Generated compliance files: ${path.basename(reportPath)}, ${path.basename(thirdPartyPath)}, ${path.basename(attributionsPath)}`,
  );
}

main();
