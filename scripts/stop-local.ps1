$ErrorActionPreference = "SilentlyContinue"

foreach ($port in @(8080, 21210)) {
    netstat -ano | findstr ":$port " | findstr "LISTENING" | ForEach-Object {
        $procId = ($_ -split '\s+')[-1]
        if ($procId -match '^\d+$') {
            Write-Host "Stopping PID $procId (port $port)..."
            Stop-Process -Id $procId -Force
        }
    }
}

Get-Job | Stop-Job
Get-Job | Remove-Job

Write-Host "Done. Ports 8080 and 21210 are free."
