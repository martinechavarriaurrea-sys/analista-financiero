$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$advisorUrl = "http://127.0.0.1:8787/health"
$serverFile = Join-Path $root "advisor_server.js"
$appFile = "C:\Users\Martin Echavarria\OneDrive - Universidad EAFIT\Escritorio\analisis fin\index.html"

function Test-AdvisorAlive {
  try {
    $r = Invoke-WebRequest -Uri $advisorUrl -Method GET -TimeoutSec 2
    return $r.StatusCode -eq 200
  } catch {
    return $false
  }
}

if (-not (Test-Path $serverFile)) {
  throw "No se encontro advisor_server.js en $root"
}

if (-not (Test-AdvisorAlive)) {
  Start-Process -FilePath "node" -ArgumentList "`"$serverFile`"" -WindowStyle Hidden
  Start-Sleep -Seconds 2
}

Start-Process $appFile
Write-Host "Asesor oculto iniciado y app abierta."
