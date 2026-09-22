# -*- coding: utf-8 -*-
"""构建 Quest-log 的原版蚀刻章素材库。

数据源：Aceship/Arknight-Images 的 ui/medalicon（明日方舟原版蚀刻章 PNG，733 枚）。
做法：
  1. 从 GitHub contents API 取全量文件名；
  2. 按「语义分组」挑出一批（履历/关卡/基建/阵营/塔/隐藏/肉鸽 + 活动/剧情各取一段），
     组成有序的章图池 —— 顺序即分配顺序，保证同类章连在一起，家族内风格一致；
  3. 逐张下载 -> 归一化到 256x256 透明方形容器（保持比例）-> 存 webp；
  4. 产出 static/img/medal/_manifest.json（有序池 + 尺寸信息），后端据此分配。

用法：python scripts/build_medal_assets.py
"""
import json
import os
import ssl
import sys
import time
import urllib.parse
import urllib.request

from PIL import Image

ssl._create_default_https_context = ssl._create_unverified_context

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "https://api.github.com/repos/Aceship/Arknight-Images/contents/ui/medalicon"
RAW = "https://raw.githubusercontent.com/Aceship/Arknight-Images/main/ui/medalicon/"
CACHE = os.path.join(ROOT, "assets-source", "_medal_src")
DST = os.path.join(ROOT, "static", "img", "medal")

SIDE = 256           # 输出画布边长
TAKE_ACTIVITY = 110
TAKE_STORY = 93

# 语义分组（顺序 = 池顺序 = 分配顺序）
GROUPS = [
    ("medal_growth", None),      # 履历奖章 · 干员培养（46）
    ("medal_player", None),      # 履历奖章 · 博士履历（21）
    ("medal_stage", None),       # 关卡奖章（35）
    ("medal_build", None),       # 基建奖章（14）
    ("medal_camp", None),        # 阵营奖章（17）
    ("medal_tower", None),       # 塔（6）
    ("medal_hidden", None),      # 隐藏（14）
    ("medal_hardtower", None),   # 高难塔（2）
    ("medal_rogue", None),       # 肉鸽（24）
    ("medal_activity", TAKE_ACTIVITY),
    ("medal_story", TAKE_STORY),
]


def fetch_names():
    req = urllib.request.Request(API, headers={"User-Agent": "quest-log-build"})
    items = json.loads(urllib.request.urlopen(req, timeout=60).read().decode("utf-8"))
    return sorted(i["name"] for i in items if i["type"] == "file" and i["name"].endswith(".png"))


def pick_pool(names):
    pool = []
    for pref, limit in GROUPS:
        got = [n for n in names if n.startswith(pref + "_")]
        if limit:
            got = got[:limit]
        pool.extend(got)
    return pool


def download(name, retries=3):
    dest = os.path.join(CACHE, name)
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return dest
    url = RAW + urllib.parse.quote(name)
    for a in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "quest-log-build"})
            data = urllib.request.urlopen(req, timeout=60).read()
            os.makedirs(CACHE, exist_ok=True)
            with open(dest, "wb") as f:
                f.write(data)
            return dest
        except Exception as e:
            if a == retries - 1:
                print("   FAIL %s %s" % (name, e))
                return None
            time.sleep(1.0 * (a + 1))
    return None


def convert(src, name):
    out = os.path.join(DST, name[:-4] + ".webp")
    with Image.open(src) as im:
        im = im.convert("RGBA")
        w, h = im.size
        k = min(SIDE / w, SIDE / h)
        nw, nh = max(1, round(w * k)), max(1, round(h * k))
        im = im.resize((nw, nh), Image.LANCZOS)
        canvas = Image.new("RGBA", (SIDE, SIDE), (0, 0, 0, 0))
        canvas.paste(im, ((SIDE - nw) // 2, (SIDE - nh) // 2), im)
        canvas.save(out, "WEBP", quality=90, alpha_quality=100, exact=True, method=4)
        return w, h, os.path.getsize(out)


def main():
    os.makedirs(DST, exist_ok=True)
    names = fetch_names()
    print("mirror files:", len(names), flush=True)
    pool = pick_pool(names)
    print("pool size:", len(pool), flush=True)

    # 并发下载（单线程约 5s/张，400 张要半小时；16 线程降到 1~2 分钟）
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=16) as ex:
        list(ex.map(download, pool))
    print("downloaded", flush=True)

    manifest = []
    miss = []
    total = 0
    for i, nm in enumerate(pool):
        src = os.path.join(CACHE, nm)
        if not os.path.exists(src) or os.path.getsize(src) == 0:
            miss.append(nm)
            continue
        try:
            w, h, sz = convert(src, nm)
        except Exception as e:
            miss.append("%s (%s)" % (nm, e))
            continue
        total += sz
        manifest.append({"n": nm[:-4], "src": nm, "ow": w, "oh": h, "kb": round(sz / 1024, 1)})
        if (i + 1) % 50 == 0:
            print("  ...%d/%d" % (i + 1, len(pool)), flush=True)

    meta = {"side": SIDE, "source": "Aceship/Arknight-Images ui/medalicon",
            "count": len(manifest), "pool": [m["n"] for m in manifest]}
    with open(os.path.join(DST, "_manifest.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)

    lines = ["built %d medals, %.2f MB" % (len(manifest), total / 1048576),
             "missing %d" % len(miss)] + ["  miss " + m for m in miss[:40]]
    with open(os.path.join(os.path.expanduser("~"), ".workbuddy", "tmp", "_medal_build.txt"),
              "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(lines[0])
    print(lines[1])


if __name__ == "__main__":
    main()
