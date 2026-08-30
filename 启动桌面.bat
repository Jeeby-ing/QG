@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   QUEST LOG 桌面端原生窗口（免浏览器）
echo ============================================
echo.
echo   正在打开原生窗口... 关闭窗口即退出。
echo   首次运行需联网下载/渲染，稍候几秒。
echo ============================================
echo.
"C:/Users/MMCGA/.workbuddy/binaries/python/envs/default/Scripts/python.exe" desktop_app.py
pause
