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

if ($env:DATABASE_URL -match "YOUR_PASSWORD") {
    Write-Error "Update DATABASE_URL in .env with your PostgreSQL password."
}

$env:PORT = if ($env:PORT) { $env:PORT } else { "8080" }
$env:NODE_ENV = "development"
$webPort = if ($env:WEB_PORT) { $env:WEB_PORT } else { "21210" }
$env:BASE_PATH = if ($env:BASE_PATH) { $env:BASE_PATH } else { "/" }
$env:API_PROXY_TARGET = if ($env:API_PROXY_TARGET) { $env:API_PROXY_TARGET } else { "http://127.0.0.1:$($env:PORT)" }

Write-Host "Pushing database schema..."
pnpm --filter @workspace/db run push
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Building API server..."
pnpm --filter @workspace/api-server run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Starting API server on port $($env:PORT)..."
$apiJob = Start-Job -ScriptBlock {
    param($root, $port, $databaseUrl, $nodeEnv)
    Set-Location $root
    $env:PORT = $port
    $env:DATABASE_URL = $databaseUrl
    $env:NODE_ENV = $nodeEnv
    node --enable-source-maps "$root\artifacts\api-server\dist\index.mjs"
} -ArgumentList $root, $env:PORT, $env:DATABASE_URL, $env:NODE_ENV

Start-Sleep -Seconds 2
if ($apiJob.State -eq "Failed") {
    Receive-Job $apiJob
    exit 1
}

Write-Host "Starting frontend on http://localhost:$webPort ..."
$env:PORT = $webPort
pnpm --filter @workspace/trading-platform run dev
