# -*- coding: utf-8 -*-
"""把 ArkUnpacker 解出的「各页面原版 UI 图集」转成前端可用的 webp + 清单。

与根目录的 build_ui_assets.py 的区别：
  · build_ui_assets.py 是**手挑白名单**（60 个 FX / PRTS / 部件贴图，落在 static/img/ui/）
  · 本脚本是**整目录收录**（按页面分组，落在 static/img/ui/pages/），
    因为后续要按模块逐个还原，先把原版素材成批搬进来、连尺寸和主色一起登记，
    免得每做一屏都要回头再解一次包。

输入：ArkUnpacker 的产物目录（-m ab --image -g，按 ab 名分组）
输出：static/img/ui/pages/<group>/<name>.webp + static/img/ui/pages/_manifest.json

清单里除了尺寸/体积，还记三个「还原时要用」的客观指标：
  · alpha    —— 透明占比。接近 1 说明是「带镂空的部件」，接近 0 说明是实心底板
  · opaque   —— 去掉全透明像素后的实际尺寸（很多原版贴图四周留了大片空白，
                直接当 background-size:100% 会缩放错，必须知道真实内容框）
  · colors   —— 面积占比最高的 3 个不透明颜色，用于对齐原版配色

用法（必须用带 PIL 的系统 Python）：
    C:\\Users\\MMCGA\\AppData\\Local\\Programs\\Python\\Python314\\python.exe scripts\\build_ui_pages.py
"""
import json
import os
from collections import Counter

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = r"C:\Users\MMCGA\_uiout"
DST = os.path.join(ROOT, "static", "img", "ui", "pages")


def trim_box(im):
    """返回内容框（去掉四周全透明边）。没有 alpha 就返回整图。"""
    if im.mode != "RGBA":
        im = im.convert("RGBA")
    bbox = im.split()[3].point(lambda v: 255 if v > 8 else 0).getbbox()
    return bbox or (0, 0, im.width, im.height)


def top_colors(im, k=3):
    """面积占比最高的 k 个不透明颜色（量化到 16 级，避免渐变把结果打散）。"""
    if im.mode != "RGBA":
        im = im.convert("RGBA")
    small = im.resize((min(im.width, 96), min(im.height, 96)))
    c = Counter()
    for r, g, b, a in small.getdata():
        if a < 128:
            continue
        c[(r >> 4 << 4, g >> 4 << 4, b >> 4 << 4)] += 1
    tot = sum(c.values()) or 1
    return ["#%02X%02X%02X(%.0f%%)" % (r, g, b, 100.0 * n / tot) for (r, g, b), n in c.most_common(k)]


def main():
    if not os.path.isdir(SRC):
        raise SystemExit("找不到解包产物目录：%s（先跑 ArkUnpacker -m ab --image -g）" % SRC)

    manifest = []
    missing = []
    for root, _dirs, files in os.walk(SRC):
        rel = os.path.relpath(root, SRC).replace("\\", "/")
        # 用 ab 文件名（分组目录名）作为 group，页面名取更上一级
        group = os.path.basename(rel)
        page = rel.split("/")[-2] if "/" in rel else group
        for f in sorted(files):
            if not f.lower().endswith(".png"):
                continue
            src = os.path.join(root, f)
            name = os.path.splitext(f)[0]
            out_dir = os.path.join(DST, page)
            os.makedirs(out_dir, exist_ok=True)
            out = os.path.join(out_dir, name + ".webp")
            try:
                with Image.open(src) as im:
                    im = im.convert("RGBA")
                    w, h = im.size
                    bx = trim_box(im)
                    if im.mode == "RGBA":
                        al = im.getchannel("A").histogram()
                        opaque_ratio = sum(al[8:]) / max(sum(al), 1)
                    else:
                        opaque_ratio = 1.0
                    cols = top_colors(im)
                    im.save(out, "WEBP", quality=92, alpha_quality=100, exact=True, method=6)
            except Exception as e:
                missing.append("%s: %s" % (rel + "/" + f, e))
                continue
            manifest.append({
                "page": page, "group": group, "name": name,
                "w": w, "h": h,
                "content": [bx[2] - bx[0], bx[3] - bx[1]],
                "contentBox": list(bx),
                "alpha": round(opaque_ratio, 3),
                "colors": cols,
                "kb": round(os.path.getsize(out) / 1024, 1),
                "src": rel + "/" + f,
            })

    manifest.sort(key=lambda m: (m["page"], m["group"], m["name"]))
    dst_manifest = os.path.join(DST, "_manifest.json")
    with open(dst_manifest, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=1)

    lines = ["converted %d sprites, %.2f MB, pages=%d"
             % (len(manifest), sum(m["kb"] for m in manifest) / 1024,
                len({m["page"] for m in manifest}))]
    lines.append("")
    cur = None
    for m in manifest:
        if m["page"] != cur:
            cur = m["page"]
            lines.append("== %s" % cur)
        lines.append("  %-34s %4dx%-4d content %4dx%-4d alpha %.2f %s   %6.1fKB"
                     % (m["name"][:34], m["w"], m["h"], m["content"][0], m["content"][1],
                        m["alpha"], " ".join(m["colors"][:2]), m["kb"]))
    if missing:
        lines.append("")
        lines.append("FAILED %d:" % len(missing))
        lines += ["  " + m for m in missing]

    report = os.path.join(os.path.expanduser("~"), "_ui_pages_report.txt")
    with open(report, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))
    print(lines[0])
    print("report ->", report)


if __name__ == "__main__":
    main()
