$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Import-DotEnv {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        Write-Error ".env file not found. Copy .env.example to .env and set DATABASE_URL."
    }
    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if ($line -eq "" -or $line.StartsWith("#")) { return }
        $eq = $line.IndexOf("=")
        if ($eq -lt 1) { return }
        $name = $line.Substring(0, $eq).Trim()
        $value = $line.Substring($eq + 1).Trim()
        if (
            ($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))
        ) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        Set-Item -Path "env:$name" -Value $value
    }
}

Import-DotEnv (Join-Path $root ".env")

if (-not $env:DATABASE_URL) {
    Write-Error "DATABASE_URL is not set in .env"
}

$env:PORT = if ($env:PORT) { $env:PORT } else { "8080" }
$env:NODE_ENV = if ($env:NODE_ENV) { $env:NODE_ENV } else { "development" }

Write-Host "Building API server..."
pnpm --filter @workspace/api-server run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Starting API server on port $($env:PORT)..."
node --enable-source-maps "$root\artifacts\api-server\dist\index.mjs"
