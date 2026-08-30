# QUEST LOG 启动与远程访问指南

## 一键启动（三选一，双击 .bat 即可）

| 脚本 | 用途 | 说明 |
|------|------|------|
| `启动本地.bat` | 本机用浏览器访问 | 启动服务并自动打开 http://localhost:8000 |
| `启动桌面.bat` | 桌面原生窗口（免浏览器） | 用 Windows 内置 Edge WebView2 开原生窗口；关闭窗口即退出 |
| `启动远程.bat` | 公网远程访问 | 启动服务 + Cloudflare 隧道，控制台给出 https 公网地址，手机/其它设备可访问 |

> 端口固定 `8000`。若被占用，先关掉占用进程再启动。

## 远程访问说明

- 用的是 **Cloudflare 快速隧道**（免费、无需账号）：每次启动会给一个 `https://xxxx.trycloudflare.com` 地址，**地址每次会变**，但连接稳定、不限速。
- 想固定地址（可选）：注册免费 Cloudflare 账号 → 命令行跑一次 `cloudflared login` → `cloudflared tunnel create questlog` → `cloudflared tunnel run questlog`。之后把 `启动远程.bat` 里的 `remote_launch.py` 改成直接 `cloudflared tunnel run questlog` 即可。
- 隧道只在运行 `启动远程.bat` 时存在，关掉即断，安全。

## 桌面原生窗口（免浏览器）

- 基于 `pywebview` + Windows Edge WebView2（Win10/11 自带，无需额外安装）。
- `desktop_app.py` 会后台拉起 FastAPI 服务，再用原生窗口加载界面。
- 所有素材（字体、图标 FontAwesome）均为本地内置，无需联网也能渲染（仅远程隧道需联网）。

## 环境要求

- 服务依赖：系统 Python 3.14（已装 `fastapi` / `uvicorn`）。
- 桌面窗口依赖：`pywebview`（已装入隔离 venv，由 `启动桌面.bat` 调用）。
- Windows 10 / 11（WebView2 运行时内置）。
