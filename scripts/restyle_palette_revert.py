# -*- coding: utf-8 -*-
"""R31 · 配色回归：把 R29 第八刀那次「金 -> 蓝」的机械调色**整体回退**。

背景（用户反馈原文）：
  「星星改用金色而非蓝色；蓝色仅作为多种颜色之一，不要把所有字体都改成蓝色，
    应保留并合理搭配多种颜色，把握原设计的配色精髓。」

根因：scripts/restyle_palette.py 把 style.css 里 200+ 处金黄字面量**就地**换成了方舟蓝，
连设计令牌都被换掉了 —— L75 `--highlight-gold-1` 的值是 `#4aabea`（蓝），
于是所有 `var(--highlight-gold-N)` 全渲染成蓝。追加规则覆盖不住，只能反向回退。

本脚本 = restyle_palette.py 的逆映射（蓝 -> 金），逻辑与它一一对应：
  · 只替换颜色字面量，不动选择器/布局/尺寸；
  · 一对多时取首个（最典型的）金值；
  · **保护区间**：§14.4「领取状态三态化」里的蓝是语义色（claimed 要与 claimable 的金区分开），
    整段跳过，避免把「已领取」也刷成金色而与「可领取」混淆。

用法：python scripts/restyle_palette.py --revert [--dry]
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSS = os.path.join(ROOT, "static", "style.css")

# restyle_palette.py 里的「金 -> 蓝」映射，逐条反转
_ORIG_RGBA = {
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
_ORIG_HEX = {
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
    "#2A1A00": "#08243a", "#2a1a00": "#08243a", "#141410": "#08243a",
}

INV_RGBA, INV_HEX = {}, {}
for _gold, _blue in _ORIG_RGBA.items():
    INV_RGBA.setdefault(_blue, _gold)
for _gold, _blue in _ORIG_HEX.items():
    INV_HEX.setdefault(_blue.lower(), _gold)

# 保护：§14.4 及之后的语义色不动
PROTECT = re.compile(r"14\.4\s+领取状态三态化")
# 同理，稀有度/星级的暖色本来就对，避免二次误伤
SKIP = re.compile(
    r"rarity-|\.rar-\d|gp-r\d|opGold|op-card-front|star-display|star-select"
    r"|op-chip|calendar-task-stars|gh-card\.rar|\.gp-ribbon")


def main():
    dry = "--dry" in sys.argv
    lines = open(CSS, encoding="utf-8").read().split("\n")
    protect_from = len(lines) + 1
    for i, ln in enumerate(lines, 1):
        if PROTECT.search(ln):
            protect_from = i
            break

    out, n_rgba, n_hex, n_skip = [], 0, 0, 0
    touched = []
    for i, ln in enumerate(lines, 1):
        if i >= protect_from or SKIP.search(ln):
            n_skip += 1
            out.append(ln)
            continue
        new = ln
        for blue, gold in INV_RGBA.items():
            if blue in new:
                new = new.replace(blue, gold)
                n_rgba += 1
        low = new.lower()
        for blue, gold in INV_HEX.items():
            if blue in low:
                new = re.sub(re.escape(blue), gold, new, flags=re.I)
                low = new.lower()
                n_hex += 1
        if new != ln:
            touched.append(i)
        out.append(new)

    print("保护起点(§14.4)行号      : %d / %d" % (protect_from, len(lines)))
    print("rgba 回退次数            : %d" % n_rgba)
    print("hex  回退次数            : %d" % n_hex)
    print("实际改动行数             : %d" % len(touched))
    print("跳过行数                 : %d" % n_skip)
    if dry:
        return
    if len(touched) < 50:
        print("!! 改动行数偏少(%d)，映射表可能过期，已中止写入" % len(touched))
        return
    open(CSS, "w", encoding="utf-8", newline="\n").write("\n".join(out))
    print("written:", CSS)


if __name__ == "__main__":
    main()
