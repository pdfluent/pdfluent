$p = Get-Process pdfluent-desktop -EA SilentlyContinue
$p | ForEach-Object { $_.CloseMainWindow() | Out-Null }
foreach($x in $p){ $x.WaitForExit(12000) | Out-Null }
Get-Process pdfluent-desktop,msedgewebview2 -EA SilentlyContinue | Stop-Process -Force -EA SilentlyContinue
