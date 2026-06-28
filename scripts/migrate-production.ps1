$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $env:DATABASE_URL) {
    Write-Error "DATABASE_URL is required for production migration."
}

Write-Host "Applying Drizzle schema to production database..."
pnpm --filter @workspace/db run push
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Migration complete."
