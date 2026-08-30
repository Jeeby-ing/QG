"""壁纸软件接入模块 — 检测并控制本机已安装的壁纸软件。

支持：
  - Wallpaper Engine   (wallpaper32.exe -control open -file <项目文件夹>)
  - Lively Wallpaper   (lively_wp.exe -wallpaper <壁纸路径>)

设计目标：用户无需手动准备壁纸文件。本模块自动扫描本机素材库，
列出可用壁纸，并通过其官方命令行接口一键切换系统桌面壁纸。
所有外部调用均使用参数列表（绝不拼接 shell），且只接受本模块自己
扫描出来的路径，避免任意路径执行 / 路径穿越风险。
"""
import os
import json
import glob
import platform
import subprocess

# 壁纸条目缓存：id -> 完整条目（含 apply_path / preview_file），仅服务端使用，不对外暴露
_WP_CACHE: dict = {}


def _parent(path: str, n: int) -> str:
    for _ in range(n):
        path = os.path.dirname(path)
    return path


def _read_json(path: str):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _no_window_flags():
    # CREATE_NO_WINDOW：避免弹出黑框，仅 Windows 有效
    return 0x08000000 if platform.system() == "Windows" else 0


# ---------------- Wallpaper Engine ----------------
def _detect_wallpaper_engine():
    if platform.system() != "Windows":
        return None
    try:
        import winreg
    except Exception:
        return None
    steam_roots = set()
    for hive, sub in [
        (winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam"),
        (winreg.HKEY_LOCAL_MACHINE, r"Software\Valve\Steam"),
        (winreg.HKEY_LOCAL_MACHINE, r"Software\Wow6432Node\Valve\Steam"),
    ]:
        try:
            with winreg.OpenKey(hive, sub) as k:
                val, _ = winreg.QueryValueEx(k, "SteamPath")
                if val:
                    steam_roots.add(val.replace("/", "\\"))
        except Exception:
            pass
    candidates = [os.path.join(r, "steamapps", "common", "wallpaper_engine") for r in steam_roots]
    candidates += [
        r"C:\Program Files (x86)\Steam\steamapps\common\wallpaper_engine",
        r"D:\Steam\steamapps\common\wallpaper_engine",
        r"E:\Steam\steamapps\common\wallpaper_engine",
    ]
    for c in candidates:
        exe = os.path.join(c, "wallpaper32.exe")
        if os.path.isfile(exe):
            return {"install_path": c, "exe": exe}
    return None


def _scan_wallpaper_engine(install_path: str):
    out = []
    steam_root = _parent(install_path, 3)
    roots = [
        os.path.join(install_path, "projects", "myprojects"),
        os.path.join(steam_root, "steamapps", "workshop", "content", "431960"),
    ]
    for root in roots:
        if not os.path.isdir(root):
            continue
        for folder in sorted(os.listdir(root)):
            fp = os.path.join(root, folder)
            if not os.path.isdir(fp):
                continue
            pj = os.path.join(fp, "project.json")
            if not os.path.isfile(pj):
                continue
            data = _read_json(pj) or {}
            title = data.get("title") or folder
            wtype = (data.get("type") or "scene").lower()
            preview = None
            pv = data.get("preview")
            if pv:
                cand = os.path.join(fp, pv)
                if os.path.isfile(cand):
                    preview = cand
            if not preview:
                # 兜底：直接找壁纸目录下的预览图（多数 WE 订阅项自带 preview.jpg）
                for pext in ("jpg", "jpeg", "png", "bmp", "webp", "gif"):
                    hits = glob.glob(os.path.join(fp, "*." + pext))
                    if hits:
                        preview = hits[0]
                        break
            out.append({
                "id": "we:" + fp,
                "name": title,
                "type": wtype,
                "source": "Wallpaper Engine",
                "software": "wallpaper_engine",
                "preview_file": preview,
                "apply_path": fp,
            })
    return out


# ---------------- Lively Wallpaper ----------------
def _detect_lively():
    if platform.system() != "Windows":
        return None
    try:
        import winreg
    except Exception:
        return None
    candidates = set()
    for hive, sub in [
        (winreg.HKEY_LOCAL_MACHINE, r"Software\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Uninstall"),
    ]:
        try:
            with winreg.OpenKey(hive, sub) as k:
                i = 0
                while True:
                    name = winreg.EnumKey(k, i)
                    i += 1
                    try:
                        with winreg.OpenKey(k, name) as sk:
                            disp, _ = winreg.QueryValueEx(sk, "DisplayName")
                            if disp and "Lively Wallpaper" in disp:
                                try:
                                    loc, _ = winreg.QueryValueEx(sk, "InstallLocation")
                                    if loc:
                                        candidates.add(loc.replace("/", "\\"))
                                except Exception:
                                    pass
                    except Exception:
                        continue
        except Exception:
            pass
    candidates.add(r"C:\Program Files\Lively Wallpaper")
    for c in candidates:
        exe = os.path.join(c, "lively_wp.exe")
        if os.path.isfile(exe):
            return {"install_path": c, "exe": exe}
    return None


def _scan_lively():
    out = []
    local = os.environ.get("LOCALAPPDATA", "")
    if not local:
        return out
    lib = os.path.join(local, "Lively Wallpaper", "Library")
    if not os.path.isdir(lib):
        return out
    for folder in sorted(os.listdir(lib)):
        fp = os.path.join(lib, folder)
        if not os.path.isdir(fp):
            continue
        wfolder = os.path.join(fp, "Wallpaper")
        if not os.path.isdir(wfolder):
            continue
        meta = _read_json(os.path.join(wfolder, "wallpaper.json")) or {}
        title = meta.get("Title") or folder
        apply_path = None
        preview = None
        for ext in ("mp4", "webm", "mov", "html", "htm", "url"):
            hits = glob.glob(os.path.join(wfolder, "*." + ext))
            if hits:
                apply_path = hits[0]
                break
        if not apply_path:
            apply_path = wfolder
        for ext in ("jpg", "jpeg", "png", "bmp", "webp", "gif"):
            hits = glob.glob(os.path.join(wfolder, "*." + ext))
            if hits:
                preview = hits[0]
                break
        wtype = "video" if (apply_path or "").lower().endswith((".mp4", ".webm", ".mov")) else "web"
        out.append({
            "id": "lively:" + fp,
            "name": title,
            "type": wtype,
            "source": "Lively Wallpaper",
            "software": "lively",
            "preview_file": preview,
            "apply_path": apply_path,
        })
    return out


# ---------------- 统一入口 ----------------
def detect_wallpaper_software():
    """检测本机壁纸软件，返回可序列化结构并填充内部缓存。"""
    _WP_CACHE.clear()
    result = {"software": []}

    we = _detect_wallpaper_engine()
    if we:
        wps = _scan_wallpaper_engine(we["install_path"])
        for w in wps:
            w["exe"] = we["exe"]
            _WP_CACHE[w["id"]] = w
        result["software"].append({
            "id": "wallpaper_engine", "name": "Wallpaper Engine",
            "installed": True, "count": len(wps),
            "wallpapers": [{"id": w["id"], "name": w["name"], "type": w["type"]} for w in wps],
        })
    else:
        result["software"].append({
            "id": "wallpaper_engine", "name": "Wallpaper Engine",
            "installed": False, "count": 0, "wallpapers": [],
        })

    lively = _detect_lively()
    if lively:
        wps = _scan_lively()
        for w in wps:
            w["exe"] = lively["exe"]
            _WP_CACHE[w["id"]] = w
        result["software"].append({
            "id": "lively", "name": "Lively Wallpaper",
            "installed": True, "count": len(wps),
            "wallpapers": [{"id": w["id"], "name": w["name"], "type": w["type"]} for w in wps],
        })
    else:
        result["software"].append({
            "id": "lively", "name": "Lively Wallpaper",
            "installed": False, "count": 0, "wallpapers": [],
        })

    return result


def get_wallpaper_entry(wp_id: str):
    """按 id 取回服务端缓存的壁纸条目（含 apply_path）。"""
    entry = _WP_CACHE.get(wp_id)
    if entry is None:
        # 缓存可能因进程重启失效，尝试重新探测
        detect_wallpaper_software()
        entry = _WP_CACHE.get(wp_id)
    return entry


def apply_wallpaper(software_id, wp_id):
    """切换系统壁纸到指定条目，返回 {success, message}。"""
    entry = get_wallpaper_entry(wp_id)
    if not entry:
        return {"success": False, "message": "未找到该壁纸，请刷新列表后重试"}
    apply_path = entry.get("apply_path")
    if not apply_path or not os.path.exists(apply_path):
        return {"success": False, "message": "壁纸文件不存在，可能已被移除"}
    software = entry.get("software") or software_id
    exe = entry.get("exe")
    if not exe or not os.path.isfile(exe):
        return {"success": False, "message": "壁纸软件主程序未找到，请确认已安装"}
    try:
        if software == "wallpaper_engine":
            subprocess.Popen(
                [exe, "-control", "open", "-file", apply_path],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                creationflags=_no_window_flags(),
            )
        elif software == "lively":
            subprocess.Popen(
                [exe, "-wallpaper", apply_path],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                creationflags=_no_window_flags(),
            )
        else:
            return {"success": False, "message": "不支持的壁纸软件"}
        return {"success": True, "message": f"已切换壁纸：{entry.get('name', '')}"}
    except Exception as e:
        return {"success": False, "message": f"切换失败：{e}"}
