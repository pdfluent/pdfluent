# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary and confidential.
# Free for personal, non-commercial use.
# Commercial use requires a valid license.
# See https://pdfluent.com/license for terms.

param (
  [Parameter(Mandatory = $true)]
  [string]$BinaryPath
)

if (-not $env:WINDOWS_CERTIFICATE_PATH) {
  Write-Error "WINDOWS_CERTIFICATE_PATH is not set. Provide the base64 PFX via workflow secret WINDOWS_CERTIFICATE."
  exit 1
}

if (-not (Test-Path $env:WINDOWS_CERTIFICATE_PATH)) {
  Write-Error "Signing certificate file not found at path: $env:WINDOWS_CERTIFICATE_PATH"
  exit 1
}

if (-not $env:WINDOWS_CERTIFICATE_PASSWORD) {
  Write-Error "WINDOWS_CERTIFICATE_PASSWORD is not set."
  exit 1
}

$timestampUrl = if ($env:WINDOWS_TIMESTAMP_URL) { $env:WINDOWS_TIMESTAMP_URL } else { "http://timestamp.digicert.com" }

$arguments = @(
  "sign",
  "/f",
  $env:WINDOWS_CERTIFICATE_PATH,
  "/p",
  $env:WINDOWS_CERTIFICATE_PASSWORD,
  "/fd",
  "SHA256",
  "/tr",
  $timestampUrl,
  "/td",
  "SHA256",
  $BinaryPath
)

& signtool.exe @arguments
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
