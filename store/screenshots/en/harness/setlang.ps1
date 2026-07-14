$ErrorActionPreference='Continue'
function Eval($ws,$expr){
  $c=New-Object System.Net.WebSockets.ClientWebSocket; $ct=[Threading.CancellationToken]::None
  if(-not $c.ConnectAsync([Uri]$ws,$ct).Wait(8000)){ return 'NOCONNECT' }
  $p=@{id=1;method='Runtime.evaluate';params=@{expression=$expr;returnByValue=$true;awaitPromise=$true}}|ConvertTo-Json -Compress
  $b=[Text.Encoding]::UTF8.GetBytes($p)
  $c.SendAsync((New-Object ArraySegment[byte] -ArgumentList @(,$b)),'Text',$true,$ct).Wait(5000)|Out-Null
  $buf=New-Object byte[] 16384; $r=$c.ReceiveAsync((New-Object ArraySegment[byte] -ArgumentList @(,$buf)),$ct); $r.Wait(8000)|Out-Null
  $out=[Text.Encoding]::UTF8.GetString($buf,0,$r.Result.Count); try{$c.Dispose()}catch{}
  return $out
}
$page=(Invoke-RestMethod 'http://127.0.0.1:9222/json/list' -TimeoutSec 6)|Where-Object{$_.type -eq 'page'}|Select-Object -First 1
if(-not $page){ Write-Output 'NOPAGE'; exit }
$ws=$page.webSocketDebuggerUrl
Write-Output ('OPEN ' + (Eval $ws "window.dispatchEvent(new KeyboardEvent('keydown',{key:'?',ctrlKey:true,bubbles:true,cancelable:true})); 'opened'"))
Start-Sleep 4
$setExpr='(function(){var s=document.querySelector(''[data-testid="language-switcher"]'');if(!s)return "NOSEL";var p=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set;p.call(s,"en");s.dispatchEvent(new Event("change",{bubbles:true}));return "SET:"+s.value;})()'
Write-Output ('SETLANG ' + (Eval $ws $setExpr))
Start-Sleep 2
Write-Output ('CLOSE ' + (Eval $ws "window.dispatchEvent(new KeyboardEvent('keydown',{key:'?',ctrlKey:true,bubbles:true,cancelable:true})); 'toggled'"))
Start-Sleep 1
Write-Output ('BODY ' + (Eval $ws "(document.body.innerText||'').replace(/\s+/g,' ').slice(0,140)"))
