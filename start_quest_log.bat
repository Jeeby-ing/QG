@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   QUEST LOG 一键启动
echo ============================================
echo.
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4"') do set "IP=%%a"
set "IP=%IP: =%"
echo   本机访问: http://localhost:8000
if not "%IP%"=="" echo   手机/局域网访问: http://%IP%:8000
echo.
echo   启动后请保持本窗口开启。
echo   按 Ctrl+C 可停止服务。
echo ============================================
echo.
python main.py
pause
