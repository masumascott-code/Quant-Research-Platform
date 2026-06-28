$ErrorActionPreference = "Stop"
param(
    [Parameter(Mandatory=$true)]
    [string]$BackupPath
)

if (-not $env:DATABASE_URL) {
    Write-Error "DATABASE_URL is required for restore."
}

if (-not (Test-Path $BackupPath)) {
    Write-Error "Backup file not found: $BackupPath"
}

Write-Host "Restoring database from $BackupPath"
pg_restore --clean --if-exists --no-owner --no-privileges --dbname "$env:DATABASE_URL" "$BackupPath"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Restore complete."
