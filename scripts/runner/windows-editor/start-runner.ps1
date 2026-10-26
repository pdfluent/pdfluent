# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# Start the Windows editor runner (a scheduled task in the console session of
# the build account; see docs/CI_DESKTOP_PLATFORMS.md). Start it once. A second
# start on top of a running or just-killed listener makes a second session and
# the 409 "session already exists" loop. The wait for GitHub to show it online
# is in runner-ctl.sh (it has the GitHub token; this box does not).
$ErrorActionPreference = 'Stop'
if (@(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'actions-runner-pdfluent-editor' -and $_.Name -eq 'Runner.Listener.exe' }).Count) {
  Write-Host 'REFUSED: an editor listener is already running; stop it with stop-runner.ps1 first.'; exit 1
}
Start-ScheduledTask -TaskName 'PDFluent editor runner'
Start-Sleep 5
Write-Host "task state: $((Get-ScheduledTask -TaskName 'PDFluent editor runner').State)"
