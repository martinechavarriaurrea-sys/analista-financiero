param(
    [switch]$SkipDeps
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path ".venv")) {
    python -m venv .venv
}

.\.venv\Scripts\Activate.ps1

if (-not $SkipDeps) {
    python -m pip install --upgrade pip
    pip install -r requirements.txt
}

python -m app.main
