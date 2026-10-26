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
#
# The golden documents and the allow-list are handed to this script rather than
# looked up in a checkout on this machine: the checkout here is whatever was
# last built from, and a lane that opens nothing because that copy is old
# reports a tidy skip instead of the coverage it was asked for.
#
# THE DESKTOP. The app is a WebView2 window, and WebView2 does not start in
# session 0: no paint, no frontend, so the frontend never asks the backend to
# open the document and no "document parsed OK" ever appears. ssh lands in
# session 0, and so does a runner installed as a service -- which is why every
# open row of the 1.0.0 Windows report timed out after 60 s on a build that
# opens all seventeen documents fine by hand (#427). The launch, the liveness
# check and the quit therefore run in the console session of this user (a
# one-shot scheduled task, interactive logon, no password) whenever this script
# itself is in session 0; from a desktop session they run directly. No desktop
# session for this user is a named failure, said once, not seventeen timeouts.
#
# -Mode ci (release_suite.sh --mode ci, run ON the Windows CI runner): the MSI
# is an unsigned CI build. It is unpacked with an administrative install
# (msiexec /a) into the work directory instead of being installed, so the
# PDFluent installed on this machine is never upgraded, replaced or uninstalled
# by a CI run, and every process this script touches is found by its path
# under the work directory, never by its name.
param(
  [Parameter(Mandatory = $true)][string]$Msi,
  [Parameter(Mandatory = $true)][string]$Work,
  [Parameter(Mandatory = $true)][string]$Golden,
  [Parameter(Mandatory = $true)][string]$Allowlist,
  [string]$Documents = "",
  [switch]$NoLaunch,
  [ValidateSet("release", "ci")][string]$Mode = "release",
  # How long the first launch stays open after its parse mark, so the socket
  # samples cover the app's startup update check (meta.json s2_hold_ms, #551).
  [int]$HoldMs = 0
)
$ErrorActionPreference = "Continue"

# msiexec answers 1619 -- "could not open this installation package" -- to a
# path with forward slashes, which is the shape a path arrives in over ssh. The
# first real run on the build host installed nothing for that reason and the
# report read as a broken installer.
$MsiPath = $Msi.Replace("/", "\")

$probes = Join-Path $Work "probes"
New-Item -ItemType Directory -Force -Path $probes | Out-Null

function Write-Probe([string]$Name, [string]$Text, [int]$Rc) {
  Set-Content -Path (Join-Path $probes "$Name.out") -Value $Text -Encoding utf8
  Set-Content -Path (Join-Path $probes "$Name.rc") -Value $Rc -Encoding ascii
}

# ── The desktop session ───────────────────────────────────────────────────────
$MySession = (Get-Process -Id $PID).SessionId
$DeskTask = "PDFluent release suite (one-shot)"
$DeskOut = Join-Path $Work "desk-out.txt"

# The console session of this user, or $null. `query user` is the one source
# that does not need elevation; its columns shift when SESSIONNAME is empty.
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

# Run one PowerShell command in this user's desktop session and return what it
# printed. From a desktop session that is a plain call; from session 0 it is a
# one-shot interactive scheduled task, removed again before this returns.
function Invoke-InDesktop([string]$Command, [int]$TimeoutS = 30) {
  if ($MySession -ne 0) { return (& ([scriptblock]::Create($Command)) | Out-String) }
  Remove-Item -LiteralPath $DeskOut -Force -ErrorAction SilentlyContinue
  $wrapped = "& { $Command } *> '$DeskOut'"
  $enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($wrapped))
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -EncodedCommand $enc"
  $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $DeskTask -Action $action -Principal $principal -Force | Out-Null
  try {
    Start-ScheduledTask -TaskName $DeskTask
    $deadline = (Get-Date).AddSeconds($TimeoutS)
    do { Start-Sleep -Milliseconds 200; $st = (Get-ScheduledTask -TaskName $DeskTask).State }
    while ($st -eq "Running" -and (Get-Date) -lt $deadline)
    if (Test-Path -LiteralPath $DeskOut) { return (Get-Content -LiteralPath $DeskOut -Raw) }
    return ""
  } finally {
    Unregister-ScheduledTask -TaskName $DeskTask -Confirm:$false -ErrorAction SilentlyContinue
  }
}

