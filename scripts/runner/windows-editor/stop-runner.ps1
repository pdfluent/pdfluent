# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# Stop the Windows editor runner the way the runner wants to be stopped.
#
# Killing the listener mid-session leaves a stale session at GitHub; the next
# start then retries "A session for this runner already exists" (HTTP 409) every
# 30 s until the old one expires, and the runner shows offline while its own log
# says "Listening" (21-10 and 22-10). So: no kill. Ctrl+C is sent to the
# listener's console, which makes it close its session and exit with 0.
#
# Refuses while a job is running (the empty-queue rule, docs/CI_DESKTOP_PLATFORMS.md).
$ErrorActionPreference = 'Stop'
$dir = 'E:\actions-runner-pdfluent-editor'
$workers = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'actions-runner-pdfluent-editor' -and $_.Name -match 'Worker' })
if ($workers.Count) { Write-Host "REFUSED: an editor job is running (Runner.Worker $($workers[0].ProcessId))."; exit 1 }
$listener = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'actions-runner-pdfluent-editor' -and $_.Name -eq 'Runner.Listener.exe' } | Select-Object -First 1
if (-not $listener) { Write-Host 'The editor runner is not running.'; exit 0 }

Add-Type @'
using System; using System.Runtime.InteropServices;
public static class CtrlC {
  [DllImport("kernel32.dll")] static extern bool FreeConsole();
  [DllImport("kernel32.dll")] static extern bool AttachConsole(uint pid);
  [DllImport("kernel32.dll")] static extern bool SetConsoleCtrlHandler(IntPtr h, bool add);
  [DllImport("kernel32.dll")] static extern bool GenerateConsoleCtrlEvent(uint evt, uint grp);
  public static bool Send(uint pid) {
    FreeConsole();
    if (!AttachConsole(pid)) return false;
    SetConsoleCtrlHandler(IntPtr.Zero, true);
    bool ok = GenerateConsoleCtrlEvent(0, 0);
    System.Threading.Thread.Sleep(1000);
    FreeConsole();
    SetConsoleCtrlHandler(IntPtr.Zero, false);
    return ok;
  }
}
'@
$sent = [CtrlC]::Send([uint32]$listener.ProcessId)
Write-Host "Ctrl+C sent to Runner.Listener $($listener.ProcessId): $sent"
$until = (Get-Date).AddSeconds(90)
while ((Get-Process -Id $listener.ProcessId -ErrorAction SilentlyContinue) -and (Get-Date) -lt $until) { Start-Sleep 2 }
if (Get-Process -Id $listener.ProcessId -ErrorAction SilentlyContinue) {
  Write-Host 'The listener did not exit within 90 s. It is left running; nothing was killed. Look at the diag log.'
  exit 2
}
# The scheduled task has ended with its listener; make sure it is not left "Running".
Stop-ScheduledTask -TaskName 'PDFluent editor runner' -ErrorAction SilentlyContinue
Write-Host 'Stopped cleanly. Wait 2 to 3 minutes before starting again.'
