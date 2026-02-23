$ErrorActionPreference = "SilentlyContinue"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtime = Join-Path $root "_tmp_share_runtime.json"

if (!(Test-Path $runtime)) {
  Write-Host "No hay runtime activo ($runtime)." -ForegroundColor Yellow
  exit 0
}

$data = Get-Content $runtime -Raw | ConvertFrom-Json
$ids = @()
if ($data.advisor_pid) { $ids += [int]$data.advisor_pid }
if ($data.tunnel_pid) { $ids += [int]$data.tunnel_pid }

foreach ($id in $ids) {
  try {
    Stop-Process -Id $id -Force
    Write-Host "Proceso detenido: $id" -ForegroundColor Green
  } catch {}
}

try { Remove-Item $runtime -Force } catch {}
Write-Host "Publicacion gratuita detenida." -ForegroundColor Cyan
