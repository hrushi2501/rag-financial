# Stop any running Node processes
Write-Host "Stopping existing Node.js processes..." -ForegroundColor Yellow
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# Navigate to backend directory
Set-Location -Path "$PSScriptRoot\backend"

# Start the server
Write-Host "`nStarting Financial RAG Server..." -ForegroundColor Green
Write-Host "Server will be available at: http://localhost:3000" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the server`n" -ForegroundColor Yellow

node server.js
