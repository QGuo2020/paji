# tools/push.ps1 — commit + push current folder
# usage: powershell -ExecutionPolicy Bypass -File .\tools\push.ps1 "message"
param([string]$Message = "update")

$ErrorActionPreference = "Stop"
Push-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
try {
    git add -A
    $status = git status --porcelain
    if (-not $status) {
        Write-Host "nothing to commit"
    } else {
        git commit -m $Message | Out-Host
    }
    git push | Out-Host
    Write-Host "pushed. wait 30-60s then reload the page." -ForegroundColor Green
}
finally {
    Pop-Location
}
