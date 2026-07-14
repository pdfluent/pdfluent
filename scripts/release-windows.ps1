# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# release-windows.ps1 - BUILD the Windows PDFluent editor .msi on this Windows
# machine. Build-only: prints "MSI_PATH=<path>"; publishing to R2 is done by the
# Mac/pipeline (scripts/release-windows-remote.sh), so no R2 credentials here.
#
#   pwsh scripts/release-windows.ps1 [version]
#
# Prerequisites (one-time, see setup-windows-buildhost.ps1): Rust (MSVC), Node,
# the XFA SDK at ..\..\XFA, and the WASM in XFA\crates\xfa-wasm\pkg (incl.
# snippets\). WiX is auto-downloaded by Tauri on the first MSI build.

param([string]$Version, [switch]$Sign)
$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RepoRoot

# Load .env from the repo root (signing credentials, TRUSTED_SIGNING_PROFILE, etc.).
# Values are loaded into the current process and inherited by all child processes
# (cargo, tauri build, sign-windows.ps1 subprocess).
$envFile = Join-Path $RepoRoot ".env"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^([^#=\s]+)=(.+)$') {
      [Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim(), 'Process')
    }
  }
  Write-Host "   Loaded .env (signing credentials)"
}

# Ensure the Windows SDK signtool.exe is on PATH (needed by sign-windows.ps1).
$sdkBin = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64"
if ((Test-Path $sdkBin) -and ($env:PATH -notlike "*22621*")) {
  $env:PATH = "$sdkBin;$env:PATH"
}

if (-not $Version) { $Version = (Get-Content "src-tauri/tauri.conf.json" -Raw | ConvertFrom-Json).version }

# MSI ProductVersion must be numeric-only (X.Y.Z); strip any -prerelease tag.
$MsiVersion = ($Version -split '-')[0]

Write-Host "== PDFluent Windows build v$Version (MSI ProductVersion $MsiVersion) =="
Write-Host "   node: $(node --version)  cargo: $(cargo --version)"

# Decide whether to keep the Authenticode sign command. By default the build is
# UNSIGNED (no cert -> the site explains the SmartScreen warning). When -Sign is
# passed OR TRUSTED_SIGNING_PROFILE is set, keep tauri.conf.json's signCommand so
# the .exe/.msi are signed via src-tauri/scripts/sign-windows.ps1 (which itself
# selects Trusted Signing or a PFX). Requires the signing prerequisites - see
# docs/WINDOWS_SIGNING_AND_STORE_RUNBOOK.md.
$signing = $Sign.IsPresent -or [bool]$env:TRUSTED_SIGNING_PROFILE
$windowsOverride = if ($signing) { '{}' } else { '{"signCommand":null}' }

# Updater artifacts require the production updater key. Tauri v2
# (createUpdaterArtifacts:true) signs the installer DIRECTLY, emitting
# <installer>.msi.sig (and -setup.exe.sig), NOT the old .msi.zip wrapper. Produce
# them ONLY when TAURI_SIGNING_PRIVATE_KEY is present (GA auto-update); otherwise
# build direct-download-only so no key is needed. See docs/RELEASE_RUNBOOK_GA.md.
$updater = if ($env:TAURI_SIGNING_PRIVATE_KEY) { 'true' } else { 'false' }

# No SILENT unsigned RELEASE: when the production updater key is present (this is
# a real release, not a throwaway dev build) but Authenticode signing is NOT
# enabled, refuse loudly. An unsigned release MSI is almost always a
# misconfiguration (e.g. a missing/empty .env or TRUSTED_SIGNING_PROFILE on the
# build host) and would silently regress the signed posture users expect.
if (($updater -eq 'true') -and (-not $signing)) {
  throw "Refusing to build an UNSIGNED release MSI: the updater key (TAURI_SIGNING_PRIVATE_KEY) is present but Authenticode signing is disabled. Set TRUSTED_SIGNING_PROFILE (+ AZURE_* in .env) or pass -Sign. For an intentional unsigned dev build, unset TAURI_SIGNING_PRIVATE_KEY."
}

# Build-config override, passed as a FILE (npm.cmd strips quotes from inline JSON):
#   - numeric MSI version
#   - updater artifacts only when the production signing key is present (see above)
#   - signCommand kept ONLY when signing is enabled (see above)
$cfg = Join-Path $RepoRoot "tauri.winbuild.json"
('{"version":"' + $MsiVersion + '","bundle":{"createUpdaterArtifacts":' + $updater + ',"windows":' + $windowsOverride + '}}') |
  Set-Content -Path $cfg -Encoding ascii -NoNewline

Write-Host ("   signing: " + $(if ($signing) { "ENABLED (sign command preserved)" } else { "disabled (unsigned build)" }))
Write-Host ("   updater: " + $(if ($updater -eq 'true') { "ENABLED (TAURI_SIGNING_PRIVATE_KEY present)" } else { "disabled (direct-download only)" }))
npm run tauri build -- --bundles msi,nsis --config $cfg
if ($LASTEXITCODE -ne 0) { throw "tauri build failed (exit $LASTEXITCODE)" }

$msi = Get-ChildItem -Path "src-tauri/target/release/bundle/msi" -Filter *.msi -Recurse |
       Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $msi) { throw "No .msi produced under src-tauri/target/release/bundle/msi" }

