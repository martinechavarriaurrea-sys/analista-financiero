$ErrorActionPreference = "SilentlyContinue"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtimePath = Join-Path $root "_tmp_share_stable_runtime.json"

if (Test-Path $runtimePath) {
  try {
    $rt = Get-Content $runtimePath -Raw | ConvertFrom-Json
    if ($rt.advisor_pid) { Stop-Process -Id ([int]$rt.advisor_pid) -Force -ErrorAction SilentlyContinue }
    if ($rt.tunnel_pid) { Stop-Process -Id ([int]$rt.tunnel_pid) -Force -ErrorAction SilentlyContinue }
  } catch {}
  try { Remove-Item $runtimePath -Force } catch {}
}

# Limpieza adicional de procesos relacionados
Get-CimInstance Win32_Process |
  Where-Object { $_.Name -ieq "node.exe" -and ($_.CommandLine -match "localtunnel|lt\.js") } |
  ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {} }

Get-CimInstance Win32_Process |
  Where-Object { $_.Name -ieq "cmd.exe" -and ($_.CommandLine -match "localtunnel|lt --port") } |
  ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {} }

Write-Host "Enlace estable detenido." -ForegroundColor Cyan
