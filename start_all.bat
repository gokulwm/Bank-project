@echo off
title Smart Banking Kiosk Launcher
echo ========================================================
echo Starting Smart Banking Kiosk - All 6 Integrated Services
echo ========================================================
echo.

echo [1/6] Starting Backend Core Service (Port 8000)...
start "1 - Backend FSM (Port 8000)" cmd /k "cd /d ""%~dp0Backend\module4_backend"" && python -m uvicorn app.main:app --reload --port 8000"

echo [2/6] Starting Face Authentication Service (Port 8002)...
start "2 - Face Auth (Port 8002)" cmd /k "cd /d ""%~dp0Face-Authentication"" && python -m uvicorn app.main:app --reload --port 8002"

echo [3/6] Starting Vernacular Voice AI (Port 8200)...
start "3 - Voice AI (Port 8200)" cmd /k "cd /d ""%~dp0voice_module"" && python -m uvicorn app.main:app --reload --port 8200"

echo [4/6] Starting Security QR Service (Port 8105)...
start "4 - Security QR Service (Port 8105)" cmd /k "cd /d ""%~dp0security-qr-service"" && python app.py"

echo [5/6] Starting Customer Kiosk Frontend (Port 5173)...
start "5 - Customer Kiosk (Port 5173)" cmd /k "cd /d ""%~dp0frontend"" && npm run dev"

echo [6/6] Starting Staff / Teller Portal (Port 5174)...
start "6 - Staff Portal (Port 5174)" cmd /k "cd /d ""%~dp0Staff_Portal"" && npm run dev"

echo.
echo ========================================================
echo All 6 services launched in separate windows!
echo ========================================================
echo.
echo MANUAL TESTING WORKFLOW:
echo  1. Face Enrollment Tool:
echo     http://localhost:8002/face-auth/enroll
echo     (Enroll your face with an account first)
echo.
echo  2. Customer Kiosk Portal:
echo     http://localhost:5173
echo     (Authenticate face, speak/enter deposit/withdrawal)
echo.
echo  3. Staff / Teller Portal:
echo     http://localhost:5174
echo     (Real-time queue monitor and QR token verifier)
echo.
echo  4. Face Verification Direct Tool:
echo     http://localhost:8002/face-auth/verify
echo ========================================================
echo Press any key to exit this launcher window (services stay running)...
pause >nul
