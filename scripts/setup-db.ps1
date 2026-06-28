param(
    [Parameter(Mandatory = $true)]
    [string]$Password,

    [string]$Database = "quant_research",
    [string]$User = "postgres",
    [string]$Host = "localhost",
    [int]$Port = 5432
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"

if (-not (Test-Path $psql)) {
    Write-Error "psql not found at $psql. Install PostgreSQL or update the path in this script."
}

$env:PGPASSWORD = $Password

Write-Host "Creating database '$Database' if it does not exist..."
$exists = & $psql -U $User -h $Host -p $Port -tAc "SELECT 1 FROM pg_database WHERE datname = '$Database'"
if ($exists -ne "1") {
    & $psql -U $User -h $Host -p $Port -c "CREATE DATABASE $Database"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Host "Database created."
} else {
    Write-Host "Database already exists."
}

$encodedPassword = [uri]::EscapeDataString($Password)
$databaseUrl = "postgresql://${User}:${encodedPassword}@${Host}:${Port}/${Database}"
$envPath = Join-Path $root ".env"

@"
DATABASE_URL=$databaseUrl
PORT=8080
NODE_ENV=development
WEB_PORT=21210
BASE_PATH=/
API_PROXY_TARGET=http://127.0.0.1:8080
"@ | Set-Content -Path $envPath -Encoding utf8

Write-Host ".env written. Run: pnpm run dev"
