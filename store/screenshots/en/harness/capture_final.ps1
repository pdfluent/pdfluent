# Captures the 5 document scenes from an already-running, English-set instance.
# 02-reading, 03-edit (caret+toolbar), 04-convert, 05-tools, 06-sign.
$ErrorActionPreference='SilentlyContinue'
$dir='C:\temp\pf-en'; $shots="$dir\final"; New-Item -ItemType Directory -Force -Path $shots|Out-Null
Set-Content "$dir\final.log" "start"
function Log($m){ Add-Content "$dir\final.log" $m }
Add-Type -AssemblyName System.Windows.Forms,System.Drawing,UIAutomationClient,UIAutomationTypes
Add-Type @"
using System;using System.Runtime.InteropServices;
public class W{
 [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int n);
 [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h,int x,int y,int w,int ht,bool r);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint dx,uint dy,uint d,IntPtr e);
}
"@
$null=[W]::ShowWindow([W]::GetConsoleWindow(),0)
$h=(Get-Process pdfluent-desktop -EA SilentlyContinue|Where-Object{$_.MainWindowHandle -ne 0}|Select-Object -First 1).MainWindowHandle
$null=[W]::ShowWindow($h,9); Start-Sleep 1; $null=[W]::MoveWindow($h,0,0,1920,1080,$true); $null=[W]::SetForegroundWindow($h); Start-Sleep 2
function Shot($n){ $b=New-Object System.Drawing.Bitmap 1920,1080; $g=[System.Drawing.Graphics]::FromImage($b); $g.CopyFromScreen(0,0,0,0,(New-Object System.Drawing.Size 1920,1080)); $b.Save("$shots\$n.png"); $b.Dispose(); Log "shot $n" }
function ClickName($name){
  $root=[Windows.Automation.AutomationElement]::RootElement
  for($i=0;$i -lt 10;$i++){
    $els=$root.FindAll([Windows.Automation.TreeScope]::Descendants,(New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ControlTypeProperty,[Windows.Automation.ControlType]::Button)))
    foreach($el in $els){ if($el.Current.Name -eq $name){ $r=$el.Current.BoundingRectangle; if($r.Width -gt 0){ $x=[int]($r.X+$r.Width/2);$y=[int]($r.Y+$r.Height/2); $null=[W]::SetCursorPos($x,$y); Start-Sleep -Milliseconds 250; [W]::mouse_event(0x02,0,0,0,[IntPtr]::Zero);[W]::mouse_event(0x04,0,0,0,[IntPtr]::Zero); Log "click $name @$x,$y"; return $true } } }
    Start-Sleep 1
  }
  Log "MISS $name"; return $false
}
function ClickXy($x,$y){ $null=[W]::SetCursorPos($x,$y); Start-Sleep -Milliseconds 250; [W]::mouse_event(0x02,0,0,0,[IntPtr]::Zero);[W]::mouse_event(0x04,0,0,0,[IntPtr]::Zero); Start-Sleep -Milliseconds 500 }

Shot "02-reading"
# Inline edit: enter Edit mode, click into a body line to show caret + formatting toolbar
ClickName "Edit" | Out-Null; Start-Sleep 3
ClickXy 980 360    # body paragraph on page 1 (calibrate)
Start-Sleep 2
Shot "03-edit"
ClickName "Convert" | Out-Null; Start-Sleep 3; Shot "04-convert"
ClickName "All tools" | Out-Null; Start-Sleep 3; Shot "05-tools"
ClickName "Sign" | Out-Null; Start-Sleep 3; Shot "06-sign"
Log "DONE"
