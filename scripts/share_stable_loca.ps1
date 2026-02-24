param(
  [int]$Port = 8787,
  [string]$Subdomain = "mamuelita-finanzas-bot",
  [string]$AuthUser = "Mamuelitalamaslinda",
  [string]$AuthPassword = "Teamoamordemivida",
  [string]$TunnelHost = "https://loca.lt",
  [switch]$NoBlock
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

function Stop-ByPid {
  param([int]$Pid)
  if ($Pid -le 0) { return }
  try { Stop-Process -Id $Pid -Force -ErrorAction SilentlyContinue } catch {}
}

$node = Find-Exe @("node", "C:\Program Files\nodejs\node.exe")
$npx = Find-Exe @("C:\Program Files\nodejs\npx.cmd", "npx.cmd", "npx")
if (-not $node) { throw "Node.js no esta instalado o no esta en PATH." }
if (-not $npx) { throw "npx no esta instalado o no esta en PATH." }

$runtimePath = Join-Path $root "_tmp_share_stable_runtime.json"
if (Test-Path $runtimePath) {
  try {
    $old = Get-Content $runtimePath -Raw | ConvertFrom-Json
    Stop-ByPid ([int]$old.advisor_pid)
    Stop-ByPid ([int]$old.tunnel_pid)
  } catch {}
  try { Remove-Item $runtimePath -Force } catch {}
}

# Limpia procesos previos del mismo subdominio para evitar duplicados.
Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -ieq "node.exe" -and (
      ($_.CommandLine -match "advisor_server\.js") -or
      ($_.CommandLine -match "localtunnel") -or
      ($_.CommandLine -match [Regex]::Escape($Subdomain))
    )
  } |
  ForEach-Object {
    if ($_.CommandLine -match "advisor_server\.js") { return }
    try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
  }

$advisorLog = Join-Path $root "_tmp_stable_advisor.out.log"
$advisorErrLog = Join-Path $root "_tmp_stable_advisor.err.log"
$tunnelLog = Join-Path $root "_tmp_stable_tunnel.out.log"
$tunnelErrLog = Join-Path $root "_tmp_stable_tunnel.err.log"
if (Test-Path $advisorLog) { Remove-Item $advisorLog -Force }
if (Test-Path $advisorErrLog) { Remove-Item $advisorErrLog -Force }
if (Test-Path $tunnelLog) { Remove-Item $tunnelLog -Force }
if (Test-Path $tunnelErrLog) { Remove-Item $tunnelErrLog -Force }

$env:ADVISOR_HOST = "127.0.0.1"
$env:ADVISOR_PORT = "$Port"
$env:ADVISOR_LLM_PROVIDER = if ($env:ADVISOR_LLM_PROVIDER) { $env:ADVISOR_LLM_PROVIDER } else { "auto" }
$env:ADVISOR_AUTH_USER = if ($env:ADVISOR_AUTH_USER) { $env:ADVISOR_AUTH_USER } else { $AuthUser }
$env:ADVISOR_AUTH_PASSWORD = if ($env:ADVISOR_AUTH_PASSWORD) { $env:ADVISOR_AUTH_PASSWORD } else { $AuthPassword }

$pair = "{0}:{1}" -f $env:ADVISOR_AUTH_USER, $env:ADVISOR_AUTH_PASSWORD
$token = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($pair))
$healthHeaders = @{ Authorization = "Basic $token" }

Write-Host "Iniciando servidor local en http://127.0.0.1:$Port ..." -ForegroundColor Cyan
$advisor = Start-Process -FilePath $node -ArgumentList "advisor_server.js" -WorkingDirectory $root -PassThru -WindowStyle Hidden -RedirectStandardOutput $advisorLog -RedirectStandardError $advisorErrLog

$ok = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    $h = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:$Port/health" -Headers $healthHeaders -TimeoutSec 3
    if ($h.ok) { $ok = $true; break }
  } catch {}
}
if (-not $ok) {
  Stop-ByPid $advisor.Id
  throw "No se pudo levantar advisor_server.js. Revisa $advisorLog y $advisorErrLog"
}

Write-Host "Abriendo enlace estable (loca.lt)..." -ForegroundColor Cyan
$tunnelArgs = "--yes localtunnel --port $Port --host $TunnelHost --subdomain $Subdomain"
$tunnel = Start-Process -FilePath $npx -ArgumentList $tunnelArgs -WorkingDirectory $root -PassThru -WindowStyle Hidden -RedirectStandardOutput $tunnelLog -RedirectStandardError $tunnelErrLog

$publicUrl = "https://$Subdomain.loca.lt"
$publicOk = $false
$unauthStatus = 0
$authStatus = 0
for ($i = 0; $i -lt 70; $i++) {
  Start-Sleep -Milliseconds 1000
  try {
    Invoke-WebRequest -Uri "$publicUrl/health" -UseBasicParsing -TimeoutSec 10 | Out-Null
    $unauthStatus = 200
  } catch {
    $unauthStatus = $_.Exception.Response.StatusCode.value__
  }
  try {
    $r = Invoke-WebRequest -Uri "$publicUrl/health" -Headers $healthHeaders -UseBasicParsing -TimeoutSec 10
    $authStatus = [int]$r.StatusCode
  } catch {
    $authStatus = $_.Exception.Response.StatusCode.value__
  }
  if ($unauthStatus -eq 401 -and $authStatus -eq 200) {
    $publicOk = $true
    break
  }
}

if (-not $publicOk) {
  Stop-ByPid $tunnel.Id
  Stop-ByPid $advisor.Id
  throw "No se pudo validar URL estable en $publicUrl. Revisa $tunnelLog y $tunnelErrLog"
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
  unauthorized_status = $unauthStatus
  authorized_status = $authStatus
}
$runtime | ConvertTo-Json -Depth 6 | Set-Content -Path $runtimePath -Encoding UTF8

Write-Host ""
Write-Host "URL ESTABLE: $publicUrl" -ForegroundColor Green
Write-Host "Backend config: $publicUrl/api/advisor/config"
Write-Host "Health: $publicUrl/health"
Write-Host "Usuario: $($env:ADVISOR_AUTH_USER)"
Write-Host "Clave: $($env:ADVISOR_AUTH_PASSWORD)"
Write-Host ""
Write-Host "Mantener esta ventana abierta para que siga funcionando." -ForegroundColor Yellow
Write-Host "Para detener: Ctrl + C"
Write-Host ""

if ($NoBlock) {
  return
}

try {
  while ($true) { Start-Sleep -Seconds 1 }
} finally {
  Stop-ByPid $tunnel.Id
  Stop-ByPid $advisor.Id
}
