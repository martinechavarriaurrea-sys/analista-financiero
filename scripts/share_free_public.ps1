param(
  [int]$Port = 8787,
  [string]$AuthUser = "Mamuelitalamaslinda",
  [string]$AuthPassword = "Teamoamordemivida"
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
  "$env:USERPROFILE\AppData\Local\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe",
  "$env:USERPROFILE\AppData\Local\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared-windows-amd64.exe"
)

if (-not $cloudflared) {
  Write-Host "Instalando cloudflared (gratis)..." -ForegroundColor Yellow
  winget install --id Cloudflare.cloudflared -e --source winget --silent --accept-package-agreements --accept-source-agreements | Out-Null
  $cloudflared = Find-Exe @(
    "cloudflared",
    "C:\Program Files\cloudflared\cloudflared.exe",
    "$env:USERPROFILE\AppData\Local\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe",
    "$env:USERPROFILE\AppData\Local\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared-windows-amd64.exe"
  )
}

if (-not $cloudflared) { throw "No se pudo instalar/encontrar cloudflared." }

$advisorLog = Join-Path $root "_tmp_share_advisor.out.log"
$advisorErrLog = Join-Path $root "_tmp_share_advisor.err.log"
$tunnelLog = Join-Path $root "_tmp_share_tunnel.out.log"
$tunnelErrLog = Join-Path $root "_tmp_share_tunnel.err.log"
$runtimePath = Join-Path $root "_tmp_share_runtime.json"

if (Test-Path $advisorLog) { Remove-Item $advisorLog -Force }
if (Test-Path $advisorErrLog) { Remove-Item $advisorErrLog -Force }
if (Test-Path $tunnelLog) { Remove-Item $tunnelLog -Force }
if (Test-Path $tunnelErrLog) { Remove-Item $tunnelErrLog -Force }

$env:ADVISOR_HOST = "127.0.0.1"
$env:ADVISOR_PORT = "$Port"
$env:ADVISOR_LLM_PROVIDER = if ($env:ADVISOR_LLM_PROVIDER) { $env:ADVISOR_LLM_PROVIDER } else { "auto" }
$env:ADVISOR_AUTH_USER = if ($env:ADVISOR_AUTH_USER) { $env:ADVISOR_AUTH_USER } else { $AuthUser }
$env:ADVISOR_AUTH_PASSWORD = if ($env:ADVISOR_AUTH_PASSWORD) { $env:ADVISOR_AUTH_PASSWORD } else { $AuthPassword }

$healthHeaders = $null
if ($env:ADVISOR_AUTH_USER -and $env:ADVISOR_AUTH_PASSWORD) {
  $pair = "{0}:{1}" -f $env:ADVISOR_AUTH_USER, $env:ADVISOR_AUTH_PASSWORD
  $token = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($pair))
  $healthHeaders = @{ Authorization = "Basic $token" }
}

Write-Host "Iniciando servidor local en http://127.0.0.1:$Port ..." -ForegroundColor Cyan
$advisor = Start-Process -FilePath $node -ArgumentList "advisor_server.js" -WorkingDirectory $root -PassThru -WindowStyle Hidden -RedirectStandardOutput $advisorLog -RedirectStandardError $advisorErrLog

$ok = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    if ($healthHeaders) {
      $h = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:$Port/health" -Headers $healthHeaders -TimeoutSec 3
    } else {
      $h = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 3
    }
    if ($h.ok) { $ok = $true; break }
  } catch {}
}

if (-not $ok) {
  if ($advisor -and -not $advisor.HasExited) { Stop-Process -Id $advisor.Id -Force }
  throw "No se pudo levantar advisor_server.js. Revisa $advisorLog y $advisorErrLog"
}

Write-Host "Abriendo tunel publico gratis..." -ForegroundColor Cyan
$tunnel = Start-Process -FilePath $cloudflared -ArgumentList "tunnel --url http://127.0.0.1:$Port --no-autoupdate" -WorkingDirectory $root -PassThru -WindowStyle Hidden -RedirectStandardOutput $tunnelLog -RedirectStandardError $tunnelErrLog

$publicUrl = ""
for ($i = 0; $i -lt 140; $i++) {
  Start-Sleep -Milliseconds 500
  $logCandidates = @()
  if (Test-Path $tunnelLog) { $logCandidates += $tunnelLog }
  if (Test-Path $tunnelErrLog) { $logCandidates += $tunnelErrLog }
  if ($logCandidates.Count -gt 0) {
    $m = Select-String -Path $logCandidates -Pattern "https://[a-zA-Z0-9\-]+\.trycloudflare\.com" -AllMatches -ErrorAction SilentlyContinue
    if ($m -and $m.Matches.Count -gt 0) {
      $candidates = @($m.Matches | ForEach-Object { $_.Value }) | Select-Object -Unique
      $picked = $candidates | Where-Object { $_ -ne "https://api.trycloudflare.com" } | Select-Object -Last 1
      if ($picked) {
        $publicUrl = $picked
        break
      }
    }
  }
}

if (-not $publicUrl) {
  if ($tunnel -and -not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -Force }
  if ($advisor -and -not $advisor.HasExited) { Stop-Process -Id $advisor.Id -Force }
  throw "No se pudo obtener URL publica. Revisa $tunnelLog y $tunnelErrLog"
}

$runtime = [ordered]@{
  started_at = (Get-Date).ToUniversalTime().ToString("o")
  advisor_pid = $advisor.Id
  tunnel_pid = $tunnel.Id
  advisor_log = $advisorLog
  advisor_err_log = $advisorErrLog
  tunnel_log = $tunnelLog
  tunnel_err_log = $tunnelErrLog
  public_url = $publicUrl
  health_url = "$publicUrl/health"
  config_url = "$publicUrl/api/advisor/config"
  auth_user = $env:ADVISOR_AUTH_USER
  auth_password = $env:ADVISOR_AUTH_PASSWORD
}
$runtime | ConvertTo-Json -Depth 6 | Set-Content -Path $runtimePath -Encoding UTF8

Write-Host ""
Write-Host "URL PUBLICA (compartir): $publicUrl" -ForegroundColor Green
Write-Host "Backend config: $publicUrl/api/advisor/config"
Write-Host "Health: $publicUrl/health"
Write-Host "Usuario: $($env:ADVISOR_AUTH_USER)"
Write-Host "Clave: $($env:ADVISOR_AUTH_PASSWORD)"
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

