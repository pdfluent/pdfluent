$page=(Invoke-RestMethod "http://127.0.0.1:9222/json/list" -TimeoutSec 6)|Where-Object{$_.type -eq 'page'}|Select-Object -First 1
$c=New-Object System.Net.WebSockets.ClientWebSocket; $ct=[Threading.CancellationToken]::None
$c.ConnectAsync([Uri]$page.webSocketDebuggerUrl,$ct).Wait(8000)|Out-Null
$expr="JSON.stringify({lang:localStorage.getItem('pdfluent-lang'),body:(document.body.innerText||'').replace(/\s+/g,' ').slice(0,70)})"
$p=@{id=1;method='Runtime.evaluate';params=@{expression=$expr;returnByValue=$true}}|ConvertTo-Json -Compress
$b=[Text.Encoding]::UTF8.GetBytes($p)
$c.SendAsync((New-Object ArraySegment[byte] -ArgumentList @(,$b)),'Text',$true,$ct).Wait(5000)|Out-Null
$buf=New-Object byte[] 4096; $r=$c.ReceiveAsync((New-Object ArraySegment[byte] -ArgumentList @(,$buf)),$ct); $r.Wait(6000)|Out-Null
Write-Output ("LANGREAD " + [Text.Encoding]::UTF8.GetString($buf,0,$r.Result.Count))
try{$c.Dispose()}catch{}
