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

if (-not (Test-Path ".venv")) {
    python -m venv .venv
}

.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
pip install pyinstaller

pyinstaller --noconfirm --clean --onefile --windowed --name "AnalizadorEmpresasSupersociedades" app\main.py

$desktop = Get-DesktopPath
$targetDir = Join-Path $desktop "AnalizadorEmpresasSupersociedades"
if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir | Out-Null
}

Copy-Item .\dist\AnalizadorEmpresasSupersociedades.exe -Destination $targetDir -Force
Write-Host "Ejecutable generado en: $targetDir\AnalizadorEmpresasSupersociedades.exe"