# Rename from the numeric MSI version back to the full release version so the
# download filename is consistent with macOS/Linux (e.g. ..._1.0.0-beta.5_...).
$rest = ($msi.Name -replace '^PDFluent_[0-9.]+_', '')   # e.g. x64_en-US.msi
$target = Join-Path $msi.Directory.FullName ("PDFluent_${Version}_" + $rest)
if ($msi.FullName -ne $target) { Move-Item $msi.FullName $target -Force }

Write-Output ("MSI_PATH=" + $target)        # stable marker for release-windows-remote.sh
Write-Host ("Built " + (Split-Path $target -Leaf) + " (" + [math]::Round((Get-Item $target).Length / 1MB, 1) + " MB)")

# ── Frontend-embed gate (mandatory) ──────────────────────────────────────────
# Prove the built .exe embeds EXACTLY the current frontend bundle(s) from
# dist/index.html and NO stale bundle from a prior incremental build (the defect
# that shipped beta.17 behind an old index-*.js). Windows-native: scans the PE
# for the embedded asset keys (Tauri stores them as plaintext) — no Unix
# `strings`. Mirrors scripts/verify-frontend-embed.mjs.
$exe = "src-tauri/target/release/pdfluent-desktop.exe"
if (-not (Test-Path $exe)) { throw "embed gate: built exe not found at $exe" }
$indexHtml = Get-Content "dist/index.html" -Raw
$entry = [regex]::Matches($indexHtml, 'index-[A-Za-z0-9_-]{6,}\.(?:js|css)') | ForEach-Object { $_.Value } | Sort-Object -Unique
if (-not $entry) { throw "embed gate: no index-*.{js,css} refs in dist/index.html" }
$current = Get-ChildItem "dist/assets" -ErrorAction Stop | Where-Object { $_.Name -match '^index-[A-Za-z0-9_-]{6,}\.(?:js|css)$' } | ForEach-Object { $_.Name }
$txt = [Text.Encoding]::GetEncoding(28591).GetString([IO.File]::ReadAllBytes((Resolve-Path $exe)))
$embedded = [regex]::Matches($txt, 'index-[A-Za-z0-9_-]{6,}\.(?:js|css)') | ForEach-Object { $_.Value } | Sort-Object -Unique
$missing = @($entry | Where-Object { $embedded -notcontains $_ })
if ($missing.Count) { throw ("embed gate FAILED: current entry bundle(s) NOT embedded: " + ($missing -join ', ') + " (embedded: " + ($embedded -join ', ') + ")") }
$stale = @($embedded | Where-Object { $current -notcontains $_ })
if ($stale.Count) { throw ("embed gate FAILED: STALE bundle(s) embedded, not in dist/assets: " + ($stale -join ', ') + " - run a clean build") }
Write-Host ("   embed gate OK: " + ($entry -join ', ') + " embedded; no stale bundles")

# Stage the signed updater artifacts for local latest.json generation when the
# production key was present. Tauri v2 (createUpdaterArtifacts:true) signs the
# installer DIRECTLY: it emits <installer>.msi.sig (and -setup.exe.sig), NOT a
# .msi.zip. scripts/ci-generate-latest-json.mjs reads artifacts/windows/*.msi.sig
# and points latest.json at the matching bare .msi. The .msi.sig is named with the
# numeric build version (signed before the rename above), so the staged copy is
# renamed to match the released MSI ($target) — keeping the latest.json URL aligned
# with the uploaded installer. Emits stable markers for release-windows-remote.sh.
# No-op for direct-download builds.
if ($updater -eq 'true') {
  $artDir = Join-Path $RepoRoot "artifacts/windows"
  New-Item -ItemType Directory -Force -Path $artDir | Out-Null

  # Primary updater artifact: the bare MSI + its direct signature.
  $msiSig = Get-ChildItem -Path "src-tauri/target/release/bundle/msi" -Recurse -Filter *.msi.sig |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $msiSig) { throw "updater enabled but no .msi.sig produced (key missing/invalid)" }
  $stagedMsi = Join-Path $artDir (Split-Path $target -Leaf)
  $stagedSig = "$stagedMsi.sig"   # PDFluent_<Version>_x64_en-US.msi.sig
  Copy-Item $target          -Destination $stagedMsi -Force
  Copy-Item $msiSig.FullName -Destination $stagedSig -Force
  Write-Output ("UPDATER_MSI=" + $stagedMsi)
  Write-Output ("UPDATER_SIG=" + $stagedSig)
  Write-Host  ("   updater: staged " + (Split-Path $stagedSig -Leaf) + " -> artifacts/windows/ (signs the bare MSI)")

  # Optional: also stage the NSIS installer + its signature (informational; the
  # updater feed ships the MSI). Present only when the nsis bundle produced a sig.
  $nsisSig = Get-ChildItem -Path "src-tauri/target/release/bundle/nsis" -Recurse -Filter *-setup.exe.sig -ErrorAction SilentlyContinue |
             Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($nsisSig) {
    $nsisExe = Get-ChildItem -Path "src-tauri/target/release/bundle/nsis" -Recurse -Filter *-setup.exe -ErrorAction SilentlyContinue |
               Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($nsisExe) { Copy-Item $nsisExe.FullName -Destination $artDir -Force }
    Copy-Item $nsisSig.FullName -Destination $artDir -Force
    Write-Host ("   updater: also staged NSIS " + $nsisSig.Name + " (optional, not used by latest.json)")
  }
}
