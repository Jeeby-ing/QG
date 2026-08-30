@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   QUEST LOG 远程访问（公网隧道）
echo ============================================
echo.
echo   启动后控制台会显示一个 https 公网地址，
echo   手机 / 其它设备浏览器打开即可访问。
echo   按 Ctrl+C 退出（自动关闭隧道与服务）。
echo ============================================
echo.
"C:/Users/MMCGA/AppData/Local/Programs/Python/Python314/python.exe" remote_launch.py
pause
