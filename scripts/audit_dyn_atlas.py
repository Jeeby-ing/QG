# -*- coding: utf-8 -*-
"""只读审计：检查 static/img/dyn/ 下每套 Spion 资源的 atlas 与贴图是否自洽。
重点排查"抠出来不对劲"类问题：
  1. atlas 声明的 size: 与实际贴图尺寸是否一致（不一致 → 区域错位 → 画面错乱）
  2. pma / filter 标记
  3. 区域数、是否多页
  4. .skel 里引用的 atlas 区域名是否都能在 atlas 里找到（缺 → 部件缺失）
用法：python scripts/audit_dyn_atlas.py > 报告
"""
import json
import os
import re
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DYN = os.path.join(ROOT, "static", "img", "dyn")

PAGE_RE = re.compile(r"^(\S+\.(?:webp|png))$")
SIZE_RE = re.compile(r"^\s*size:\s*(\d+)\s*,\s*(\d+)")
FMT_RE = re.compile(r"^\s*format:\s*(\S+)")
FILTER_RE = re.compile(r"^\s*filter:\s*(\S+)")
PMA_RE = re.compile(r"^\s*pma:\s*(\S+)")
REGION_RE = re.compile(r"^\s*(\S+)\s*$")
RECT_RE = re.compile(r"^\s*(rotate:\s*(\w+))?\s*$|^\s*(xy|size|orig|offset):\s*(-?\d+)\s*,\s*(-?\d+)\s*$")


def parse_atlas(path):
    """返回 {'pages': [{'name','size','format','filter','pma','regions':{name:{...}}}], 'order':[names]}"""
    pages = []
    with open(path, "r", encoding="utf-8") as f:
        lines = f.read().splitlines()
    cur = None
    last_region = None
    for raw in lines:
        if not raw.strip():
            continue
        indented = raw[:1] in (" ", "\t")
        if not indented:
            # 新页
            cur = {"name": raw.strip(), "size": None, "format": None,
                   "filter": None, "pma": None, "regions": {}, "order": []}
            pages.append(cur)
            last_region = None
            continue
        s = raw.strip()
        if cur is None:
            continue
        m = SIZE_RE.match(raw)
        if m and cur["size"] is None:
            cur["size"] = (int(m.group(1)), int(m.group(2)))
            continue
        m = FMT_RE.match(raw)
        if m and cur["format"] is None:
            cur["format"] = m.group(1)
            continue
        m = FILTER_RE.match(raw)
        if m and cur["filter"] is None:
            cur["filter"] = m.group(1)
            continue
        m = PMA_RE.match(raw)
        if m and cur["pma"] is None:
            cur["pma"] = m.group(1)
            continue
        m = re.match(r"^(rotate|xy|size|orig|offset):", s)
        if m:
            key = m.group(1)
            val = s.split(":", 1)[1].strip()
            if last_region is not None:
                if key == "rotate":
                    cur["regions"][last_region]["rotate"] = (val == "true")
                else:
                    parts = [int(x) for x in val.split(",")]
                    cur["regions"][last_region][key] = parts
            continue
        # 区域名
        last_region = s
        cur["regions"][s] = {"rotate": False}
        cur["order"].append(s)
    return {"pages": pages}


def main():
    idx_path = os.path.join(DYN, "_index.json")
    with open(idx_path, "r", encoding="utf-8") as f:
        index = json.load(f)
    print("index entries = %d" % len(index))

    bad_size = []
    multi_page = []
    rotated = []
    pma_pages = []
    total_regions = 0
    unreadable = []
    ok = 0

    for skin_id, meta in sorted(index.items()):
        rel = meta.get("dir") if isinstance(meta, dict) else meta
        d = os.path.join(ROOT, "static", rel)
        if not os.path.isdir(d):
            unreadable.append((skin_id, "dir missing"))
            continue
        atlases = [x for x in os.listdir(d) if x.endswith(".atlas")]
        skels = [x for x in os.listdir(d) if x.endswith(".skel")]
        if len(atlases) != 1 or len(skels) < 1:
            unreadable.append((skin_id, "atlas=%d skel=%d" % (len(atlases), len(skels))))
            continue
        a = parse_atlas(os.path.join(d, atlases[0]))
        if len(a["pages"]) > 1:
            multi_page.append((skin_id, len(a["pages"])))
        for p in a["pages"]:
            fn = p["name"]
            fp = os.path.join(d, fn)
            if not os.path.exists(fp):
                unreadable.append((skin_id, "page missing " + fn))
                continue
            try:
                with Image.open(fp) as im:
                    actual = im.size
                    im.load()
            except Exception as e:
                unreadable.append((skin_id, "open fail %s: %s" % (fn, e)))
                continue
            if p["size"] != actual:
                bad_size.append((skin_id, fn, p["size"], actual))
            if p["pma"] and p["pma"].lower() == "true":
                pma_pages.append((skin_id, fn))
            n = len(p["regions"])
            total_regions += n
            for rn, rv in p["regions"].items():
                if rv.get("rotate"):
                    rotated.append((skin_id, rn))
            ok += 1

    print("\n=== 尺寸不一致（区域会错位，最可能是问题根源）===")
    if bad_size:
        for x in bad_size:
            print("  %s / %s  atlas=%s  实际=%s" % x)
    else:
        print("  无")

    print("\n=== 多页图集 ===")
    print("  %s" % (multi_page if multi_page else "无"))

    print("\n=== pma:true 的页 ===")
    print("  %s" % (pma_pages if pma_pages else "无"))

    print("\n=== 旋转区域数 ===")
    print("  %d 个，前 10：%s" % (len(rotated), rotated[:10]))

    print("\n=== 打不开/缺件 ===")
    if unreadable:
        for x in unreadable[:30]:
            print("  %s : %s" % x)
        if len(unreadable) > 30:
            print("  ... 还有 %d 条" % (len(unreadable) - 30))
    else:
        print("  无")

    print("\n=== 统计 ===")
    print("  页数合计=%d  区域合计=%d  正常套=%d" % (ok, total_regions, len(index)))


if __name__ == "__main__":
    main()
