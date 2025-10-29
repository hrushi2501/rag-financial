# Start Python (Flask) backend
Set-Location -Path "$PSScriptRoot\python_backend"

Write-Host "Starting Financial RAG Flask server..." -ForegroundColor Green
Write-Host "Server will be available at: http://localhost:5000" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the server`n" -ForegroundColor Yellow

python app.py
