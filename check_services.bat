@echo off
title Smart Banking Kiosk - Health & Status Check
echo ========================================================
echo Checking Status of All 6 Banking Microservices...
echo ========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "& { & '%~dp0check_services.ps1' }"

echo.
echo Press any key to close this window...
pause >nul
