# commit.ps1 - quick git add / commit / push
# Usage:
#   .\commit.ps1 "your commit message"

param(
    [Parameter(Mandatory=$true, Position=0)]
    [string]$Message
)

$ErrorActionPreference = "Stop"

Write-Host "Staging all changes..." -ForegroundColor Cyan
git add .

Write-Host "Committing: $Message" -ForegroundColor Cyan
git commit -m $Message

Write-Host "Pushing to origin..." -ForegroundColor Cyan
git push

Write-Host "Done." -ForegroundColor Green