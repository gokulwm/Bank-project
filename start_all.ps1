# PowerShell script to start all 6 Kiosk services in separate windows
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "Starting Smart Banking Kiosk - All 6 Integrated Services" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan

$root = $PSScriptRoot

Write-Host "`n[1/6] Starting Backend Core Service (Port 8000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\Backend\module4_backend'; python -m uvicorn app.main:app --reload --port 8000"

Write-Host "[2/6] Starting Face Authentication Service (Port 8002)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\Face-Authentication'; python -m uvicorn app.main:app --reload --port 8002"

Write-Host "[3/6] Starting Vernacular Voice AI (Port 8200)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\voice_module'; python -m uvicorn app.main:app --reload --port 8200"

Write-Host "[4/6] Starting Security QR Service (Port 8105)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\security-qr-service'; python app.py"

Write-Host "[5/6] Starting Customer Kiosk Frontend (Port 5173)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; npm run dev"

Write-Host "[6/6] Starting Staff / Teller Portal (Port 5174)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\Staff_Portal'; npm run dev"

Write-Host "`n========================================================" -ForegroundColor Green
Write-Host "All 6 services launched in separate windows!" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green

Write-Host "`nMANUAL TESTING WORKFLOW:" -ForegroundColor Cyan
Write-Host " 1. Face Enrollment Tool:      http://localhost:8002/face-auth/enroll" -ForegroundColor White
Write-Host "    (Enroll your face with an account first)" -ForegroundColor Gray
Write-Host " 2. Customer Kiosk Portal:     http://localhost:5173" -ForegroundColor White
Write-Host "    (Authenticate face, speak/enter deposit/withdrawal)" -ForegroundColor Gray
Write-Host " 3. Staff / Teller Portal:     http://localhost:5174" -ForegroundColor White
Write-Host "    (Real-time queue monitor and QR token verifier)" -ForegroundColor Gray
Write-Host " 4. Face Verification Direct:  http://localhost:8002/face-auth/verify" -ForegroundColor White
Write-Host "========================================================" -ForegroundColor Cyan
