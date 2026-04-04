# build.ps1 - Kids Game Hub
# Usage:
#   .\build.ps1               -> build + start
#   .\build.ps1 -Down         -> stop and remove containers
#   .\build.ps1 -Down -Build  -> stop, rebuild, and start
#   .\build.ps1 -Logs         -> tail logs after starting

param(
    [switch]$Down,
    [switch]$Build,
    [switch]$Logs
)

$ErrorActionPreference = "Stop"

# Read ports from .env for display (fallback to defaults)
$frontendPort = "3000"
$backendPort  = "8000"
if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        if ($_ -match "^FRONTEND_PORT=(.+)") { $frontendPort = $matches[1] }
        if ($_ -match "^BACKEND_PORT=(.+)")  { $backendPort  = $matches[1] }
    }
}

if ($Down -and -not $Build) {
    Write-Host "Stopping containers..." -ForegroundColor Yellow
    docker compose down
    Write-Host "Done." -ForegroundColor Green
    exit 0
}

if ($Down -and $Build) {
    Write-Host "Stopping containers..." -ForegroundColor Yellow
    docker compose down
}

Write-Host "Building Docker images..." -ForegroundColor Cyan
docker compose build --progress=plain

Write-Host "Starting services..." -ForegroundColor Cyan
docker compose up -d

Write-Host ""
Write-Host "Running!" -ForegroundColor Green
Write-Host "  Frontend -> http://localhost:$frontendPort" -ForegroundColor White
Write-Host "  Backend  -> http://localhost:$backendPort" -ForegroundColor White
Write-Host "  Health   -> http://localhost:$backendPort/health" -ForegroundColor White
Write-Host ""

if ($Logs) {
    Write-Host "Tailing logs (Ctrl+C to stop)..." -ForegroundColor Yellow
    docker compose logs -f
}