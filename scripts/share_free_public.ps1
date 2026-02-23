param(
  [int]$Port = 8787
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root

function Find-Exe {
  param([string[]]$Candidates)
  foreach ($c in $Candidates) {
    $cmd = Get-Command $c -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    if (Test-Path $c) { return $c }
  }
  return $null
}

$node = Find-Exe @("node", "C:\Program Files\nodejs\node.exe")
if (-not $node) { throw "Node.js no esta instalado o no esta en PATH." }

$cloudflared = Find-Exe @(
  "cloudflared",
  "C:\Program Files\cloudflared\cloudflared.exe",
  "$env:USERPROFILE\AppData\Local\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared-windows-amd64.exe"
)

if (-not $cloudflared) {
  Write-Host "Instalando cloudflared (gratis)..." -ForegroundColor Yellow
  winget install --id Cloudflare.cloudflared -e --source winget --silent --accept-package-agreements --accept-source-agreements | Out-Null
  $cloudflared = Find-Exe @(
    "cloudflared",
    "C:\Program Files\cloudflared\cloudflared.exe",
    "$env:USERPROFILE\AppData\Local\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared-windows-amd64.exe"
  )
}

if (-not $cloudflared) { throw "No se pudo instalar/encontrar cloudflared." }

$advisorLog = Join-Path $root "_tmp_share_advisor.log"
$tunnelLog = Join-Path $root "_tmp_share_tunnel.log"
if (Test-Path $advisorLog) { Remove-Item $advisorLog -Force }
if (Test-Path $tunnelLog) { Remove-Item $tunnelLog -Force }

$env:ADVISOR_HOST = "127.0.0.1"
$env:ADVISOR_PORT = "$Port"
$env:ADVISOR_LLM_PROVIDER = if ($env:ADVISOR_LLM_PROVIDER) { $env:ADVISOR_LLM_PROVIDER } else { "auto" }

Write-Host "Iniciando servidor local en http://127.0.0.1:$Port ..." -ForegroundColor Cyan
$advisor = Start-Process -FilePath $node -ArgumentList "advisor_server.js" -WorkingDirectory $root -PassThru -WindowStyle Hidden -RedirectStandardOutput $advisorLog -RedirectStandardError $advisorLog

$ok = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    $h = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 3
    if ($h.ok) { $ok = $true; break }
  } catch {}
}
if (-not $ok) {
  if ($advisor -and -not $advisor.HasExited) { Stop-Process -Id $advisor.Id -Force }
  throw "No se pudo levantar advisor_server.js. Revisa $advisorLog"
}

Write-Host "Abriendo tunel publico gratis..." -ForegroundColor Cyan
$tunnel = Start-Process -FilePath $cloudflared -ArgumentList "tunnel --url http://127.0.0.1:$Port --no-autoupdate" -WorkingDirectory $root -PassThru -WindowStyle Hidden -RedirectStandardOutput $tunnelLog -RedirectStandardError $tunnelLog

$publicUrl = ""
for ($i = 0; $i -lt 120; $i++) {
  Start-Sleep -Milliseconds 500
  if (Test-Path $tunnelLog) {
    $m = Select-String -Path $tunnelLog -Pattern "https://[a-zA-Z0-9\-]+\.trycloudflare\.com" -AllMatches -ErrorAction SilentlyContinue
    if ($m) {
      $publicUrl = $m.Matches[-1].Value
      break
    }
  }
}

if (-not $publicUrl) {
  if ($tunnel -and -not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -Force }
  if ($advisor -and -not $advisor.HasExited) { Stop-Process -Id $advisor.Id -Force }
  throw "No se pudo obtener URL publica. Revisa $tunnelLog"
}

Write-Host ""
Write-Host "URL PUBLICA (compartir): $publicUrl" -ForegroundColor Green
Write-Host "Backend config: $publicUrl/api/advisor/config"
Write-Host "Health: $publicUrl/health"
Write-Host ""
Write-Host "Mantener esta ventana abierta para que siga funcionando." -ForegroundColor Yellow
Write-Host "Para detener: Ctrl + C"
Write-Host ""

try {
  while ($true) { Start-Sleep -Seconds 1 }
} finally {
  if ($tunnel -and -not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -Force }
  if ($advisor -and -not $advisor.HasExited) { Stop-Process -Id $advisor.Id -Force }
}
