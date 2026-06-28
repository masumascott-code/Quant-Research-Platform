$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$backupDir = Join-Path $root "backups"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

if (-not $env:DATABASE_URL) {
    Write-Error "DATABASE_URL is required for backup."
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$target = Join-Path $backupDir "quantedge-$timestamp.dump"

Write-Host "Creating database backup at $target"
pg_dump --format=custom --no-owner --no-privileges --file "$target" "$env:DATABASE_URL"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Backup complete: $target"
