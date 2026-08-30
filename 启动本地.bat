@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   QUEST LOG 本地启动（浏览器访问）
echo ============================================
echo.
echo   本机访问: http://localhost:8000
echo.
echo   启动后请保持本窗口开启；按 Ctrl+C 停止服务。
echo ============================================
echo.
start "" "C:/Users/MMCGA/AppData/Local/Programs/Python/Python314/python.exe" main.py
timeout /t 3 >nul
start "" http://localhost:8000
echo 已尝试在默认浏览器打开 http://localhost:8000
echo 若未自动打开，请手动访问上面的地址。
pause
