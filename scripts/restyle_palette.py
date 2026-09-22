# -*- coding: utf-8 -*-
"""⚠️ 已作废（R31，2026-09-22）—— 不要运行，默认会被拒绝执行。

R31 结论：本脚本把「金黄 -> 方舟蓝」的决定**已被推翻**。用户反馈：
  「星星改用金色而非蓝色；蓝色仅作为多种颜色之一，不要把所有字体都改成蓝色，
    应保留并合理搭配多种颜色，把握原设计的配色精髓。」
其中最严重的一点是：它把设计令牌也换了 —— `--highlight-gold-1` 的值一度成了 `#4aabea`，
于是所有 `var(--highlight-gold-N)` 全渲染成蓝，整站只剩蓝。

现状与正确做法：
  · 该次调色已由 scripts/restyle_palette_revert.py 整体回退（344 行）；
  · 配色体系改由 static/style.css §15.0 的语义令牌统一管理
    （--ak-color-primary 金 / --ak-color-tech 蓝 / --ak-color-success / --ak-color-danger）；
  · 需要调整配色请改 §15.0 的令牌值，**不要**再跑这个脚本。

如确需复现历史蓝化效果，显式加 --force-legacy（并自行承担后果）。

用法：python scripts/restyle_palette.py --force-legacy [--dry]
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSS = os.path.join(ROOT, "static", "style.css")

# 金色 rgba 三元组 -> 方舟蓝
RGBA_MAP = {
    "232,184,24": "74,171,234",
    "232, 184, 24": "74, 171, 234",
    "255,224,96": "127,198,242",
    "255, 224, 96": "127, 198, 242",
    "255,208,40": "74,171,234",
    "255, 208, 40": "74, 171, 234",
    "255,214,102": "127,198,242",
    "255,214,110": "160,215,245",
    "255,196,60": "110,190,240",
    "240,180,40": "74,171,234",
    "240, 180, 40": "74, 171, 234",
    "255,184,77": "110,190,240",
    "200,160,32": "110,168,208",
    "255,226,150": "160,215,245",
    "255,226,138": "168,220,255",
    "120,70,0": "12,58,92",
    "110,66,0": "10,48,78",
}

# 金色 hex -> 方舟蓝 / 蓝灰
HEX_MAP = {
    "#FFD028": "#4aabea", "#FFE866": "#a8dcff", "#E8B000": "#2b7fb8",
    "#FFDC40": "#5fb8ee", "#FFF080": "#cbeaff", "#CC9A00": "#1c5f8f",
    "#C8A020": "#6f9ec4", "#E8C840": "#8fb8d8", "#D8B030": "#5f8fb4",
    "#F0D060": "#b8d8f0", "#B89010": "#3f6f96",
    "#C87830": "#3f8fbf", "#E8A040": "#5fb8ee", "#D89050": "#58a8d8",
    "#F0B060": "#7fc6f2", "#B06020": "#2f6f9f",
    "#C8860C": "#2b7fb8", "#F0B429": "#4aabea", "#FFE28A": "#a8dcff",
    "#FFD666": "#5fb8ee", "#F0A93C": "#4aabea", "#FFCF70": "#a8dcff",
    "#E8B818": "#4aabea", "#C9A227": "#3f8fbf", "#FFD76A": "#a8dcff",
    "#FFE9A8": "#cbeaff", "#ffe9a8": "#cbeaff",
    # 金按钮上的深棕文字 -> 深海军蓝
    "#2A1A00": "#08243a", "#2a1a00": "#08243a", "#141410": "#08243a",
}

# 稀有度/星级要保留暖色，这些行跳过
SKIP = re.compile(
    r"rarity-|\.rar-\d|gp-r\d|opGold|op-card-front|star-display|star-select"
    r"|op-chip|calendar-task-stars|gh-card\.rar|\.gp-ribbon")


def main():
    if "--force-legacy" not in sys.argv:
        print("[拒绝执行] 本脚本已于 R31 作废：它会把全站金色再度刷成蓝色。")
        print("  配色请改 static/style.css 的 §15.0 语义令牌；")
        print("  要把历史蓝化整体回退，用 scripts/restyle_palette_revert.py。")
        print("  确需复现历史效果请显式加 --force-legacy。")
        return
    dry = "--dry" in sys.argv
    src = open(CSS, encoding="utf-8").read()
    lines = src.split("\n")
    out = []
    n_rgba = n_hex = n_skip = 0
    touched = []
    for i, ln in enumerate(lines, 1):
        if SKIP.search(ln):
            n_skip += 1
            out.append(ln)
            continue
        new = ln
        for k, v in RGBA_MAP.items():
            if k in new:
                new = new.replace(k, v)
                n_rgba += 1
        for k, v in HEX_MAP.items():
            if k in new:
                new = new.replace(k, v)
                n_hex += 1
        if new != ln:
            touched.append(i)
        out.append(new)

    print("rgba replacements: %d" % n_rgba)
    print("hex  replacements: %d" % n_hex)
    print("lines touched    : %d" % len(touched))
    print("lines skipped    : %d" % n_skip)
    if dry:
        return
    if len(touched) < 50:
        print("!! 替换行数偏少(%d)，可能映射表过期，已中止写入" % len(touched))
        return
    open(CSS, "w", encoding="utf-8", newline="\n").write("\n".join(out))
    print("written:", CSS)


if __name__ == "__main__":
    main()
