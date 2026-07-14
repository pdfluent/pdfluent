# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.

param (
  [Parameter(Mandatory = $true)]
  [string]$BinaryPath
)

# Ensure signtool.exe is reachable (added by release-windows.ps1; guard for
# standalone invocation or future CI use).
$sdkBin = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64"
if ((Test-Path $sdkBin) -and ($env:PATH -notlike "*22621*")) {
  $env:PATH = "$sdkBin;$env:PATH"
}

# Signing strategy (first configured method wins):
#   1. Azure Trusted Signing - when TRUSTED_SIGNING_PROFILE is set. Cloud-held
#      certificate, no local PFX. Uses signtool.exe + Azure.CodeSigning.Dlib.dll
#      (from the TrustedSigning PS module NuGet cache). Auth via service-principal
#      env vars (AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET).
#      See docs/WINDOWS_SIGNING_AND_STORE_RUNBOOK.md.
#   2. PFX certificate file  - when WINDOWS_CERTIFICATE_PATH is set (legacy OV/EV).
#   3. Skip                  - unsigned beta build (no method configured).

# -- 1. Azure Trusted Signing (signtool /dlib) --------------------------------
if ($env:TRUSTED_SIGNING_PROFILE) {
  # Account-specific defaults for the PDFluent Trusted Signing account (West
  # Europe). Override via env for a different account/region.
  $endpoint    = if ($env:TRUSTED_SIGNING_ENDPOINT) { $env:TRUSTED_SIGNING_ENDPOINT } else { "https://weu.codesigning.azure.net/" }
  $account     = if ($env:TRUSTED_SIGNING_ACCOUNT)  { $env:TRUSTED_SIGNING_ACCOUNT }  else { "pdfluent" }
  $certProfile = $env:TRUSTED_SIGNING_PROFILE
  $timestamp   = if ($env:WINDOWS_TIMESTAMP_URL) { $env:WINDOWS_TIMESTAMP_URL } else { "http://timestamp.acs.microsoft.com" }

  # Locate the Azure.CodeSigning.Dlib.dll installed by the TrustedSigning PS module
  # (downloaded once via Install-Module TrustedSigning; lives under LOCALAPPDATA).
  $dlibBase = "$env:LOCALAPPDATA\TrustedSigning\Microsoft.Trusted.Signing.Client"
  $dlibFile = Get-ChildItem "$dlibBase\*\bin\x64\Azure.CodeSigning.Dlib.dll" -ErrorAction SilentlyContinue `
              | Sort-Object FullName -Descending | Select-Object -First 1
  if (-not $dlibFile) {
    Write-Error "Azure.CodeSigning.Dlib.dll not found in $dlibBase. Run: Install-Module TrustedSigning -Scope CurrentUser -Force"
    exit 1
  }

  # Write the signing metadata JSON without a UTF-8 BOM; the DLib's JSON
  # parser rejects BOM-prefixed files (throws 0xEF invalid start byte).
  $meta = [ordered]@{
    Endpoint               = $endpoint
    CodeSigningAccountName = $account
    CertificateProfileName = $certProfile
  } | ConvertTo-Json -Compress
  $metaFile = [System.IO.Path]::GetTempFileName() + ".json"
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($metaFile, $meta, $utf8NoBom)

  Write-Host "Signing '$BinaryPath' via Azure Trusted Signing (account='$account', profile='$certProfile')."
  Write-Host "DLib: $($dlibFile.FullName)"

  & signtool.exe sign /dlib $dlibFile.FullName /dmdf $metaFile /fd SHA256 /tr $timestamp /td SHA256 $BinaryPath
  $rc = $LASTEXITCODE
  Remove-Item $metaFile -ErrorAction SilentlyContinue
  if ($rc -ne 0) { exit $rc }
  exit 0
}

# -- 2. PFX certificate file (legacy OV/EV) -----------------------------------
if ($env:WINDOWS_CERTIFICATE_PATH) {
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
  exit 0
}

# -- 3. Skip (unsigned beta) --------------------------------------------------
Write-Warning "No Windows signing method configured (set TRUSTED_SIGNING_PROFILE or WINDOWS_CERTIFICATE_PATH) - skipping code signing (beta build)."
exit 0
