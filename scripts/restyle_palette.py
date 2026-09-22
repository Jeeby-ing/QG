# -*- coding: utf-8 -*-
"""R29 第八刀 · 全站调色：把散落的「金黄色」机械收敛到明日方舟蓝白灰。

背景：R29 前七刀只动了"组件外观层"，但 style.css 里还散着 200+ 处硬编码的金黄
（rgba(232,184,24,*) / #E8B818 / 金色渐变按钮 …），用户反馈"还是很多金黄色的配色，
不是方舟风格"。这些颜色是字面量，没有走 CSS 变量，靠末尾追加规则覆盖不现实，
所以这里做一次**可复现、可回滚的机械调色**：

  · 只替换颜色字面量，**不动任何选择器 / 布局 / 尺寸**；
  · 保留稀有度语义的橙金（6★ 卡、gp-r4/r5 礼包缎带、星级、op-chip 星）——
    这些在方舟里本来就该是暖色；
  · 结果写回 static/style.css，并打印替换统计。

用法：python scripts/restyle_palette.py [--dry]
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
