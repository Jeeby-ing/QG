# -*- coding: utf-8 -*-
"""把 static/img/ui 下的 webp 拼成一张带标签的联络表（棋盘底），供人工挑图。"""
import json
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, "static", "img", "ui")
OUT = r"C:\Users\MMCGA\.workbuddy\tmp\_ui_sheet.png"

manifest = json.load(open(os.path.join(D, "_manifest.json"), encoding="utf-8"))
CELL = 150
PAD = 6
LABEL = 16
COLS = 9
rows = (len(manifest) + COLS - 1) // COLS
W = COLS * (CELL + PAD) + PAD
H = rows * (CELL + PAD + LABEL) + PAD + 24
sheet = Image.new("RGB", (W, H), (26, 27, 31))
dr = ImageDraw.Draw(sheet)
dr.text((PAD, 6), "Quest-log L2 native UI assets  (%d files)" % len(manifest), fill=(230, 230, 235))

for i, m in enumerate(manifest):
    r, c = divmod(i, COLS)
    x = PAD + c * (CELL + PAD)
    y = 24 + PAD + r * (CELL + PAD + LABEL)
    # 棋盘底，方便看透明区
    for yy in range(0, CELL, 15):
        for xx in range(0, CELL, 15):
            dark = ((xx // 15) + (yy // 15)) % 2 == 0
            dr.rectangle([x + xx, y + yy, x + min(xx + 14, CELL - 1), y + min(yy + 14, CELL - 1)],
                         fill=(58, 60, 66) if dark else (44, 46, 51))
    p = os.path.join(D, m["file"])
    with Image.open(p) as im:
        im = im.convert("RGBA")
        im.thumbnail((CELL, CELL), Image.LANCZOS)
        sheet.paste(im, (x + (CELL - im.width) // 2, y + (CELL - im.height) // 2), im)
    dr.text((x + 1, y + CELL + 2), m["file"][:22], fill=(200, 205, 214))
    dr.text((x + 1, y + CELL + 9), "%dx%d %s" % (m["w"], m["h"], m["group"]), fill=(140, 145, 155))

os.makedirs(os.path.dirname(OUT), exist_ok=True)
sheet.save(OUT)
print("saved", OUT, sheet.size)
