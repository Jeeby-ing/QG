# -*- coding: utf-8 -*-
"""QUEST LOG 远程访问启动器（Cloudflare 隧道）。

- 后台启动 FastAPI 服务（0.0.0.0:8000）
- 通过 cloudflared 快速隧道把本机 8000 端口暴露为公网 HTTPS 地址
- 在控制台打印公网地址，手机/其它设备浏览器打开即可访问
- 按 Ctrl+C 退出，自动关闭隧道与后台服务

说明：快速隧道每次启动地址会变（免费、无需账号）。若想要固定地址，
可用免费 Cloudflare 账号建命名隧道，把下方 cloudflared 命令换成：
    cloudflared tunnel run <你的隧道名>
并提前 `cloudflared login` 一次。
"""
import os
import sys
import time
import re
import threading
import subprocess
import urllib.request

PORT = 8000
HERE = os.path.dirname(os.path.abspath(__file__))
SERVER_PY = r"C:/Users/MMCGA/AppData/Local/Programs/Python/Python314/python.exe"
CLOUDFLARED = os.path.join(HERE, "cloudflared.exe")

server = None
tunnel = None
server_owned = False


def port_open(port, timeout=1):
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=timeout)
        return True
    except Exception:
        return False


def start_server():
    global server, server_owned
    # 若 8000 已被占用，复用现有服务，不重复拉起
    if port_open(PORT):
        server_owned = False
        return
    server_owned = True
    server = subprocess.Popen(
        [SERVER_PY, "main.py"],
        cwd=HERE,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    for _ in range(60):
        if port_open(PORT):
            return
        time.sleep(0.3)


def cleanup():
    if server_owned and server and server.poll() is None:
        try:
            server.terminate()
        except Exception:
            pass
    if tunnel and tunnel.poll() is None:
        try:
            tunnel.terminate()
        except Exception:
            pass


def main():
    threading.Thread(target=start_server, daemon=True).start()
    time.sleep(1)
    print("=" * 54)
    print("   QUEST LOG 远程访问 (Cloudflare 快速隧道)")
    print("=" * 54)
    if not os.path.exists(CLOUDFLARED):
        print("未找到 cloudflared.exe，请确认已下载到本目录，或检查网络后重试。")
        return
    tunnel = subprocess.Popen(
        [CLOUDFLARED, "tunnel", "--url", f"http://localhost:{PORT}"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    url = None
    try:
        for line in tunnel.stdout:
            sys.stdout.write(line)
            if not url:
                m = re.search(r"(https://[a-z0-9\-]+\.trycloudflare\.com)", line)
                if m:
                    url = m.group(1)
                    print("\n>>> 公网地址:", url)
                    print(">>> 在手机 / 其它设备的浏览器打开上面的地址即可访问。")
                    print(">>> 按 Ctrl+C 退出（会关闭隧道与后台服务）。\n")
    finally:
        cleanup()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n正在关闭隧道与服务...")
    finally:
        cleanup()
