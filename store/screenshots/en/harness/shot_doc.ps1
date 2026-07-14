$ErrorActionPreference='SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
Add-Type @"
using System;using System.Runtime.InteropServices;
public class W{
 [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int n);
 [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h,int x,int y,int w,int ht,bool r);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
}
"@
$null=[W]::ShowWindow([W]::GetConsoleWindow(),0)
$h=(Get-Process pdfluent-desktop -EA SilentlyContinue|Where-Object{$_.MainWindowHandle -ne 0}|Select-Object -First 1).MainWindowHandle
$null=[W]::ShowWindow($h,9); Start-Sleep 1; $null=[W]::MoveWindow($h,0,0,1920,1080,$true); $null=[W]::SetForegroundWindow($h); Start-Sleep 3
$bmp=New-Object System.Drawing.Bitmap 1920,1080; $g=[System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen(0,0,0,0,(New-Object System.Drawing.Size 1920,1080)); $bmp.Save("C:\temp\pf-en\02-viewer.png"); $bmp.Dispose()