$desktop = if ($MySession -ne 0) { $MySession } else { Get-DesktopSession }
Write-Probe "desktop_session" "script session $MySession; desktop session $(if ($null -ne $desktop) { $desktop } else { 'none' }) for $env:USERNAME" $(if ($null -ne $desktop) { 0 } else { 1 })

# ── S1 identity ───────────────────────────────────────────────────────────────
# A CI build is unsigned by design; the driver records that row as not
# applicable, so no probe is written for it here.
if ($Mode -eq "release") {
  $sig = Get-AuthenticodeSignature -FilePath $MsiPath
  $subject = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { "(no signer certificate)" }
  $verdict = if ($sig.Status -eq "Valid" -and $subject -match "CN=Innovation Trigger B\.V\.") { "PASS" } else { "FAIL($($sig.Status))" }
  Write-Probe "authenticode" "RESULT authenticode=$verdict`nsubject=$subject" 0
}

$installer = New-Object -ComObject WindowsInstaller.Installer
try {
  $db = $installer.GetType().InvokeMember("OpenDatabase", "InvokeMethod", $null, $installer, @($MsiPath, 0))
  $view = $db.GetType().InvokeMember("OpenView", "InvokeMethod", $null, $db, @("SELECT Value FROM Property WHERE Property='ProductVersion'"))
  $view.GetType().InvokeMember("Execute", "InvokeMethod", $null, $view, $null) | Out-Null
  $rec = $view.GetType().InvokeMember("Fetch", "InvokeMethod", $null, $view, $null)
  $productVersion = $rec.GetType().InvokeMember("StringData", "GetProperty", $null, $rec, 1)
  Write-Probe "bundle_version" $productVersion 0
} catch {
  Write-Probe "bundle_version" "could not read ProductVersion: $($_.Exception.Message)" 1
}

