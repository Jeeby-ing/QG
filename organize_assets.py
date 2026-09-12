#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
整理从 yuanyan3060/ArknightsGameResource 克隆下来的方舟资源。

逻辑：
1. 把 Quest-log 当前要用的 5 个图标从 assets-source 复制到 static/icons/（按项目命名）
2. 把全部 item 图标复制到 assets-source/_all_items/ 备份，方便后续重新整合
3. 生成 manifest.json 说明各目录内容
"""
import os, shutil, json

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "assets-source")
ICONS = os.path.join(BASE, "static", "icons")
ALL_ITEMS = os.path.join(BASE, "assets-source", "_all_items")

# Quest-log 需要的图标：源文件名(iconId) -> 目标文件名
NEEDED = {
    "GOLD.png":         "lungmen.png",      # 龙门币
    "DIAMOND_SHD.png":  "orundum.png",      # 合成玉
    "DIAMOND.png":      "source_stone.png", # 至纯源石(源石)
    "AP_GAMEPLAY.png":  "sanity.png",       # 理智
    "EXP_PLAYER.png":   "exp.png",          # 经验
}

# 随机掉落素材图标：掉落 key(=前端 RESOURCE_SVGS 键) -> 源图标文件名(assets-source/item 内)
# 做法与上面基础资源一致：把真实方舟素材 PNG 放进 static/icons/<key>.png，
# 前端 tryUpgradeResIcon(iconWrap, key) 会自动用真图替换手绘 SVG 徽标。
# 掉落 key -> 源 item PNG 文件名（真实方舟素材）。
# 复制到 static/icons/<掉落key>.png，前端 tryUpgradeResIcon(iconWrap, key) 自动替换手绘 SVG。
DROP_ICONS = {
    # 赤金系列
    "MTL_GOLD1":        "MTL_GOLD1.png",     # 赤金
    "MTL_GOLD2":        "MTL_GOLD2.png",     # 赤金块
    "MTL_GOLD3":        "MTL_GOLD3.png",     # 高纯赤金
    # 技巧概要
    "MTL_SKILL1":       "MTL_SKILL1.png",    # 技巧概要·卷1
    "MTL_SKILL2":       "MTL_SKILL2.png",    # 技巧概要·卷2
    "MTL_SKILL3":       "MTL_SKILL3.png",    # 技巧概要·卷3
    # 作战记录
    "sprite_exp_card_t1": "sprite_exp_card_t1.png", # 基础作战记录
    "sprite_exp_card_t2": "sprite_exp_card_t2.png", # 初级作战记录
    "sprite_exp_card_t3": "sprite_exp_card_t3.png", # 中级作战记录
    "sprite_exp_card_t4": "sprite_exp_card_t4.png", # 高级作战记录
    # 基础/常规素材
    "MTL_ROCK":         "MTL_SL_G2.png",     # 固源岩
    "MTL_SOURCE_ROCK":  "MTL_SL_G1.png",     # 源岩
    "MTL_SUGAR":        "MTL_SL_STRG2.png",  # 糖
    "MTL_SUGAR_GROUP":  "MTL_SL_STRG3.png",  # 糖组
    "MTL_IRON":         "MTL_SL_IRON2.png",  # 异铁
    "MTL_ORE":          "MTL_SL_IRON1.png",  # 异铁碎片
    "MTL_IRON_BLOCK":   "MTL_SL_IRON4.png",  # 异铁块
    "MTL_MANGANESE1":   "MTL_SL_MANGANESE1.png", # 轻锰矿
    "MTL_MANGANESE3":   "MTL_SL_MANGANESE2.png", # 三水锰矿
    "MTL_DEVICE":       "MTL_SL_BOSS1.png",  # 破损装置
    "MTL_DEVICE_PIECE": "MTL_SL_BOSS2.png",  # 装置
    "MTL_DEVICE_MOD":   "MTL_SL_BOSS4.png",  # 改量装置
    "MTL_POLYESTER":    "MTL_SL_RUSH1.png",  # 酯原料
    "MTL_RUSH":         "MTL_SL_RUSH2.png",  # 聚酸酯
    "MTL_GEL":          "MTL_SL_PGEL3.png",  # 凝胶
    "MTL_PGEL_AGG":     "MTL_SL_PGEL4.png",  # 聚合凝胶
    "MTL_CRYSTAL":      "MTL_SL_OC3.png",    # 晶体元件
    "MTL_OC_CIRCUIT":   "MTL_SL_OC4.png",    # 晶体电路
    "MTL_GRIND":        "MTL_SL_PG1.png",    # 研磨石
    "MTL_PURIFIED_ROCK":"MTL_SL_G4.png",     # 提纯源岩
    "MTL_ALCOHOL_T":    "MTL_SL_ALCOHOL1.png", # 扭转醇
    "MTL_ALCOHOL_W":    "MTL_SL_ALCOHOL2.png", # 白马醇
    "MTL_CHIP":         "MTL_ASC_PIO3.png",  # 双芯片
}

def main():
    if not os.path.isdir(SRC):
        print(f"[ERROR] 源目录不存在: {SRC}\n请先等待 git clone 完成。")
        return

    os.makedirs(ICONS, exist_ok=True)
    os.makedirs(ALL_ITEMS, exist_ok=True)

    # 1) 复制全部 item 图标到备份目录（保留原始 iconId 命名）
    item_src = os.path.join(SRC, "item")
    copied_all = 0
    if os.path.isdir(item_src):
        for f in os.listdir(item_src):
            if f.lower().endswith(".png"):
                shutil.copy2(os.path.join(item_src, f), os.path.join(ALL_ITEMS, f))
                copied_all += 1
    print(f"[OK] 备份全部 item 图标: {copied_all} 个 -> {ALL_ITEMS}")

    # 2) 复制 Quest-log 当前需要的 5 个到 static/icons/
    used = 0
    missing = []
    for src_name, dst_name in NEEDED.items():
        s = os.path.join(item_src, src_name)
        if os.path.isfile(s):
            shutil.copy2(s, os.path.join(ICONS, dst_name))
            used += 1
            print(f"  -> {src_name} => static/icons/{dst_name}")
        else:
            missing.append(src_name)
    if missing:
        print(f"[WARN] 以下图标未找到（可能命名不同）: {missing}")

    # 2.5) 复制随机掉落素材图标到 static/icons/（按掉落 key 命名，覆盖同名即更新）
    drop_used = 0
    drop_missing = []
    for drop_key, src_file in DROP_ICONS.items():
        s = os.path.join(item_src, src_file)
        if os.path.isfile(s):
            shutil.copy2(s, os.path.join(ICONS, drop_key + ".png"))
            drop_used += 1
        else:
            drop_missing.append(src_file)
    print(f"[OK] 掉落素材图标: 激活 {drop_used}/{len(DROP_ICONS)}")
    if drop_missing:
        print(f"[WARN] 以下掉落图标未找到: {drop_missing}")

    # 3) 生成 manifest
    manifest = {"generated": True, "source_repo": "yuanyan3060/ArknightsGameResource",
                "questlog_active_icons": NEEDED, "folders": {}}
    for d in ["item", "avatar", "portrait", "skin", "enemy", "skill", "map", "building_skill", "item_rarity_img"]:
        p = os.path.join(SRC, d)
        if os.path.isdir(p):
            manifest["folders"][d] = len([x for x in os.listdir(p) if not x.startswith(".")])
    with open(os.path.join(BASE, "assets-source", "manifest.json"), "w", encoding="utf-8") as fp:
        json.dump(manifest, fp, ensure_ascii=False, indent=2)

    print(f"\n[SUMMARY] 激活图标 {used}/5，备份 item 图标 {copied_all} 个")
    print(f"[DONE] 各目录文件数: {manifest['folders']}")

if __name__ == "__main__":
    main()
