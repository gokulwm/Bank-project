# PowerShell script to start all 6 Kiosk services in separate windows
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "Starting Smart Banking Kiosk - All 6 Integrated Services" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan

$root = $PSScriptRoot

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\Backend\module4_backend'; uvicorn app.main:app --reload --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\Face-Authentication'; uvicorn app.main:app --reload --port 8002"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\voice_module'; uvicorn app.main:app --reload --port 8200"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\security-qr-service'; python app.py"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\Staff_Portal'; npm run dev"

Write-Host "All 6 services started!" -ForegroundColor Green
Write-Host "Kiosk UI: http://localhost:5173" -ForegroundColor Yellow
Write-Host "Staff Portal: http://localhost:5174" -ForegroundColor Yellow
