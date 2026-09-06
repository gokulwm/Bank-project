Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "Installing All Dependencies for Smart Banking Kiosk" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

$rootDir = $PSScriptRoot

Write-Host "`n[1/6] Installing Backend Python dependencies..." -ForegroundColor Yellow
Set-Location "$rootDir\Backend\module4_backend"
pip install -r requirements.txt

Write-Host "`n[2/6] Installing Face-Authentication Python dependencies..." -ForegroundColor Yellow
Set-Location "$rootDir\Face-Authentication"
pip install -r requirements.txt

Write-Host "`n[3/6] Installing Voice AI Python dependencies..." -ForegroundColor Yellow
Set-Location "$rootDir\voice_module"
pip install -r requirements.txt

Write-Host "`n[4/6] Installing Security QR Python dependencies..." -ForegroundColor Yellow
Set-Location "$rootDir\security-qr-service"
pip install -r requirements.txt

Write-Host "`n[5/6] Installing Customer Kiosk Frontend dependencies..." -ForegroundColor Yellow
Set-Location "$rootDir\frontend"
npm install

Write-Host "`n[6/6] Installing Staff Portal Frontend dependencies..." -ForegroundColor Yellow
Set-Location "$rootDir\Staff_Portal"
npm install

Set-Location $rootDir
Write-Host "`n========================================================" -ForegroundColor Green
Write-Host "Installation complete! Run .\start_all.ps1 or start_all.bat to launch." -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
