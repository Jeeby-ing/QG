@echo off
cd /d "%~dp0"
echo.
echo   ============================================
echo   =   QUEST LOG Launcher                   =
echo   =   Server + Tunnel + Desktop Window     =
echo   ============================================
echo.
echo   Starting...
echo   - FastAPI server (localhost:8000)
echo   - cpolar tunnel (random URL each time)
echo   - Desktop window (with QR code)
echo.
echo   Close window to stop all services
echo   Remote URL saved to REMOTE_URL.txt
echo.
"C:/Users/MMCGA/.workbuddy/binaries/python/envs/default/Scripts/python.exe" questlog_launcher.py
if errorlevel 1 (
  echo.
  echo [ERROR] Launcher crashed. See launcher_error.log in project folder.
  pause
)
