# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# Windows probes, run ON the build host. Every probe writes <name>.out and
# <name>.rc into the work directory; nothing here decides what an output means.
#
# The MSI is installed, driven and uninstalled again, so the machine is left as
# it was found. `Get-AuthenticodeSignature` exits 0 whatever it thinks of a
# signature, which is why the result is printed as a RESULT line for the judge
# to read rather than left to an exit code that always says success.
param(
  [Parameter(Mandatory = $true)][string]$Msi,
  [Parameter(Mandatory = $true)][string]$Work,
  [Parameter(Mandatory = $true)][string]$Checkout,
  [string]$Documents = "",
  [switch]$NoLaunch
)
$ErrorActionPreference = "Continue"
$probes = Join-Path $Work "probes"
New-Item -ItemType Directory -Force -Path $probes | Out-Null

function Write-Probe([string]$Name, [string]$Text, [int]$Rc) {
  Set-Content -Path (Join-Path $probes "$Name.out") -Value $Text -Encoding utf8
  Set-Content -Path (Join-Path $probes "$Name.rc") -Value $Rc -Encoding ascii
}

# ── S1 identity ───────────────────────────────────────────────────────────────
$sig = Get-AuthenticodeSignature -FilePath $Msi
$subject = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { "(no signer certificate)" }
$verdict = if ($sig.Status -eq "Valid" -and $subject -match "CN=Innovation Trigger B\.V\.") { "PASS" } else { "FAIL($($sig.Status))" }
Write-Probe "authenticode" "RESULT authenticode=$verdict`nsubject=$subject" 0

$installer = New-Object -ComObject WindowsInstaller.Installer
try {
  $db = $installer.GetType().InvokeMember("OpenDatabase", "InvokeMethod", $null, $installer, @($Msi, 0))
  $view = $db.GetType().InvokeMember("OpenView", "InvokeMethod", $null, $db, @("SELECT Value FROM Property WHERE Property='ProductVersion'"))
  $view.GetType().InvokeMember("Execute", "InvokeMethod", $null, $view, $null) | Out-Null
  $rec = $view.GetType().InvokeMember("Fetch", "InvokeMethod", $null, $view, $null)
  $productVersion = $rec.GetType().InvokeMember("StringData", "GetProperty", $null, $rec, 1)
  Write-Probe "bundle_version" $productVersion 0
} catch {
  Write-Probe "bundle_version" "could not read ProductVersion: $($_.Exception.Message)" 1
}

$install = Start-Process msiexec.exe -ArgumentList @("/i", "`"$Msi`"", "/quiet", "/norestart") -Wait -PassThru
$exe = "C:\Program Files\PDFluent\pdfluent-desktop.exe"
if ($install.ExitCode -ne 0) {
  Write-Probe "msi_install" "msiexec /i exited $($install.ExitCode)" $install.ExitCode
} elseif (-not (Test-Path $exe)) {
  Write-Probe "msi_install" "msiexec reported success but $exe is not there" 1
} else {
  Write-Probe "msi_install" "installed: $exe ($((Get-Item $exe).VersionInfo.ProductVersion))" 0
}

# ── S2 launch, open, quit ─────────────────────────────────────────────────────
$logDir = Join-Path $env:LOCALAPPDATA "com.pdfluent.app\logs"
$appLog = Join-Path $logDir "PDFluent.log"
$sessions = Join-Path $logDir "sessions.log"
function Size([string]$p) { if (Test-Path $p) { (Get-Item $p).Length } else { 0 } }
function Delta([string]$p, [long]$off) {
  if (-not (Test-Path $p)) { return "" }
  $fs = [System.IO.File]::Open($p, "Open", "Read", "ReadWrite")
  try { $fs.Seek($off, "Begin") | Out-Null; (New-Object System.IO.StreamReader($fs)).ReadToEnd() } finally { $fs.Dispose() }
}

$sessionsBase = Size $sessions
if (-not $NoLaunch -and (Test-Path $exe) -and $Documents) {
  foreach ($doc in ($Documents -split ",") | Where-Object { $_ }) {
    $pdf = Join-Path $Checkout "src-tauri\tests\golden\$doc.pdf"
    if (-not (Test-Path $pdf)) { continue }
    Get-Process pdfluent-desktop -ErrorAction SilentlyContinue | Stop-Process -Force
    $appBase = Size $appLog
    $started = [DateTime]::UtcNow
    $p = Start-Process $exe -ArgumentList @("`"$pdf`"") -PassThru
    $parsed = $false
    for ($i = 0; $i -lt 1200; $i++) {
      if ((Delta $appLog $appBase) -match "document parsed OK") { $parsed = $true; break }
      Start-Sleep -Milliseconds 50
    }
    $ms = [int]([DateTime]::UtcNow - $started).TotalMilliseconds
    Write-Probe "wait_log_$doc" (Delta $appLog $appBase) $(if ($parsed) { 0 } else { 124 })
    if ($parsed) {
      New-Item -ItemType Directory -Force -Path (Join-Path $Work "ms"), (Join-Path $Work "numbers") | Out-Null
      Set-Content -Path (Join-Path $Work "ms\open_$doc") -Value $ms -Encoding ascii
      Set-Content -Path (Join-Path $Work "numbers\open_$doc.json") -Value "{""open_to_parsed_ms"":$ms}" -Encoding ascii
    }
    $alive = Get-Process -Id $p.Id -ErrorAction SilentlyContinue
    Write-Probe "alive" $(if ($alive -and $alive.MainWindowHandle -ne 0) { "$($p.Id)" } else { "" }) $(if ($alive) { 0 } else { 1 })
    $p.CloseMainWindow() | Out-Null
    if (-not $p.WaitForExit(15000)) { $p.Kill(); Write-Probe "quit_forced" "the app did not close within 15 s" 1 }
  }
  Write-Probe "session_delta" (Delta $sessions $sessionsBase) 0
  $crashes = Join-Path $logDir "pending-crashes.ndjson"
  Write-Probe "crash_scan" (Delta $crashes 0) 0
}

# ── S3 offline ────────────────────────────────────────────────────────────────
# There is no per-program network sandbox here that does not modify the host:
# blocking one executable needs New-NetFirewallRule and administrator rights on
# a machine other work runs on. This is a stated gap, not a hidden one, and it
# makes the Windows report INCOMPLETE until an operator decides otherwise.
$allowlist = Join-Path $Checkout "scripts\ci\offline-allowlist.mjs"
if ((Test-Path $allowlist) -and (Test-Path $exe)) {
  $out = & node $allowlist --binary $exe 2>&1 | Out-String
  Write-Probe "offline_allowlist" $out $LASTEXITCODE
}

# ── leave the machine as it was found ─────────────────────────────────────────
$uninstall = Start-Process msiexec.exe -ArgumentList @("/x", "`"$Msi`"", "/quiet", "/norestart") -Wait -PassThru
Write-Probe "msi_uninstall" "msiexec /x exited $($uninstall.ExitCode); exe present: $(Test-Path $exe)" $uninstall.ExitCode
