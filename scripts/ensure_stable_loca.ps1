param(
  [int]$Port = 8787,
  [string]$Subdomain = "mamuelita-finanzas-app",
  [string]$AuthUser = "Mamuelitalamaslinda",
  [string]$AuthPassword = "Teamoamordemivida",
  [string]$TunnelHost = "https://loca.lt"
)

$ErrorActionPreference = "SilentlyContinue"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root

function Test-AuthHealth {
  param(
    [string]$Url,
    [string]$User,
    [string]$Password
  )
  if (-not $Url) { return $false }
  $healthUrl = "$Url/health"
  $pair = "{0}:{1}" -f $User, $Password
  $token = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($pair))
  $headers = @{ Authorization = "Basic $token" }
  $no = 0
  $yes = 0
  try {
    Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 12 | Out-Null
    $no = 200
  } catch {
    if ($_.Exception.Response) { $no = $_.Exception.Response.StatusCode.value__ }
  }
  try {
    $r = Invoke-WebRequest -Uri $healthUrl -Headers $headers -UseBasicParsing -TimeoutSec 12
    $yes = [int]$r.StatusCode
  } catch {
    if ($_.Exception.Response) { $yes = $_.Exception.Response.StatusCode.value__ }
  }
  return ($no -eq 401 -and $yes -eq 200)
}

$runtimePath = Join-Path $root "_tmp_share_stable_runtime.json"
$expectedUrl = "https://$Subdomain.loca.lt"
$healthy = $false

if (Test-Path $runtimePath) {
  try {
    $rt = Get-Content $runtimePath -Raw | ConvertFrom-Json
    $advisorPid = [int]($rt.advisor_pid)
    $tunnelPid = [int]($rt.tunnel_pid)
    $advisorAlive = !!(Get-Process -Id $advisorPid -ErrorAction SilentlyContinue)
    $tunnelAlive = !!(Get-Process -Id $tunnelPid -ErrorAction SilentlyContinue)
    if ($advisorAlive -and $tunnelAlive) {
      $healthy = Test-AuthHealth -Url $expectedUrl -User $AuthUser -Password $AuthPassword
    }
  } catch {}
}

if ($healthy) {
  Write-Host "OK: enlace estable activo." -ForegroundColor Green
  exit 0
}

Write-Host "Reiniciando enlace estable..." -ForegroundColor Yellow
try {
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "stop_share_stable.ps1") | Out-Null
} catch {}

$startArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$($PSScriptRoot)\share_stable_loca.ps1`" -NoBlock -Port $Port -Subdomain `"$Subdomain`" -AuthUser `"$AuthUser`" -AuthPassword `"$AuthPassword`" -TunnelHost `"$TunnelHost`""
Start-Process -FilePath powershell -ArgumentList $startArgs -WorkingDirectory $root -WindowStyle Hidden | Out-Null
Write-Host "Reinicio lanzado." -ForegroundColor Cyan
