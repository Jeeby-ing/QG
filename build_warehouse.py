# -*- coding: utf-8 -*-
"""
仓库素材生成器
------------------------------------------------------------------
从 assets-source 的**官方游戏数据**中生成仓库用的素材图标与目录：

1. 读取 gamedata/excel/item_table.json（鹰角官方物品表，含中文名/稀有度）
2. 只收录「仓库」里真实存在的道具（素材/作战记录/芯片/模组/信物）
3. 把 item_rarity_img/sprite_item_r{N}.png 稀有度底板 与 item/<iconId>.png 物品图合成，
   底板索引 = rarity + 1（灰/绿/蓝/紫/金），这样玩家看背景色就知道等级
4. 统一缩放到 96px 并优化，输出到 static/icons/mat_<iconId>.png
5. 产出 static/warehouse_catalog.json（key/名称/分类/稀有度），供前端渲染

用法： python build_warehouse.py
"""
import json
import os
import shutil

from PIL import Image

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "assets-source")
ITEM_DIR = os.path.join(SRC, "item")
RARITY_DIR = os.path.join(SRC, "item_rarity_img")
TABLE = os.path.join(SRC, "gamedata", "excel", "item_table.json")

OUT_ICONS = os.path.join(BASE, "static", "icons")
OUT_CATALOG = os.path.join(BASE, "static", "warehouse_catalog.json")

SIZE = 96  # 素材类输出边长
SIZE_TOKEN = 64  # 信物数量多(646)，用更小尺寸控制总体积


def categorize(icon_id: str, name: str) -> str:
    """按明日方舟仓库分类归类。"""
    if icon_id.startswith("sprite_exp_card_"):
        return "作战记录"
    if icon_id.startswith("MTL_SKILL"):
        return "技巧概要"
    if icon_id.startswith("MTL_ASC_"):
        return "芯片"
    if icon_id.startswith("mod_"):
        return "模组"
    if icon_id.startswith(("p_char_", "class_p_char_", "tier")):
        return "信物"
    if icon_id.startswith("MTL_"):
        return "素材"
    return "素材"


def main():
    if not os.path.isfile(TABLE):
        raise SystemExit(f"缺少官方物品表: {TABLE}")

    with open(TABLE, encoding="utf-8") as f:
        items = json.load(f)["items"]

    have = {fn[:-4] for fn in os.listdir(ITEM_DIR) if fn.endswith(".png")}

    # 底板缓存：rarity(0-5) -> 合成好的底板 RGBA（两种尺寸各一份）
    plates = {}
    for size in (SIZE, SIZE_TOKEN):
        for rarity in range(0, 6):
            p = os.path.join(RARITY_DIR, f"sprite_item_r{rarity + 1}.png")
            if not os.path.isfile(p):
                raise SystemExit(f"缺少稀有度底板: {p}")
            plates[(size, rarity)] = Image.open(p).convert("RGBA").resize((size, size), Image.LANCZOS)

    os.makedirs(OUT_ICONS, exist_ok=True)

    catalog = []
    seen = set()

    # 是否收录信物（干员信物/皇家信物等收集品）。默认收录：
    # 用户希望把干员信物当作收集品展示在仓库里。
    # 如需关闭，把环境变量 WAREHOUSE_INCLUDE_TOKENS=0 即可，无需改代码。
    INCLUDE_TOKENS = os.environ.get("WAREHOUSE_INCLUDE_TOKENS", "1") != "0"

    for key, v in items.items():
        icon_id = v.get("iconId")
        if not icon_id or icon_id not in have:
            continue
        # 只收录仓库道具：素材 / 作战记录
        if v.get("itemType") not in ("MATERIAL", "CARD_EXP"):
            continue
        # 排除活动代币/家具零件/剧情体验券等非仓库常驻素材
        if icon_id.startswith(("act", "LMTGS", "RETRO", "EPGS", "CRS", "EXGG", "STORY", "ark_", "COIN_FURN")):
            continue
        if icon_id in seen:
            continue
        seen.add(icon_id)

        name = (v.get("name") or "").strip()
        if not name:
            continue
        rarity = int(v.get("rarity") or 0)
        rarity = max(0, min(rarity, 5))
        cat = categorize(icon_id, name)

        # 信物默认不收录（干员专属、数量大、与"仓库"主题弱相关）
        if cat == "信物" and not INCLUDE_TOKENS:
            continue

        # 排除「中坚信物」(class_p_char_*) 与「信物复制品」(tier1_*)：
        # 它们是干员信物/皇家信物的衍生复制品，用户要求只保留干员信物与皇家信物作为收集展示。
        if cat == "信物" and icon_id.startswith(("class_p_char_", "tier1_")):
            continue

        size = SIZE_TOKEN if cat == "信物" else SIZE

        # 合成：稀有度底板在下，物品图在上
        canvas = plates[(size, rarity)].copy()
        try:
            icon = Image.open(os.path.join(ITEM_DIR, f"{icon_id}.png")).convert("RGBA")
            icon = icon.resize((size, size), Image.LANCZOS)
            canvas.alpha_composite(icon)
        except Exception as e:  # 单个图标失败不影响整体
            print(f"  ! 图标合成失败 {icon_id}: {e}")
            continue

        out_name = f"mat_{icon_id}.png"
        canvas.save(os.path.join(OUT_ICONS, out_name), optimize=True)

        catalog.append({
            "key": f"mat_{icon_id}",
            "name": name,
            "cat": cat,
            "r": rarity,
        })

    # 分类顺序（按明日方舟仓库惯例）：养成消耗在前，信物最后
    order = {"作战记录": 0, "技巧概要": 1, "芯片": 2, "模组": 3, "素材": 4, "信物": 5}

    def sort_key(x):
        cat_order = order.get(x["cat"], 9)
        r = -x["r"]
        # 芯片助剂单独沉到「芯片」分类最末尾（它在图标/用法上是通用助剂，不是某职业芯片）
        if x["cat"] == "芯片" and x["key"] == "mat_MTL_ASC_DI":
            return (cat_order, 999, "\uFFFF")  # 排在同分类所有正常稀有度之后
        return (cat_order, r, x["name"])

    catalog.sort(key=sort_key)

    with open(OUT_CATALOG, "w", encoding="utf-8") as f:
        json.dump({"version": 1, "items": catalog}, f, ensure_ascii=False, separators=(",", ":"))

    # 统计
    from collections import Counter
    cats = Counter(x["cat"] for x in catalog)
    print(f"生成图标: {len(catalog)} 个 -> {OUT_ICONS}")
    print(f"生成目录: {OUT_CATALOG}")
    print("分类分布:")
    for c, n in sorted(cats.items(), key=lambda kv: order.get(kv[0], 9)):
        print(f"  {c:<8} {n}")
    total = sum(os.path.getsize(os.path.join(OUT_ICONS, x["key"] + ".png")) for x in catalog)
    print(f"图标总占用: {total / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    main()
