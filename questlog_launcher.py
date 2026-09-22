# -*- coding: utf-8 -*-
"""QUEST LOG Launcher v6 -- server + cpolar + open in real browser.

No embedded webview (WebView2 blocked 127.0.0.1 / LAN firewall -> ERR_CONNECTION_REFUSED).
Instead we start the FastAPI server and cpolar tunnel, then open the LOCAL url in the
user's default Web BROWSER (Edge/Chrome). A real browser reaching http://127.0.0.1:8000
is NOT subject to WebView2's loopback restriction, and needs no admin / firewall rule.

The remote (cpolar) URL is shown + copyable inside QL's own UI (top-right button),
which polls GET /api/remote-url.
"""
import os
import sys
import time
import re
import json
import webbrowser
import threading
import subprocess
import traceback
import urllib.request

# ---- Config ----
PORT = 8000
HOST = "127.0.0.1"
SERVER_PY = r"C:/Users/MMCGA/AppData/Local/Programs/Python/Python314/python.exe"
CPOLAR_EXE = r"C:/Program Files/cpolar/cpolar.exe"
# ---- Bark (iOS push) -- auto-send the remote URL / arbitrary text to iPhone ----
# Get your token from the Bark app (Settings -> Device Token). Public server by default;
# set BARK_SERVER to your self-hosted base URL to keep data off the public relay.
BARK_TOKEN = "o9cdVkY7WPhEQB74u7GV6c"
BARK_SERVER = "https://api.day.app"
_HERE = os.path.dirname(os.path.abspath(__file__))
APP_PY = os.path.join(_HERE, "main.py")
URL_FILE = os.path.join(_HERE, "REMOTE_URL.txt")

server_proc = None
tunnel_proc = None
server_owned = False


def log(msg):
    print(f"[Launcher] {msg}")


def port_open(host, port, timeout=1):
    try:
        urllib.request.urlopen(f"http://{host}:{port}/", timeout=timeout)
        return True
    except Exception:
        return False


_last_pushed_url = None  # dedup guard


def save_url(url):
    global _last_pushed_url
    try:
        from datetime import datetime
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with open(URL_FILE, "w", encoding="utf-8") as f:
            f.write(f"QUEST LOG Remote URL\n{url}\nUpdated: {ts}\n")
        log(f"URL saved: {url}")
    except Exception as e:
        log(f"Save URL failed: {e}")
    # Push once per unique URL (dedup) + use 'group' so new replaces old on iPhone
    if url != _last_pushed_url:
        _last_pushed_url = url
        push_bark("QUEST LOG 远程地址", url, copy=True, url=url,
                  group="questlog-remote")


def push_bark(title, content, copy=False, url=None, group=None):
    """Send a push notification to iPhone via Bark. Returns True/False.

    Uses only stdlib (urllib) -- no extra dependency needed.
    If `group` is set, newer notifications with the same group replace older ones
    on the iPhone (no history pile-up).
    """
    if not BARK_TOKEN:
        return False
    try:
        from urllib.parse import quote
        endpoint = f"{BARK_SERVER}/{BARK_TOKEN}/"
        if title:
            endpoint += quote(title, safe="") + "/"
        endpoint += quote(content, safe="")
        q = []
        if copy:
            q.append("copy=1")
        if url:
            q.append("url=" + quote(url, safe=""))
        if group:
            q.append("group=" + quote(group, safe=""))
        if q:
            endpoint += "?" + "&".join(q)
        with urllib.request.urlopen(endpoint, timeout=10) as r:
            data = json.loads(r.read().decode("utf-8"))
            ok = data.get("code") == 200
            log(f"Bark push {'OK' if ok else 'failed: ' + str(data)}")
            return ok
    except Exception as e:
        log(f"Bark push error: {e}")
        return False


def kill_cpolar():
    try:
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/F", "/IM", "cpolar.exe"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
        time.sleep(1)
    except Exception:
        pass


def free_port_8000():
    """Kill any process holding port 8000 so we always run OUR server
    (which has the /api/remote-url endpoint)."""
    try:
        if os.name == "nt":
            out = subprocess.run(
                ["netstat", "-ano"], capture_output=True, text=True,
                encoding="utf-8", errors="replace",
            ).stdout
            for line in out.splitlines():
                if ":8000" in line and "LISTENING" in line:
                    pid = line.strip().split()[-1]
                    try:
                        subprocess.run(
                            ["taskkill", "/F", "/PID", pid],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                        )
                        log(f"Freed port 8000 (killed old PID {pid})")
                    except Exception:
                        pass
            time.sleep(2)  # let Windows release the socket (TIME_WAIT)
    except Exception:
        pass


def server_healthy():
    """Check that 127.0.0.1:8000 is OUR server (has /api/health)."""
    try:
        with urllib.request.urlopen(
            f"http://127.0.0.1:{PORT}/api/health", timeout=2
        ) as r:
            data = json.loads(r.read().decode("utf-8"))
            return data.get("app") == "quest-log"
    except Exception:
        return False


