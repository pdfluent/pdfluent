# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# Tracked copy of E:\actions-runner-pdfluent-editor\hook-started.ps1 on the Windows
# desktop (the file the runner's ACTIONS_RUNNER_HOOK_JOB_STARTED points at).
# Deploy: copy it over the deployed file; the runner reads it at every job start,
# no restart needed. See docs/CI_DESKTOP_PLATFORMS.md.
# Start gate for the pdfluent-internal (editor) Windows runner, set up 17-10-2026 (editor phase 0).
# The runner runs as Gebruiker in the interactive console session (scheduled task "PDFluent editor runner"),
# because the smoke has to start the real app with a desktop: from session 0 (a service, or ssh) WebView2
# never paints and the app never asks the backend to open the document.
# Refuses a job (exit 1, cause named) when
#  (1) a routed variable is unset/wrong or its directory is missing or not writable (no fallback to C:), or
#  (2) C: has < 1.0 GB, E: < 20 GB free, or D: is not mounted.
# Yields first: while a Runner.Worker of a session-0 runner (the engine and other service runners) is busy,
# it waits up to 90 min, so editor CI never takes the machine from a job that is already running.
# Then yields to the Linux jobs in WSL, the editor's and the engine's (up to 180 min, same pattern): the WSL VM and a Windows
# build together exhaust the 16 GB of this machine and the runner loses its connection (21-10-2026: two
# quality/journeys jobs lost that way).
$ErrorActionPreference = 'Stop'

# Jobs running in the WSL distro on this machine, of any runner there (the editor's and the engine's: the VM's
# memory is the shared resource, whoever's job fills it). A Windows build next to them starves the host of
# memory. Returns the number of busy workers, or -1
# when WSL could not be asked (then the hook does not wait: a broken probe must not block CI).
function Get-WslJobs {
  try {
    $script = 'n=0; for p in $(pgrep -f Runner.Worker); do grep -q actions.runner. /proc/$p/cgroup 2>/dev/null && n=$((n+1)); done; echo $n'
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'wsl.exe'; $psi.Arguments = "-d Ubuntu -e bash -c `"$script`""
    $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true; $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true
    $p = [Diagnostics.Process]::Start($psi)
    if (-not $p.WaitForExit(20000)) { try { $p.Kill() } catch {}; return -1 }
    $out = ($p.StandardOutput.ReadToEnd() -replace "[^0-9]",'')
    if ($out -eq '') { return -1 }
    return [int]$out
  } catch { return -1 }
}
if ($env:PDFLUENT_HOOK_PROBE_WSL) { "wsl jobs: $(Get-WslJobs)"; exit 0 }
$State = 'E:\editor-runner-state'
$Ledger = Join-Path $State 'ledger.tsv'
function Row([string]$phase, [string]$note) {
  $c = [math]::Round((Get-PSDrive C).Free/1GB,2); $e = [math]::Round((Get-PSDrive E).Free/1GB,2)
  $line = "{0}`t{1}`t{2}`t{3}`t{4}`tC={5}`tE={6}`t{7}" -f (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'), $phase, $env:GITHUB_RUN_ID, $env:GITHUB_JOB, $env:GITHUB_WORKFLOW, $c, $e, ($note -replace "[`t`r`n]",' ')
  try { Add-Content -LiteralPath $Ledger -Value $line } catch { Write-Warning "ledger: $_" }
}
function Refuse([string]$why) { Row 'refused' $why; Write-Host "[editor-gate] REFUSED: $why"; [Console]::Error.WriteLine("editor start gate: $why"); exit 1 }

$routes = [ordered]@{ TEMP='E:\editor-tmp'; TMP='E:\editor-tmp'; CARGO_HOME='E:\editor-cargo-home'; CARGO_TARGET_DIR='E:\editor-target';
  npm_config_cache='D:\pdfluent-tools\editor-caches\npm'; PIP_CACHE_DIR='D:\pdfluent-tools\editor-caches\pip'; WEBVIEW2_USER_DATA_FOLDER='E:\editor-webview2' }
$bad = @()
foreach ($k in $routes.Keys) {
  $v = [Environment]::GetEnvironmentVariable($k)
  if (-not $v) { $bad += "$k is not set (.env not loaded?)"; continue }
  if ($v.TrimEnd('\') -ne $routes[$k]) { $bad += "$k is '$v', expected '$($routes[$k])'"; continue }
  if (-not (Test-Path -LiteralPath $v -PathType Container)) { $bad += "$k '$v' does not exist"; continue }
  try { $p = Join-Path $v ('.probe-' + [guid]::NewGuid().ToString('N')); $fs = [IO.File]::Create($p, 1, [IO.FileOptions]::DeleteOnClose); $fs.Dispose() } catch { $bad += "$k '$v' is not writable" }
}
if ($bad.Count) { Refuse ("routing: " + ($bad -join ' | ')) }
if (-not (Get-PSDrive D -EA SilentlyContinue)) { Refuse 'volume D: is not mounted' }

$t0 = Get-Date
while ((Get-Process Runner.Worker -EA SilentlyContinue | Where-Object SessionId -eq 0) -and ((Get-Date) - $t0).TotalMinutes -lt 90) {
  if ([int]((Get-Date) - $t0).TotalSeconds % 300 -lt 30) { "[editor-gate] a service runner job is busy on this machine; waiting ($([int]((Get-Date) - $t0).TotalMinutes) min so far)" }
  Start-Sleep 30
}
$waited = [int]((Get-Date) - $t0).TotalSeconds
if ($waited -gt 5) { "[editor-gate] waited $waited s for the service runners" }

$t1 = Get-Date
$n = Get-WslJobs
while ($n -gt 0 -and ((Get-Date) - $t1).TotalMinutes -lt 180) {
  if ([int]((Get-Date) - $t1).TotalSeconds % 300 -lt 40) { "[editor-gate] waiting: $n job(s) (editor or engine) are running in WSL on this machine and a Windows build next to them exhausts its RAM ($([int]((Get-Date) - $t1).TotalMinutes) min so far, max 180)" }
  Start-Sleep 30
  $n = Get-WslJobs
}
$waitedWsl = [int]((Get-Date) - $t1).TotalSeconds
if ($waitedWsl -gt 5) { "[editor-gate] waited $waitedWsl s for the WSL jobs" + $(if ($n -gt 0) { " (gave up at the 180 min cap; $n still running)" } else { '' }) }
if ($n -lt 0) { "[editor-gate] could not ask WSL for running jobs; not waiting" }

$c = [math]::Round((Get-PSDrive C).Free/1GB,2); $e = [math]::Round((Get-PSDrive E).Free/1GB,2)
if ($c -lt 1.0) { Refuse "C: has $c GB free (needs 1.0: the WSL disk and the engine runner live on C:, and editor CI must never be what fills it)" }
if ($e -lt 20) { Refuse "E: has $e GB free (needs 20)" }
$s = (Get-Process -Id $PID).SessionId
if ($s -eq 0) { Refuse 'the runner is in session 0: no desktop, so the app smoke cannot start the app (start it through the scheduled task, not as a service)' }
Row 'start' "session $s; waited ${waited}s (service runners), ${waitedWsl}s (WSL jobs)"
"[editor-gate] ok: session $s, C: $c GB, E: $e GB free, routing ok ($($routes.Count) vars)"
exit 0

