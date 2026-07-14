# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# preflight-windows-ga.ps1 — READ-ONLY GA readiness check for Windows Authenticode
# + updater signing. Run on the Windows build box. Does NOT build or sign; only
# reports whether signing is configured. Secret VALUES are never read or printed.
#
#   pwsh scripts/preflight-windows-ga.ps1
$ready = $true
function Note($s, $m) { Write-Host ("  {0,-4} {1}" -f $s, $m) }
Write-Host "== Windows GA preflight (read-only) =="

# Load .env from the repo root the SAME way release-windows.ps1 does, so signing
# creds stored there (not in the shell env) are visible to this read-only check.
# Run as: powershell -NoProfile -File scripts/preflight-windows-ga.ps1
try {
  $envFile = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")) ".env"
  if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
      if ($_ -match '^([^#=\s]+)=(.+)$') {
        [Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim(), 'Process')
      }
    }
    Write-Host "  (loaded signing creds from .env)"
  }
} catch { }

# 1. Authenticode method (Azure Trusted Signing OR PFX)
if ($env:TRUSTED_SIGNING_PROFILE -and $env:AZURE_TENANT_ID -and $env:AZURE_CLIENT_ID -and $env:AZURE_CLIENT_SECRET) {
  Note "OK" "Azure Trusted Signing configured (TRUSTED_SIGNING_PROFILE + AZURE_* present)"
} elseif ($env:WINDOWS_CERTIFICATE_PATH -and $env:WINDOWS_CERTIFICATE_PASSWORD) {
  Note "OK" "PFX certificate configured (WINDOWS_CERTIFICATE_PATH + password present)"
} else {
  Note "FAIL" "no Authenticode method configured (Azure Trusted Signing or PFX) - MSI/NSIS would be unsigned"; $ready = $false
}

# 2. signtool.exe on PATH
if (Get-Command signtool.exe -ErrorAction SilentlyContinue) { Note "OK" "signtool.exe on PATH" }
else { Note "WARN" "signtool.exe not on PATH (add the Windows SDK bin dir; release-windows.ps1 also adds it)" }

# 3. Rust MSVC toolchain
if (Get-Command cargo -ErrorAction SilentlyContinue) { Note "OK" ("cargo present (" + (cargo --version) + ")") }
else { Note "FAIL" "cargo (Rust MSVC toolchain) missing"; $ready = $false }

# 4. Node
if (Get-Command node -ErrorAction SilentlyContinue) { Note "OK" ("node present (" + (node --version) + ")") }
else { Note "FAIL" "node missing"; $ready = $false }

# 5. Updater key presence (value never read)
if ($env:TAURI_SIGNING_PRIVATE_KEY) { Note "OK" "TAURI_SIGNING_PRIVATE_KEY present (updater artifacts will be produced)" }
else { Note "WARN" "TAURI_SIGNING_PRIVATE_KEY not set (build is direct-download-only, no auto-update artifact)" }

Write-Host ""
if ($ready) { Write-Host "Windows GA signing: READY"; exit 0 }
else { Write-Host "Windows GA signing: NOT READY (see FAIL above)"; exit 1 }