if ($Mode -eq "ci") {
  # An administrative image, not an install: the files the MSI carries, laid
  # out the way it would lay them out, with nothing registered on the machine.
  $image = Join-Path $Work "msi-image"
  $install = Start-Process msiexec.exe -ArgumentList @("/a", "`"$MsiPath`"", "/qn", "TARGETDIR=`"$image`"", "/L*v", "`"$(Join-Path $Work 'msi-admin.log')`"") -Wait -PassThru
  $exe = Get-ChildItem -LiteralPath $image -Recurse -Filter "pdfluent-desktop.exe" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
  if ($install.ExitCode -ne 0) {
    Write-Probe "msi_install" "msiexec /a (administrative image) exited $($install.ExitCode)" $install.ExitCode
  } elseif (-not $exe) {
    Write-Probe "msi_install" "msiexec /a reported success but the image holds no pdfluent-desktop.exe" 1
  } else {
    Write-Probe "msi_install" "administrative image (msiexec /a, nothing installed): $($exe.Substring($Work.Length)) ($((Get-Item $exe).VersionInfo.ProductVersion))" 0
  }
} else {
  $install = Start-Process msiexec.exe -ArgumentList @("/i", "`"$MsiPath`"", "/quiet", "/norestart") -Wait -PassThru
  $exe = "C:\Program Files\PDFluent\pdfluent-desktop.exe"
  if ($install.ExitCode -ne 0) {
    Write-Probe "msi_install" "msiexec /i exited $($install.ExitCode)" $install.ExitCode
  } elseif (-not (Test-Path $exe)) {
    Write-Probe "msi_install" "msiexec reported success but $exe is not there" 1
  } else {
    Write-Probe "msi_install" "installed: $exe ($((Get-Item $exe).VersionInfo.ProductVersion))" 0
  }
}

# Every copy of the app under test, found by its path. A release run installs
# into Program Files, so that is the path; a CI run's copy lives in the work
# directory. Never by name alone: the owner's own PDFluent may be open.
function Get-AppUnderTest { Get-Process pdfluent-desktop -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $exe -and ($_.Path -ieq $exe) } }
function Stop-AppUnderTest { Get-AppUnderTest | Stop-Process -Force -ErrorAction SilentlyContinue }

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

# ── S3 sockets, sampled during S2 ─────────────────────────────────────────────
# The same evidence the macOS lane collects with lsof, in the same shape, so
# the same judge reads it: a `--- sample N ---` line per sample, one
# `n<local>-><remote>` line per TCP connection of the app or of any process it
# started (the WebView2 processes do the frontend's networking), and a window
# line per launch. Sampling is not watching -- a connection opened and closed
# between two samples is not seen -- and the row says how many samples it rests
# on. Get-NetTCPConnection needs no elevation and works from session 0.
$netOut = Join-Path $probes "net_observe.out"
$Script:Samples = 0
$Script:Tree = @()
$Script:TreeAt = [DateTime]::MinValue
$Script:FirstLaunch = $null
$Script:Held = ""
function Get-ProcessTree([int]$Root) {
  $all = Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId -ErrorAction SilentlyContinue
  $ids = New-Object System.Collections.Generic.HashSet[int]
  [void]$ids.Add($Root)
  do {
    $grew = $false
    foreach ($x in $all) { if ($ids.Contains([int]$x.ParentProcessId) -and $ids.Add([int]$x.ProcessId)) { $grew = $true } }
  } while ($grew)
  return @($ids)
}
function Format-Peer([string]$Addr, [int]$Port) { if ($Addr -match ':') { "[$Addr]:$Port" } else { "${Addr}:$Port" } }
function Add-SocketSample([int]$Root) {
  if (((Get-Date) - $Script:TreeAt).TotalSeconds -ge 2) { $Script:Tree = Get-ProcessTree $Root; $Script:TreeAt = Get-Date }
  $Script:Samples++
  $lines = @("--- sample $($Script:Samples) ---")
  $conns = Get-NetTCPConnection -OwningProcess ([uint32[]]$Script:Tree) -ErrorAction SilentlyContinue
  foreach ($c in $conns) { $lines += "n$(Format-Peer $c.LocalAddress $c.LocalPort)->$(Format-Peer $c.RemoteAddress $c.RemotePort)" }
  Add-Content -LiteralPath $netOut -Value $lines -Encoding utf8
}
# Set once the application turns out to write no log at all. The suite watches
# that log for the parse mark, so there is nothing left to observe and every
# further document would cost a full 60 s timeout to learn the same thing --
# twenty minutes to report seventeen broken documents about an installer that
# starts perfectly and simply predates the log.
$stopped = ""

# One line per launch in `session_launches`, so a start line without its
# clean_quit is attributed to a document and to a cause instead of being two
# totals that disagree. The budget covers the close request and the wait for the
# exit together; a launch that outlives it is killed and recorded as such, never
# counted as a clean_quit that went missing. `exit_logged` is the app's own
# "clean_quit: the app is exiting normally" line, `close_guard` its note that it
# held the close for unsaved changes.
$QuitBudgetMs = 15000
$launchesOut = Join-Path $probes "session_launches.out"
Set-Content -LiteralPath $launchesOut -Value "budget_ms=$QuitBudgetMs" -Encoding ascii
Set-Content -Path (Join-Path $probes "session_launches.rc") -Value 0 -Encoding ascii
function Add-Launch([string]$Doc, [long]$SessBase, [long]$AppBase, [bool]$Forced, [int]$QuitMs) {
  $s = Delta $sessions $SessBase
  $a = Delta $appLog $AppBase
  $starts = ([regex]::Matches($s, '(?m)^start ')).Count
  $quits = ([regex]::Matches($s, '(?m)^clean_quit ')).Count
  $exitLogged = [int]($a -match 'clean_quit: the app is exiting normally')
  $guard = [int]($a -match 'close guard:')
  Add-Content -LiteralPath $launchesOut -Value "$Doc starts=$starts quits=$quits forced=$([int]$Forced) quit_ms=$QuitMs exit_logged=$exitLogged close_guard=$guard" -Encoding ascii
}
if ($null -eq $desktop) {
  $stopped = "no desktop session for $env:USERNAME on this machine: WebView2 cannot start in session 0, so the app could not show its window or open the document; this document was not opened"
}
if (-not $NoLaunch -and $exe -and (Test-Path $exe) -and $Documents) {
  foreach ($doc in ($Documents -split ",") | Where-Object { $_ }) {
    if ($stopped) { Write-Probe "wait_log_$doc" $stopped 125; continue }
    $pdf = Join-Path $Golden "$doc.pdf"
    if (-not (Test-Path $pdf)) {
      # Not a silent skip: a document that is not there leaves a probe saying so,
      # which the judge turns into a FAIL row for that document rather than into
      # one fewer row nobody counts.
      Write-Probe "wait_log_$doc" "the golden document was not shipped to this host" 1
      continue
    }
    Stop-AppUnderTest
    $appBase = Size $appLog
    $sessBase = Size $sessions
    $started = [DateTime]::UtcNow
    $before = @(Get-AppUnderTest | ForEach-Object Id)
    $launched = Invoke-InDesktop "(Start-Process -FilePath '$exe' -ArgumentList @('`"$pdf`"') -PassThru).Id"
    $p = $null
    if ($launched -match '(\d+)') { $p = Get-Process -Id ([int]$Matches[1]) -ErrorAction SilentlyContinue }
    if (-not $p) { $p = Get-AppUnderTest | Where-Object { $before -notcontains $_.Id } | Select-Object -First 1 }
    if ($null -eq $Script:FirstLaunch) { $Script:FirstLaunch = $started }
    $parsed = $false
    for ($i = 0; $i -lt 1200; $i++) {
      if ((Delta $appLog $appBase) -match "document parsed OK") { $parsed = $true; break }
      if ($p -and ($i % 10 -eq 0)) { Add-SocketSample $p.Id }
      Start-Sleep -Milliseconds 50
    }
    $ms = [int]([DateTime]::UtcNow - $started).TotalMilliseconds
    # The first launch is held open until the startup update check has had its
    # moment (#551); one launch that outlives it is the whole claim.
    if ($p -and $HoldMs -gt 0 -and -not $Script:Held) {
      $Script:Held = $doc
      while (([DateTime]::UtcNow - $started).TotalMilliseconds -lt $HoldMs -and -not $p.HasExited) {
        Add-SocketSample $p.Id
        Start-Sleep -Milliseconds 500
      }
    }
    if ($p -and -not $p.HasExited) { Add-SocketSample $p.Id }
    Add-Content -LiteralPath $netOut -Value @(
      "--- document $doc window $([int]([DateTime]::UtcNow - $started).TotalMilliseconds) ms ---",
      "--- window $([int]([DateTime]::UtcNow - $Script:FirstLaunch).TotalMilliseconds) ms ---") -Encoding utf8
    Write-Probe "wait_log_$doc" (Delta $appLog $appBase) $(if ($parsed) { 0 } else { 124 })
    if ($parsed) {
      New-Item -ItemType Directory -Force -Path (Join-Path $Work "ms"), (Join-Path $Work "numbers") | Out-Null
      Set-Content -Path (Join-Path $Work "ms\open_$doc") -Value $ms -Encoding ascii
      Set-Content -Path (Join-Path $Work "numbers\open_$doc.json") -Value "{""open_to_parsed_ms"":$ms}" -Encoding ascii
    }
    if (-not (Test-Path $appLog)) {
      # The path without the account name in it. A report is committed and read
      # by people outside this machine; whose home directory it was is not part
      # of what it says.
      Write-Probe "applog_missing" ($appLog -replace [regex]::Escape($env:LOCALAPPDATA), '%LOCALAPPDATA%') 1
      $stopped = "the application wrote no log file, so the parse mark could not appear; this document was not opened"
    }
    if (-not $p) {
      Write-Probe "alive" "" 1
      # No handle to close: the sweep at the top of the next launch kills it.
      Add-Launch $doc $sessBase $appBase $true -1
      continue
    }
    # The window handle is only visible from the session the window is on.
    $win = Invoke-InDesktop "`$q = Get-Process -Id $($p.Id) -ErrorAction SilentlyContinue; if (`$q) { [int64]`$q.MainWindowHandle } else { 0 }"
    $hasWindow = ($win -match '(-?\d+)') -and ([int64]$Matches[1] -ne 0)
    $alive = Get-Process -Id $p.Id -ErrorAction SilentlyContinue
    Write-Probe "alive" $(if ($alive -and $hasWindow) { "$($p.Id)" } else { "" }) $(if ($alive) { 0 } else { 1 })
    # A quit the way a person quits: close the main window, from its session.
    $quitAt = [DateTime]::UtcNow
    Invoke-InDesktop "`$q = Get-Process -Id $($p.Id) -ErrorAction SilentlyContinue; if (`$q) { `$q.CloseMainWindow() | Out-Null }" | Out-Null
    $forced = $false
    if (-not $p.WaitForExit([Math]::Max(1, $QuitBudgetMs - [int]([DateTime]::UtcNow - $quitAt).TotalMilliseconds))) {
      $forced = $true
      $p.Kill()
      [void]$p.WaitForExit(5000)
    }
    Add-Launch $doc $sessBase $appBase $forced ([int]([DateTime]::UtcNow - $quitAt).TotalMilliseconds)
  }
  Write-Probe "session_delta" (Delta $sessions $sessionsBase) 0
  if ($Script:Samples -gt 0) {
    Set-Content -Path (Join-Path $probes "net_observe.rc") -Value 0 -Encoding ascii
  } else {
    Add-Content -LiteralPath $netOut -Value "SKIPPED (not a pass): no launch produced a process to sample, so no socket of the app was observed" -Encoding utf8
    Set-Content -Path (Join-Path $probes "net_observe.rc") -Value 3 -Encoding ascii
  }
  if ($Script:Held) { Set-Content -Path (Join-Path $Work "s2_held") -Value $Script:Held -NoNewline -Encoding ascii }
  $crashes = Join-Path $logDir "pending-crashes.ndjson"
  Write-Probe "crash_scan" (Delta $crashes 0) 0
}

# ── S3 offline ────────────────────────────────────────────────────────────────
# There is no per-program network sandbox here that does not modify the host:
# blocking one executable needs New-NetFirewallRule and administrator rights on
# a machine other work runs on. This is a stated gap, not a hidden one, and it
# makes the Windows report INCOMPLETE until an operator decides otherwise.
if ((Test-Path $Allowlist) -and $exe -and (Test-Path $exe)) {
  $out = & node $Allowlist --binary $exe 2>&1 | Out-String
  Write-Probe "offline_allowlist" $out $LASTEXITCODE
}

# ── leave the machine as it was found ─────────────────────────────────────────
Stop-AppUnderTest
if ($Mode -eq "release") {
  $uninstall = Start-Process msiexec.exe -ArgumentList @("/x", "`"$MsiPath`"", "/quiet", "/norestart") -Wait -PassThru
  Write-Probe "msi_uninstall" "msiexec /x exited $($uninstall.ExitCode); exe present: $(Test-Path $exe)" $uninstall.ExitCode
}
