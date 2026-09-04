@echo off
echo ========================================================
echo Starting Smart Banking Kiosk - All 6 Integrated Services
echo ========================================================

echo Starting 1. Backend Service (Port 8000)...
start "1 - Backend FSM (Port 8000)" cmd /k "cd /d ""%~dp0Backend\module4_backend"" && uvicorn app.main:app --reload --port 8000"

echo Starting 2. Face Authentication Service (Port 8002)...
start "2 - Face Auth (Port 8002)" cmd /k "cd /d ""%~dp0Face-Authentication"" && uvicorn app.main:app --reload --port 8002"

echo Starting 3. Vernacular Voice AI (Port 8200)...
start "3 - Voice AI (Port 8200)" cmd /k "cd /d ""%~dp0voice_module"" && uvicorn app.main:app --reload --port 8200"

echo Starting 4. Security QR Service (Port 8105)...
start "4 - Security QR Service (Port 8105)" cmd /k "cd /d ""%~dp0security-qr-service"" && python app.py"

echo Starting 5. Customer Kiosk Frontend (Port 5173)...
start "5 - Customer Kiosk (Port 5173)" cmd /k "cd /d ""%~dp0frontend"" && npm run dev"

echo Starting 6. Staff / Teller Portal (Port 5174)...
start "6 - Staff Portal (Port 5174)" cmd /k "cd /d ""%~dp0Staff_Portal"" && npm run dev"

echo ========================================================
echo All 6 services launched in separate windows!
echo - Kiosk UI: http://localhost:5173
echo - Staff Portal UI: http://localhost:5174
echo ========================================================