def start_server():
    global server_proc, server_owned
    # If a healthy OUR server is already running, reuse it (no kill needed)
    if server_healthy():
        server_owned = False
        log("Existing QUEST LOG server is healthy, reusing it")
        return
    # Pre-flight checks: surface the real reason instead of a silent hang
    if not os.path.exists(SERVER_PY):
        log(f"ERROR: Python 解释器不存在: {SERVER_PY}")
        log("       请确认 SERVER_PY 路径，或改用本机已安装的 Python。")
        return
    if not os.path.exists(APP_PY):
        log(f"ERROR: 找不到 {APP_PY}")
        log("       请确认本启动器位于 Quest-log 项目根目录（与 main.py 同级）。")
        return
    # Otherwise free the port and start our own
    free_port_8000()
    server_owned = True
    log("Starting server...")
    err_log = os.path.join(_HERE, "launcher_error.log")
    # 强制子进程用 UTF-8 控制台：Windows 英文区域默认 cp1252，
    # 服务里任何 print(中文) 都会 UnicodeEncodeError 且在 import 期就把服务带崩
    # （表现为 launcher 卡在 "Starting server..."）。这里给子进程钉死编码。
    child_env = dict(os.environ)
    child_env["PYTHONUTF8"] = "1"
    child_env["PYTHONIOENCODING"] = "utf-8"
    server_proc = subprocess.Popen(
        [SERVER_PY, APP_PY],
        cwd=_HERE,
        env=child_env,
        stdout=subprocess.DEVNULL,
        stderr=open(err_log, "w", encoding="utf-8", errors="replace"),
    )
    for _ in range(100):  # up to 30s
        if server_healthy():
            log(f"Server ready -> http://127.0.0.1:{PORT}")
            return
        time.sleep(0.3)
    # Timed out: dump the server's real stderr so the cause is visible
    log("WARNING: 30s 内服务未就绪。服务最后输出如下（详见 launcher_error.log）：")
    try:
        with open(err_log, "r", encoding="utf-8", errors="replace") as f:
            tail = [ln for ln in f.read().splitlines() if ln.strip()][-25:]
        for line in tail:
            log("  " + line)
    except Exception:
        pass


def start_cpolar():
    global tunnel_proc
    if not os.path.exists(CPOLAR_EXE):
        log("cpolar not found, skipping tunnel (local URL still works)")
        return
    kill_cpolar()
    log("Starting cpolar tunnel...")
    tunnel_proc = subprocess.Popen(
        [CPOLAR_EXE, "http", "8000", "--log=stdout"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        stdin=subprocess.DEVNULL,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )

    def reader():
        patterns = [
            r"Tunnel established at (https?://\S+)",
            r'"Url":"(https?://[^"]+)"',
            r"(https?://[a-z0-9\-]+\.cpolar\.(top|cn|io|com))",
        ]
        for line in iter(tunnel_proc.stdout.readline, ""):
            if not line:
                break
            for pat in patterns:
                m = re.search(pat, line)
                if m:
                    url = m.group(1).strip().strip('"').rstrip("\\")
                    if url.startswith("http") and "cpolar" in url:
                        save_url(url)
                    break

    threading.Thread(target=reader, daemon=True).start()


def cleanup():
    global tunnel_proc, server_proc
    for name, proc, owned in [
        ("cpolar", tunnel_proc, True),
        ("server", server_proc, server_owned),
    ]:
        if proc is not None and proc.poll() is None:
            if owned or name == "cpolar":
                try:
                    proc.terminate()
                    proc.wait(timeout=5)
                except Exception:
                    try:
                        proc.kill()
                    except Exception:
                        pass


def main():
    # 0. Clear any stale remote URL so the in-app button shows "connecting..." fresh
    try:
        if os.path.exists(URL_FILE):
            os.remove(URL_FILE)
    except Exception:
        pass

    # 1. Start server SYNCHRONOUSLY -- must be ready before browser opens
    log("Starting server...")
    start_server()

    # 2. Start cpolar in background (URL appears when ready)
    threading.Thread(target=start_cpolar, daemon=True).start()

    # 3. Open the LOCAL url in the real default browser (no loopback/firewall issue)
    local_url = f"http://{HOST}:{PORT}"
    print("\n" + "=" * 48)
    print("  QUEST LOG Launcher v6  (web version)")
    print("=" * 48)
    print(f"  Local :  {local_url}")
    print(f"  Remote:  open QL -> top-right button (copies cpolar URL)")
    print(f"  URL file: {URL_FILE}")
    print("=" * 48 + "\n")
    log(f"Opening browser -> {local_url}")
    try:
        webbrowser.open(local_url, new=2)
    except Exception as e:
        log(f"Could not auto-open browser: {e}  (open {local_url} manually)")

    # 4. Keep running so server + tunnel stay alive. Ctrl+C to stop.
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[*] Stopping...")


if __name__ == "__main__":
    # `--push "任意文本"` : send arbitrary text to iPhone via Bark, then exit
    # (no server / tunnel started). Useful for one-off "send this to my phone".
    if len(sys.argv) > 1 and sys.argv[1] in ("--push", "-p"):
        text = " ".join(sys.argv[2:]).strip()
        if text:
            ok = push_bark("发送文本", text, copy=True)
            print("Bark push:", "OK" if ok else "FAILED")
        else:
            print("用法: python questlog_launcher.py --push \"要发给手机的文字\"")
        sys.exit(0)
    try:
        main()
    except KeyboardInterrupt:
        pass
    finally:
        cleanup()
