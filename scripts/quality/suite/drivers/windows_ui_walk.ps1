# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# S5 on Windows (#471): run the ui-walk build's in-page walker on this host.
#
# The walk build is NOT the installer that ships. It is an .msi built from the same
# commit with the `ui-walk` feature (scripts/build-ui-walk.sh builds the macOS one;
# the Windows job does the same with --bundles msi), laid out here with an
# administrative image (msiexec /a) so nothing is installed or replaced on this
# machine and the PDFluent a person has installed is never touched. Its processes are
# found by their path under the work directory, never by name.
#
# The walker needs no port. The app is started in the interactive desktop session
# with two environment variables naming where to read the controls to cover and
# where to write what it saw, and it quits itself when it has written it.
#
# Writes <Work>\walk\ui_walk_result.json and nothing else a judge reads: the caller
# (ui_walk_run.mjs --accept) checks that it names the ui-walk build and stamps the
# commit it was built from, exactly as on macOS.
param(
  [Parameter(Mandatory = $true)][string]$Msi,
  [Parameter(Mandatory = $true)][string]$Work,
  [Parameter(Mandatory = $true)][string]$Fixture,
  [Parameter(Mandatory = $true)][string]$Targets,
  # Folder holding signer-test.p12 and signer-test.json (the checked-in test certificate).
  [Parameter(Mandatory = $true)][string]$Signer,
  [int]$TimeoutS = 240
)
$ErrorActionPreference = "Continue"
$MsiPath = $Msi.Replace("/", "\")
$walk = Join-Path $Work "walk"
$image = Join-Path $walk "msi-image"
$scratch = Join-Path $walk "scratch"
$result = Join-Path $walk "ui_walk_result.json"
$plan = Join-Path $walk "ui_walk_targets.json"
$doc = Join-Path $walk "ui-walk-doc.pdf"
$log = Join-Path $walk "ui_walk.log"
New-Item -ItemType Directory -Force -Path $walk, $scratch | Out-Null
Remove-Item -LiteralPath $result -Force -ErrorAction SilentlyContinue

function Say([string]$Text) { Add-Content -Path $log -Value $Text -Encoding utf8 }

$MySession = (Get-Process -Id $PID).SessionId
$DeskTask = "PDFluent ui-walk (one-shot)"

# The console session of this user, or $null (same reading as windows.ps1).
function Get-DesktopSession {
  $me = $env:USERNAME.ToLowerInvariant()
  foreach ($line in (query user 2>$null | Select-Object -Skip 1)) {
    $t = ($line.TrimStart('>') -split '\s+') | Where-Object { $_ }
    if ($t.Count -ge 4 -and $t[0].ToLowerInvariant() -eq $me -and ($t -contains 'Active')) {
      foreach ($x in $t[1..2]) { if ($x -match '^\d+$') { return [int]$x } }
    }
  }
  return $null
}

# Start `exe` with `fixture` as its first argument in the desktop session, with the
# walk's environment. From a desktop session that is a plain Start-Process; from
# session 0 (ssh) it is a one-shot interactive scheduled task.
function Start-InDesktop([string]$Exe, [string]$Pdf) {
  $cmd = "`$env:PDFLUENT_UI_WALK_TARGETS = '$plan'; `$env:PDFLUENT_UI_WALK_OUT = '$result'; " +
         "Start-Process -FilePath '$Exe' -ArgumentList @('`"$Pdf`"')"
  if ($MySession -ne 0) { & ([scriptblock]::Create($cmd)) | Out-Null; return }
  $enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($cmd))
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -EncodedCommand $enc"
  $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $DeskTask -Action $action -Principal $principal -Force | Out-Null
  try {
    Start-ScheduledTask -TaskName $DeskTask
    $until = (Get-Date).AddSeconds(30)
    do { Start-Sleep -Milliseconds 200; $st = (Get-ScheduledTask -TaskName $DeskTask).State } while ($st -eq "Running" -and (Get-Date) -lt $until)
  } finally {
    Unregister-ScheduledTask -TaskName $DeskTask -Confirm:$false -ErrorAction SilentlyContinue
  }
}

function Get-WalkProcess {
  Get-Process pdfluent-desktop -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($walk, 'OrdinalIgnoreCase') }
}

$desktop = if ($MySession -ne 0) { $MySession } else { Get-DesktopSession }
if ($null -eq $desktop) {
  Say "no interactive desktop session for $env:USERNAME, so the walk build has nowhere to draw"
  exit 2
}

# The administrative image of the walk build.
$install = Start-Process msiexec.exe -ArgumentList @("/a", "`"$MsiPath`"", "/qn", "TARGETDIR=`"$image`"", "/L*v", "`"$(Join-Path $walk 'msi-admin.log')`"") -Wait -PassThru
$exe = Get-ChildItem -LiteralPath $image -Recurse -Filter "pdfluent-desktop.exe" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
if ($install.ExitCode -ne 0 -or -not $exe) {
  Say "msiexec /a of the walk build exited $($install.ExitCode); executable: $exe"
  exit 2
}

# The plan: the controls to cover, plus where this host lets the page save to.
Copy-Item -LiteralPath $Fixture -Destination $doc -Force
$list = Get-Content -LiteralPath $Targets -Raw | ConvertFrom-Json
$signerConf = Get-Content -LiteralPath (Join-Path $Signer "signer-test.json") -Raw | ConvertFrom-Json
$certFile = Join-Path $Signer $signerConf.file
$planObject = [ordered]@{
  targets = @($list)
  scratch = ($scratch -replace '\\', '/')
  document = ($doc -replace '\\', '/')
  certificate = ($certFile -replace '\\', '/')
  certificatePassword = $signerConf.password
}
Set-Content -LiteralPath $plan -Value (ConvertTo-Json -InputObject $planObject -Depth 8 -Compress) -Encoding utf8

Start-InDesktop $exe $doc
$deadline = (Get-Date).AddSeconds($TimeoutS)
while (-not (Test-Path -LiteralPath $result) -and (Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 500
  if (-not (Get-WalkProcess)) { Start-Sleep -Seconds 2; if (-not (Test-Path -LiteralPath $result)) { break } }
}
Start-Sleep -Seconds 2
# It quits itself after writing. Anything still here is ended by path, last.
Get-WalkProcess | Stop-Process -Force -ErrorAction SilentlyContinue

if (-not (Test-Path -LiteralPath $result)) {
  Say "the walk build wrote no result within $TimeoutS s"
  exit 2
}
Say "walk result written: $result"
exit 0
