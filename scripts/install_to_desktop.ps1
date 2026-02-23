$ErrorActionPreference = "Stop"

function Get-DesktopPath {
    if ($env:OneDrive -and (Test-Path (Join-Path $env:OneDrive "Desktop"))) {
        return (Join-Path $env:OneDrive "Desktop")
    }

    if ($env:USERPROFILE -and (Test-Path (Join-Path $env:USERPROFILE "Desktop"))) {
        return (Join-Path $env:USERPROFILE "Desktop")
    }

    return (Join-Path $HOME "Desktop")
}

$desktop = Get-DesktopPath
$target = Join-Path $desktop "AnalizadorEmpresasSupersociedades"

if (-not (Test-Path $target)) {
    New-Item -ItemType Directory -Path $target | Out-Null
}

$exclude = @(".venv", "dist", "build", "__pycache__", ".pytest_cache")

Get-ChildItem -Force | Where-Object {
    $exclude -notcontains $_.Name
} | ForEach-Object {
    Copy-Item $_.FullName -Destination $target -Recurse -Force
}

$launcher = @"
@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  py -m venv .venv
  call .venv\Scripts\activate.bat
  python -m pip install --upgrade pip
  pip install -r requirements.txt
) else (
  call .venv\Scripts\activate.bat
)
python -m app.main
"@

Set-Content -Path (Join-Path $target "Iniciar_Analizador.bat") -Value $launcher -Encoding ASCII
Write-Host "Proyecto instalado/copiado en: $target"
Write-Host "Ejecuta: Iniciar_Analizador.bat"
