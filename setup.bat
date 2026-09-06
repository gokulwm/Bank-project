@echo off
echo ========================================================
echo Installing All Dependencies for Smart Banking Kiosk
echo ========================================================

echo.
echo [1/6] Installing Backend Python dependencies...
cd /d "%~dp0Backend\module4_backend"
pip install -r requirements.txt

echo.
echo [2/6] Installing Face-Authentication Python dependencies...
cd /d "%~dp0Face-Authentication"
pip install -r requirements.txt

echo.
echo [3/6] Installing Voice AI Python dependencies...
cd /d "%~dp0voice_module"
pip install -r requirements.txt

echo.
echo [4/6] Installing Security QR Python dependencies...
cd /d "%~dp0security-qr-service"
pip install -r requirements.txt

echo.
echo [5/6] Installing Customer Kiosk Frontend (Node.js) dependencies...
cd /d "%~dp0frontend"
call npm install

echo.
echo [6/6] Installing Staff Portal Frontend (Node.js) dependencies...
cd /d "%~dp0Staff_Portal"
call npm install

cd /d "%~dp0"
echo.
echo ========================================================
echo Installation complete!
echo You can now run 'start_all.bat' to launch the project.
echo ========================================================
pause
