# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# Windows half of the screenshot suite: put the window of process -Pid at
# -Width x -Height physical pixels, top left of the primary screen, and either
# only do that (-Out empty) or also photograph exactly the visible frame
# (DWM extended bounds, so no invisible resize border and no shadow) to -Out.
# Sizes are PHYSICAL pixels: the process is made DPI-aware first, so a
# 200 % display and a 100 % display both give the size asked for.
# The desktop must be an interactive session; the window is raised first and
# nothing else may overlap it.
param(
  [Parameter(Mandatory=$true)][int]$Pid,
  [Parameter(Mandatory=$true)][int]$Width,
  [Parameter(Mandatory=$true)][int]$Height,
  [string]$Out = ''
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class W {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int hh, bool repaint);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attr, out RECT r, int size);
}
'@
[void][W]::SetProcessDPIAware()
$h = (Get-Process -Id $Pid).MainWindowHandle
if ($h -eq [IntPtr]::Zero) { throw "process $Pid has no main window" }
[void][W]::ShowWindow($h, 9)            # SW_RESTORE: never maximised
[void][W]::SetForegroundWindow($h)
# The frame is a few pixels larger than the visible window (invisible resize
# border); ask for the size, read the visible rectangle back and correct once.
[void][W]::MoveWindow($h, 0, 0, $Width, $Height, $true)
Start-Sleep -Milliseconds 400
$r = New-Object W+RECT
[void][W]::DwmGetWindowAttribute($h, 9, [ref]$r, 16)
$dx = ($r.R - $r.L) - $Width; $dy = ($r.B - $r.T) - $Height
if ($dx -ne 0 -or $dy -ne 0) {
  [void][W]::MoveWindow($h, -$r.L, -$r.T, $Width - $dx, $Height - $dy, $true)
  Start-Sleep -Milliseconds 400
  [void][W]::DwmGetWindowAttribute($h, 9, [ref]$r, 16)
}
$w = $r.R - $r.L; $hh = $r.B - $r.T
if ($Out -eq '') { Write-Output "$w x $hh"; exit 0 }
if ($w -ne $Width -or $hh -ne $Height) { throw "window is $w x $hh, asked for $Width x $Height" }
$bmp = New-Object System.Drawing.Bitmap $w, $hh
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.L, $r.T, 0, 0, (New-Object System.Drawing.Size $w, $hh))
$g.Dispose()
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output "$w x $hh"
