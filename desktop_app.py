# -*- coding: utf-8 -*-
"""QUEST LOG 桌面端原生窗口（基于 pywebview，免浏览器访问）。

- 后台线程启动 FastAPI 服务（绑定 127.0.0.1:8000）
- 用 Windows 内置 Edge WebView2 渲染原生窗口，打开即应用，无需浏览器
- 关闭窗口即自动停止后台服务

运行：用带 pywebview 的 Python 解释器执行本文件（见「启动桌面.bat」）。
服务本体由系统 Python 3.14 启动（已装 fastapi/uvicorn）。
"""
import os
import sys
import time
import threading
import subprocess
import urllib.request

PORT = 8000
HOST = "127.0.0.1"
HERE = os.path.dirname(os.path.abspath(__file__))

# 服务使用系统 Python 3.14（已安装 fastapi/uvicorn 依赖）
SERVER_PY = r"C:/Users/MMCGA/AppData/Local/Programs/Python/Python314/python.exe"
APP = os.path.join(HERE, "main.py")

proc = None
server_owned = False


def port_open(host, port, timeout=1):
    try:
        urllib.request.urlopen(f"http://{host}:{port}/", timeout=timeout)
        return True
    except Exception:
        return False


def start_server():
    global proc, server_owned
    # 若 8000 已被其它服务占用，直接复用，不重复拉起
    if port_open(HOST, PORT):
        server_owned = False
        return
    server_owned = True
    proc = subprocess.Popen(
        [SERVER_PY, APP],
        cwd=HERE,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    for _ in range(60):
        if port_open(HOST, PORT):
            return
        time.sleep(0.3)
    print("警告：服务启动超时，请确认端口 8000 未被其它进程占用。")


def stop_server():
    if server_owned and proc and proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()


def main():
    t = threading.Thread(target=start_server, daemon=True)
    t.start()
    import webview

    webview.create_window(
        "QUEST LOG",
        f"http://{HOST}:{PORT}",
        width=1280,
        height=800,
        resizable=True,
        text_select=True,
        confirm_close=False,
    )
    webview.start()
    stop_server()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
    finally:
        stop_server()
