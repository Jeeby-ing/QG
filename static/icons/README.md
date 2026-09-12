# 资源图标（方舟真图放这里）

Quest-log 的资源栏与奖励弹窗已接好「本地优先、真图自动替换」逻辑：
只要把对应 PNG 放到本目录，刷新即可自动替换现有的矢量占位图标，无需改代码。

## 当前已激活的 5 个图标（来自 yuanyan3060/ArknightsGameResource）

| 文件名 | 对应资源 | 方舟 iconId（item 表） | 来源文件 |
|--------|----------|------------------------|----------|
| `lungmen.png` | 龙门币 | `GOLD` (itemId: 4001) | `item/GOLD.png` |
| `orundum.png` | 合成玉 | `DIAMOND_SHD` (itemId: 4003) | `item/DIAMOND_SHD.png` |
| `source_stone.png` | 源石（至纯源石） | `DIAMOND` (itemId: 4002) | `item/DIAMOND.png` |
| `sanity.png` | 理智 | `AP_GAMEPLAY` | `item/AP_GAMEPLAY.png` |
| `exp.png` | 经验值 | `EXP_PLAYER` (itemId: 5001) | `item/EXP_PLAYER.png` |

- 全部为 **183×183 透明背景 RGBA PNG**，已验证。
- 建议尺寸：透明背景方图即可，前端 `object-fit:contain` 自适应。
- 若某文件缺失或加载失败，自动回退到内联 SVG 占位图（不会破图）。

## 资源来源仓库

**yuanyan3060/ArknightsGameResource**（已浅克隆到 `assets-source/`）：
- `item/`：1307 个游戏内物品图标 PNG（含上述货币图标）
- `avatar/` 2201、`portrait/` 1375、`skin/` 1380、`enemy/` 1748、`skill/` 1668、`map/` 3055、`building_skill/` 544、`item_rarity_img/` 6
- 这些都是**游戏内解包美术资源**，透明背景，适合直接做 UI 图标。

> 注：`Kengxxiao/ArknightsGameData` 是纯 JSON 文本仓库，**不含 PNG**，只用于查 iconId 名称映射。
> 早期 `GamePress`/`PRTS` 下载的非透明背景版本已移出本目录，存于 `assets-source/_prts_leftovers/`。

## 目录结构

```
Quest-log/
├─ static/icons/                 ← 前端实际使用的图标（仅 5 个激活）
│  ├─ lungmen.png / orundum.png / source_stone.png / sanity.png / exp.png
│  └─ README.md
└─ assets-source/                ← 克隆下来的完整方舟资源（暂时不用的都在这里）
   ├─ item/                       ← 全部 1307 个物品图标（原始 iconId 命名）
   ├─ avatar/ portrait/ skin/ enemy/ skill/ map/ building_skill/ item_rarity_img/
   ├─ _all_items/                 ← item/ 全量备份副本
   ├─ _prts_leftovers/            ← PRTS/GamePress 早期非透明遗留图标
   ├─ manifest.json               ← 各目录文件数清单
   └─ organize_assets.py          ← 重新提取/整理脚本
```

## 重新整合 / 增换图标

1. 想换其他资源图标（如干员头像、材料），直接从 `assets-source/<目录>/` 复制对应 PNG 到 `static/icons/`，按前端需要的名字命名即可（前端 `data-res-icon` 决定引用名）。
2. 重新跑提取脚本：`python3 organize_assets.py`（会从 `assets-source/item/` 重新覆盖 5 个激活图标并刷新备份）。
3. 浏览器 **Ctrl+F5** 硬刷新页面即可生效。
