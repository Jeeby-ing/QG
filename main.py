import asyncio
import hashlib
import json
import random
import re
import sqlite3
import os
import subprocess
import threading
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request, Query
from fastapi.responses import JSONResponse, FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, validator
import mimetypes

# 壁纸软件接入：检测并控制本机 Wallpaper Engine / Lively Wallpaper
from wallpaper_software import detect_wallpaper_software, apply_wallpaper, get_wallpaper_entry

# ---------- 数据库初始化 ----------
DB_PATH = "quest_log.db"
STATIC_DIR = "static"
BADGE_DIR = os.path.join(STATIC_DIR, "badges")
os.makedirs(BADGE_DIR, exist_ok=True)


def get_db_connection():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 10000")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


@contextmanager
def db_cursor():
    conn = get_db_connection()
    try:
        yield conn.cursor()
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ------------------------------------------------------------
#  预置蚀刻章（对齐方舟的「蚀刻章套组」：按套组分类、每套多枚、逐级点亮）
#  tuple = (id, name, description, condition_type, condition_value,
#           reward_exp, reward_lungmen, icon, color, tier)
#    · icon  = Font Awesome 类名。**每枚都不一样** —— 之前全站统一用 fa-award，
#              66 枚章长成同一个样子，用户直接说"不喜欢这个统一的勋章图标"。
#    · color = 该枚的主题色（图标发光 / 卡片描边）
#    · tier  = bronze | silver | gold | diamond  （外圈材质，体现难度档位）
# ------------------------------------------------------------
TIER_METAL = {
    "bronze":  "#c08a54",
    "silver":  "#c9d2dd",
    "gold":    "#e8b818",
    "diamond": "#8fd0ff",
}

PRESET_ACHIEVEMENTS = [
    # ── 基建奖章 · 创建任务 ─────────────────────────────
    ("first_task",  "初次启程",   "创建第一个任务",     "task_count_created", 1,   10,  0,   "fa-seedling",        "#7fbf7f", "bronze"),
    ("create_5",    "渐入佳境",   "创建 5 个任务",      "task_count_created", 5,   30,  0,   "fa-leaf",            "#7fbf7f", "bronze"),
    ("create_10",   "十全十美",   "创建 10 个任务",     "task_count_created", 10,  50,  0,   "fa-list-check",      "#7fbf7f", "silver"),
    ("create_25",   "规划者",     "创建 25 个任务",     "task_count_created", 25,  120, 0,   "fa-clipboard-list",  "#7fbf7f", "silver"),
    ("create_50",   "任务大师",   "创建 50 个任务",     "task_count_created", 50,  200, 0,   "fa-diagram-project","#7fbf7f", "gold"),
    ("create_100",  "百川归海",   "创建 100 个任务",    "task_count_created", 100, 400, 0,   "fa-layer-group",     "#7fbf7f", "gold"),
    ("create_250",  "蓝图构筑",   "创建 250 个任务",    "task_count_created", 250, 900, 0,   "fa-drafting-compass","#7fbf7f","diamond"),

    # ── 成长奖章 · 完成任务 ─────────────────────────────
    ("complete_first", "初次完成",  "完成第一个任务",   "task_count_completed", 1,   20,  0,   "fa-circle-check",    "#4a90e0", "bronze"),
    ("complete_5",     "旗开得胜",  "完成 5 个任务",    "task_count_completed", 5,   60,  0,   "fa-flag",            "#4a90e0", "bronze"),
    ("complete_10",    "小有成就",  "完成 10 个任务",   "task_count_completed", 10,  100, 0,   "fa-thumbs-up",       "#4a90e0", "silver"),
    ("complete_25",    "步履不停",  "完成 25 个任务",   "task_count_completed", 25,  220, 0,   "fa-shoe-prints",     "#4a90e0", "silver"),
    ("complete_50",    "任务达人",  "完成 50 个任务",   "task_count_completed", 50,  500, 0,   "fa-medal",           "#4a90e0", "gold"),
    ("complete_100",   "百炼成钢",  "完成 100 个任务",  "task_count_completed", 100, 1000,0,   "fa-hammer",          "#4a90e0", "gold"),
    ("complete_200",   "千锤百炼",  "完成 200 个任务",  "task_count_completed", 200, 2000,0,   "fa-fire",            "#4a90e0", "gold"),
    ("complete_500",   "功不唐捐",  "完成 500 个任务",  "task_count_completed", 500, 5000,0,   "fa-trophy",          "#4a90e0", "diamond"),

    # ── 章节奖章 · 主线推进 ─────────────────────────────
    ("main_1",   "启程",     "完成第一个主线任务", "task_count_completed_main", 1,  30,  0,  "fa-play",           "#e8b818", "bronze"),
    ("main_10",  "主线推进者","完成 10 个主线任务", "task_count_completed_main", 10, 150, 0,  "fa-mountain",       "#e8b818", "silver"),
    ("main_25",  "长征",     "完成 25 个主线任务", "task_count_completed_main", 25, 400, 0,  "fa-map",            "#e8b818", "gold"),
    ("main_50",  "旗帜",     "完成 50 个主线任务", "task_count_completed_main", 50, 800, 0,  "fa-flag-checkered", "#e8b818", "gold"),
    ("main_100", "传奇",     "完成 100 个主线任务","task_count_completed_main", 100,2000,0,  "fa-crown",          "#e8b818", "diamond"),

    # ── 记录奖章 · 支线探索 ─────────────────────────────
    ("side_1",   "侧身而过", "完成第一个支线任务", "task_count_completed_side", 1,  10,  0,  "fa-feather",   "#a080c8", "bronze"),
    ("side_20",  "支线探索者","完成 20 个支线任务", "task_count_completed_side", 20, 150, 0,  "fa-compass",   "#a080c8", "silver"),
    ("side_50",  "行遍四方", "完成 50 个支线任务", "task_count_completed_side", 50, 400, 0,  "fa-map-location-dot", "#a080c8", "gold"),
    ("side_100", "万象拾遗", "完成 100 个支线任务","task_count_completed_side", 100,900, 0,  "fa-gem",       "#a080c8", "diamond"),

    # ── 成长奖章 · 专注时长 ─────────────────────────────
    ("track_1h",   "专注一小时", "累计追踪 1 小时",   "tracking_hours_total", 1,   30,  0,   "fa-hourglass-start", "#22b3c9", "bronze"),
    ("track_5h",   "静水流深",   "累计追踪 5 小时",   "tracking_hours_total", 5,   80,  0,   "fa-stopwatch",       "#22b3c9", "bronze"),
    ("track_10h",  "专注十小时", "累计追踪 10 小时",  "tracking_hours_total", 10,  100, 0,   "fa-clock",           "#22b3c9", "silver"),
    ("track_25h",  "心流",       "累计追踪 25 小时",  "tracking_hours_total", 25,  260, 0,   "fa-water",           "#22b3c9", "silver"),
    ("track_50h",  "专注大师",   "累计追踪 50 小时",  "tracking_hours_total", 50,  500, 0,   "fa-hourglass-half",  "#22b3c9", "gold"),
    ("track_100h", "时间管理",   "累计追踪 100 小时", "tracking_hours_total", 100, 1100,0,   "fa-infinity",        "#22b3c9", "gold"),
    ("track_200h", "刻时者",     "累计追踪 200 小时", "tracking_hours_total", 200, 2400,0,   "fa-hourglass-end",   "#22b3c9", "diamond"),
    ("track_500h", "时间之外",   "累计追踪 500 小时", "tracking_hours_total", 500, 6000,0,   "fa-wand-sparkles",   "#22b3c9", "diamond"),

    # ── 履历奖章 · 连续打卡 ─────────────────────────────
    ("streak_2",   "两日不辍",   "连续 2 天完成任务",  "streak_days", 2,   20,  0,   "fa-forward",         "#e0703a", "bronze"),
    ("streak_3",   "三日之约",   "连续 3 天完成任务",  "streak_days", 3,   50,  0,   "fa-calendar-day",    "#e0703a", "bronze"),
    ("streak_7",   "七日之约",   "连续 7 天完成任务",  "streak_days", 7,   100, 0,   "fa-calendar-week",   "#e0703a", "silver"),
    ("streak_14",  "半月无休",   "连续 14 天完成任务", "streak_days", 14,  220, 0,   "fa-calendar-minus",  "#e0703a", "silver"),
    ("streak_30",  "月度坚持",   "连续 30 天完成任务", "streak_days", 30,  500, 0,   "fa-calendar-check",  "#e0703a", "gold"),
    ("streak_60",  "双月之志",   "连续 60 天完成任务", "streak_days", 60,  1100,0,   "fa-calendar-plus",   "#e0703a", "gold"),
    ("streak_100", "百日之功",   "连续 100 天完成任务","streak_days", 100, 2200,0,   "fa-meteor",          "#e0703a", "diamond"),
    ("streak_365", "岁岁年年",   "连续 365 天完成任务","streak_days", 365, 8000,0,   "fa-sun",             "#e0703a", "diamond"),

    # ── 履历奖章 · 等级 ────────────────────────────────
    ("level_2",   "初露锋芒", "达到 2 级",  "level_reached", 2,   20,  0,  "fa-arrow-up",       "#ffd76a", "bronze"),
    ("level_5",   "崭露头角", "达到 5 级",  "level_reached", 5,   100, 0,  "fa-star",           "#ffd76a", "silver"),
    ("level_10",  "术业专攻", "达到 10 级", "level_reached", 10,  260, 0,  "fa-graduation-cap", "#ffd76a", "silver"),
    ("level_20",  "登堂入室", "达到 20 级", "level_reached", 20,  600, 0,  "fa-lightbulb",      "#ffd76a", "gold"),
    ("level_30",  "学界栋梁", "达到 30 级", "level_reached", 30,  1200,0,  "fa-book-open",      "#ffd76a", "gold"),
    ("level_50",  "一代宗师", "达到 50 级", "level_reached", 50,  2600,0,  "fa-scroll",         "#ffd76a", "diamond"),
    ("level_100", "传说",     "达到 100 级","level_reached", 100, 8000,0,  "fa-dragon",         "#ffd76a", "diamond"),

    # ── 活动奖章 · 干员寻访 ─────────────────────────────
    ("gacha_1",   "第一次寻访", "累计寻访 1 次",   "gacha_draws", 1,   20,  0,   "fa-crosshairs",     "#d43028", "bronze"),
    ("gacha_10",  "十连",       "累计寻访 10 次",  "gacha_draws", 10,  100, 0,   "fa-bullseye",       "#d43028", "bronze"),
    ("gacha_50",  "千里挑一",   "累计寻访 50 次",  "gacha_draws", 50,  400, 0,   "fa-magnifying-glass","#d43028", "silver"),
    ("gacha_100", "百里挑一",   "累计寻访 100 次", "gacha_draws", 100, 700, 0,   "fa-dice",           "#d43028", "silver"),
    ("gacha_300", "寻访专家",   "累计寻访 300 次", "gacha_draws", 300, 1800,0,   "fa-shuffle",        "#d43028", "gold"),
    ("gacha_600", "寻访大师",   "累计寻访 600 次", "gacha_draws", 600, 4000,0,   "fa-wand-magic-sparkles","#d43028","diamond"),

    # ── 活动奖章 · 补给 / 时装 ──────────────────────────
    ("pack_first", "初次购买", "购买第一个礼包",  "gift_pack_purchased", 1,  20,  0,  "fa-box",        "#c9a227", "bronze"),
    ("pack_5",     "补给常客", "购买 5 个礼包",   "gift_pack_purchased", 5,  120, 0,  "fa-box-open",   "#c9a227", "silver"),
    ("pack_10",    "补给大户", "购买 10 个礼包",  "gift_pack_purchased", 10, 260, 0,  "fa-sack-dollar","#c9a227", "gold"),
    ("pack_25",    "罗德岛金主","购买 25 个礼包", "gift_pack_purchased", 25, 700, 0,  "fa-coins",      "#c9a227", "diamond"),
    ("skin_1",     "换身衣服", "拥有第一件时装",  "skins_owned", 1,  30,  0,  "fa-shirt",      "#e07ab0", "bronze"),
    ("skin_5",     "衣柜初成", "拥有 5 件时装",   "skins_owned", 5,  150, 0,  "fa-hat-wizard", "#e07ab0", "silver"),
    ("skin_15",    "时装收藏家","拥有 15 件时装", "skins_owned", 15, 400, 0,  "fa-paintbrush", "#e07ab0", "gold"),
    ("skin_30",    "整装待发", "拥有 30 件时装",  "skins_owned", 30, 900, 0,  "fa-star-half-stroke","#e07ab0","diamond"),

    # ── 成长奖章 · 番茄钟 ───────────────────────────────
    ("pomo_1",   "第一个番茄", "完成 1 次番茄钟",   "pomodoro_count", 1,   20,  0,  "fa-apple-whole", "#6fbf9f", "bronze"),
    ("pomo_10",  "番茄入门",   "完成 10 次番茄钟",  "pomodoro_count", 10,  100, 0,  "fa-mug-hot",     "#6fbf9f", "silver"),
    ("pomo_50",  "番茄熟练工", "完成 50 次番茄钟",  "pomodoro_count", 50,  400, 0,  "fa-bell",        "#6fbf9f", "gold"),
    ("pomo_100", "番茄专家",   "完成 100 次番茄钟", "pomodoro_count", 100, 900, 0,  "fa-utensils",    "#6fbf9f", "diamond"),

    # ── 记录奖章 · 数据 ────────────────────────────────
    ("import_1",  "数据迁移",   "导入一次数据",   "import_count", 1, 30,  0, "fa-file-import",  "#8ab4d8", "bronze"),
    ("import_5",  "数据常客",   "导入 5 次数据",  "import_count", 5, 150, 0, "fa-cloud-arrow-up","#8ab4d8","silver"),
    ("op_1",      "初次招募",   "拥有第一位干员", "operators_owned", 1, 30, 0, "fa-user-astronaut","#7fa8d8","bronze"),
    ("op_20",     "小队成形",   "拥有 20 位干员", "operators_owned", 20, 300, 0,"fa-people-group", "#7fa8d8", "silver"),
    ("op_60",     "满编罗德岛", "拥有 60 位干员", "operators_owned", 60, 900, 0,"fa-users-rectangle","#7fa8d8","gold"),
]


# ------------------------------------------------------------
#  R23：蚀刻章扩充 —— 用户要求「再多一些，最好上百个，有能力的话几百个」。
#
#  上面的 PRESET_ACHIEVEMENTS 是 R21 手写的老表（70 枚）。它的 ID 已经被
#  老库的 achievement_unlocks 引用，所以**一个字都不动**，这里再叠一层
#  按「家族」生成的章，两者在 init_db 里合并写库，最终约 350 枚。
#
#  一个家族 = 一种达成条件，家族里给一串递增阈值 + 一一对应的名字和图标：
#    · 阈值：与老表 (condition_type, condition_value) 撞车的会被自动跳过，
#            同一条条件的同一个数值不会出现两枚章
#    · 名字：手写，家族内不重复
#    · 图标：**逐枚不同**。R21 用户："不喜欢这个统一的勋章图标"，
#            所以除了手写清单，构建时还有一层「已占用就换备用池」的兜底，
#            保证全站不会出现两枚同图标的章
#    · tier：按家族内位置分档（前段 bronze → 末段 diamond），奖励随档位走
# ------------------------------------------------------------
ACHIEVEMENT_FAMILIES = [
    # ── 基建奖章 · 创建任务 ──────────────────────────
    {"type": "task_count_created", "color": "#7fbf7f",
     "thresholds": (2, 3, 7, 15, 20, 35, 75, 150, 200, 300, 400, 500, 750, 1000, 1500, 2000),
     "names": "起笔 草创 提纲挈领 有条不紊 架构初成 擘画蓝图 案牍劳形 积案盈箱 卷帙浩繁 运筹帷幄 经纬万端 万象更新 汗牛充栋 浩如烟海 包罗万象 开天辟地",
     "icons": "fa-pen-nib fa-pencil fa-feather-pointed fa-ruler-combined fa-sitemap fa-list-ul fa-box-archive fa-book fa-book-open-reader fa-chess fa-chess-king fa-chess-queen fa-network-wired fa-warehouse fa-city fa-globe"},

    # ── 成长奖章 · 完成任务 ──────────────────────────
    {"type": "task_count_completed", "color": "#4a90e0",
     "thresholds": (2, 3, 7, 15, 20, 35, 75, 150, 300, 400, 750, 1000, 1500, 2000, 3000),
     "names": "破土 初露端倪 卓有成效 日进有功 渐至佳境 深耕细作 水滴石穿 铁杵成针 跬步千里 功成过半 独当一面 独步天下 万里挑一 登峰造极 无出其右",
     "icons": "fa-check fa-check-double fa-clipboard-check fa-square-check fa-file-circle-check fa-table-cells-large fa-stamp fa-id-badge fa-shield-halved fa-shield-heart fa-certificate fa-ranking-star fa-chart-line fa-chart-simple fa-bars-progress"},

    # ── 章节奖章 · 主线推进 ──────────────────────────
    {"type": "task_count_completed_main", "color": "#e8b818",
     "thresholds": (3, 5, 15, 20, 35, 75, 150, 200, 300, 500),
     "names": "迈步 挺进 越岭 破阵 涉险 攻坚 拔寨 长驱直入 铁流 决胜千里",
     "icons": "fa-person-walking fa-road fa-tree fa-fire-flame-curved fa-burst fa-chess-rook fa-tower-observation fa-jet-fighter fa-truck-fast fa-bullhorn"},

    # ── 记录奖章 · 支线探索 ──────────────────────────
    {"type": "task_count_completed_side", "color": "#a080c8",
     "thresholds": (3, 5, 10, 15, 30, 75, 150, 200, 300, 500),
     "names": "拾遗 岔路 曲径通幽 闲庭信步 顺藤摸瓜 旁征博引 遍地开花 星罗棋布 无远弗届 天涯比邻",
     "icons": "fa-signs-post fa-route fa-tree-city fa-person-hiking fa-magnifying-glass-location fa-bezier-curve fa-satellite-dish fa-earth-asia fa-binoculars fa-location-arrow"},

    # ── 成长奖章 · 专注时长 ──────────────────────────
    {"type": "tracking_hours_total", "color": "#22b3c9",
     "thresholds": (2, 3, 7, 15, 30, 75, 150, 300, 400, 750, 1000, 1500, 2000),
     "names": "静心 沉潜 凝神 心无旁骛 屏息以待 澄怀观道 观照 入定 忘我之境 坐忘 神游太虚 物我两忘 刹那永恒",
     "icons": "fa-brain fa-eye fa-lungs fa-heart-pulse fa-compass-drafting fa-spa fa-peace fa-eye-low-vision fa-microscope fa-hourglass fa-gauge-high fa-atom fa-snowflake"},

    # ── 履历奖章 · 连续打卡 ──────────────────────────
    {"type": "streak_days", "color": "#e0703a",
     "thresholds": (5, 10, 21, 45, 90, 150, 180, 200, 250, 300, 500, 730, 1000),
     "names": "五日之诺 十日之志 廿一日成习 半季不辍 一季之恒 百五之约 半载之诺 双百之铭 四季如一 三百之契 五百之守 两年之恒 千日之誓",
     "icons": "fa-calendar-xmark fa-calendar-days fa-repeat fa-fire-flame-simple fa-calendar fa-hourglass-start fa-sun-plant-wilt fa-mountain-sun fa-tree fa-calendar-plus fa-clock-rotate-left fa-hands-holding-circle fa-circle-nodes"},

    # ── 履历奖章 · 等级 ──────────────────────────────
    {"type": "level_reached", "color": "#ffd76a",
     "thresholds": (3, 4, 7, 12, 15, 25, 35, 40, 60, 70, 80, 90, 110, 120),
     "names": "站稳脚跟 初窥门径 略有小成 熟能生巧 小有所成 行家里手 独树一帜 精进不休 出类拔萃 中流砥柱 登高望远 炉火纯青 大器晚成 无我之境",
     "icons": "fa-arrow-trend-up fa-stairs fa-arrow-up-right-dots fa-chart-column fa-arrow-up-from-bracket fa-person-arrow-up-from-line fa-square-poll-vertical fa-bolt fa-wand-magic fa-tower-broadcast fa-rocket fa-satellite fa-star-of-life fa-meteor"},

    # ── 活动奖章 · 干员寻访 ──────────────────────────
    {"type": "gacha_draws", "color": "#d43028",
     "thresholds": (3, 5, 20, 25, 75, 150, 200, 250, 400, 500, 800, 1000, 1500, 2000),
     "names": "初次试探 手气不错 二十连击 廿五之数 七十五击 百五十抽 双百之抽 两百五十 四百之数 五百之约 八百之期 千抽之诺 千五之约 两千之约",
     "icons": "fa-clover fa-horse-head fa-star fa-dice-d20 fa-dice-d6 fa-dice-five fa-dice-four fa-dice-three fa-dice-two fa-dice-one fa-ring fa-hat-cowboy fa-cow fa-kiwi-bird"},

    # ── 活动奖章 · 补给礼包 ──────────────────────────
    {"type": "gift_pack_purchased", "color": "#c9a227",
     "thresholds": (2, 3, 15, 20, 30, 40, 50, 75, 100, 150, 200),
     "names": "复购一箱 渐成常备 补给十五 二十箱 三十箱 四十箱 五十箱 七十五箱 百箱之储 百五十箱 两百之储",
     "icons": "fa-boxes-stacked fa-box-tissue fa-parachute-box fa-cart-shopping fa-basket-shopping fa-bag-shopping fa-hand-holding-dollar fa-vault fa-dungeon fa-truck-ramp-box fa-cubes"},

    # ── 活动奖章 · 时装收藏 ──────────────────────────
    {"type": "skins_owned", "color": "#e07ab0",
     "thresholds": (2, 3, 8, 10, 20, 25, 40, 50, 75, 100, 150, 200),
     "names": "换洗衣物 三套行头 八件衣裳 十件衣装 二十衣橱 廿五衣橱 四十衣橱 五十衣橱 七十五衣橱 百件典藏 百五典藏 两百典藏",
     "icons": "fa-vest fa-socks fa-mitten fa-glasses fa-user-tie fa-vest-patches fa-key fa-lock-open fa-palette fa-mask fa-swatchbook fa-shoe-prints"},

    # ── 成长奖章 · 番茄钟 ────────────────────────────
    {"type": "pomodoro_count", "color": "#6fbf9f",
     "thresholds": (2, 3, 5, 20, 25, 30, 75, 150, 200, 250, 300, 400, 500, 750, 1000),
     "names": "再度开灶 三颗红果 五颗红果 廿颗红果 廿五红果 三十红果 七十五果 百五十果 两百红果 廿五百果 三百红果 四百红果 五百红果 七百五果 千果满仓",
     "icons": "fa-seedling fa-carrot fa-lemon fa-pepper-hot fa-drumstick-bite fa-bowl-food fa-plate-wheat fa-wheat-awn fa-mortar-pestle fa-blender fa-kitchen-set fa-fire-burner fa-utensil-spoon fa-fish fa-candy-cane"},

    # ── 记录奖章 · 数据迁移 ──────────────────────────
    {"type": "import_count", "color": "#8ab4d8",
     "thresholds": (2, 3, 10, 15, 20, 30, 50, 75, 100),
     "names": "再度迁移 三次导入 十次导入 十五次 二十次 三十次 五十次 七十五次 百次迁徙",
     "icons": "fa-file-arrow-up fa-file-export fa-database fa-server fa-hard-drive fa-cloud-arrow-down fa-right-left fa-arrows-rotate fa-download"},

    # ── 记录奖章 · 干员招募 ──────────────────────────
    {"type": "operators_owned", "color": "#7fa8d8",
     "thresholds": (2, 3, 5, 10, 30, 40, 50, 80, 100, 150, 200, 250, 300),
     "names": "双人小队 三人成行 五人小队 十人建制 三十人 四十人 五十人 八十人 百人团 百五人 两百人 两百五人 三百人满编",
     "icons": "fa-user-plus fa-user-group fa-people-arrows fa-users fa-users-line fa-users-gear fa-person-military-pointing fa-person-military-rifle fa-id-card fa-address-book fa-handshake fa-user-shield fa-user-ninja"},

    # ── 硬仗奖章 · 六星难度任务 ──────────────────────
    {"type": "task_count_completed_6star", "color": "#d43028",
     "thresholds": (1, 3, 5, 10, 15, 20, 30, 50, 75, 100),
     "names": "越级挑战 三次险胜 五次硬仗 十场恶战 十五场血战 二十场死斗 三十场鏖战 五十场决战 七十五场远征 百场史诗",
     "icons": "fa-skull fa-skull-crossbones fa-dragon fa-hippo fa-horse fa-frog fa-spider fa-worm fa-shield-cat fa-shield-dog"},

    # ── 硬仗奖章 · 高优先级任务 ──────────────────────
    {"type": "task_count_completed_high", "color": "#e0703a",
     "thresholds": (1, 3, 5, 10, 20, 30, 50, 75, 100, 150, 200),
     "names": "硬骨头 三块硬骨 五关 十道难关 二十关 三十关 五十关 七十五关 百关 百五关 两百关",
     "icons": "fa-mountain fa-mound fa-volcano fa-hill-rockslide fa-landmark-flag fa-person-falling-burst fa-explosion fa-radiation fa-fire-flame-simple fa-tornado fa-hurricane"},

    # ── 成长奖章 · 追踪次数 ──────────────────────────
    {"type": "tracking_sessions_count", "color": "#22b3c9",
     "thresholds": (1, 5, 10, 25, 50, 100, 150, 200, 300, 500),
     "names": "首次守时 五次守时 十次守时 廿五次守时 五十次守时 百次守时 百五十守时 两百守时 三百守时 五百守时",
     "icons": "fa-bell fa-bell-slash fa-stopwatch-20 fa-business-time fa-calendar-check fa-list-check fa-thumbtack fa-clock-rotate-left fa-calendar fa-folder-open"},

    # ── 成长奖章 · 番茄钟累计分钟 ────────────────────
    {"type": "pomodoro_minutes_total", "color": "#6fbf9f",
     "thresholds": (60, 120, 300, 600, 1200, 2400, 3600, 6000, 10000, 20000),
     "names": "一小时番茄 两小时番茄 五小时番茄 十小时番茄 廿小时番茄 四十小时番茄 六十小时番茄 百小时番茄 两百小时番茄 三百小时番茄",
     "icons": "fa-hourglass fa-hourglass-start fa-business-time fa-gauge-high fa-atom fa-flask fa-jar fa-fire fa-fire-burner fa-mortar-pestle"},

    # ── 记录奖章 · 仓库收藏 ──────────────────────────
    {"type": "warehouse_kinds", "color": "#8ab4d8",
     "thresholds": (1, 3, 5, 10, 15, 20, 25, 30, 40, 50),
     "names": "第一件藏品 三件藏品 五件藏品 十件藏品 十五件 二十件 廿五件 三十件 四十件 五十件藏品",
     "icons": "fa-cube fa-cubes fa-archive fa-cheese fa-egg fa-vial fa-flask fa-jar fa-bottle-water fa-prescription-bottle"},

    # ── 基建奖章 · 子任务拆解 ────────────────────────
    {"type": "subtask_count", "color": "#7fbf7f",
     "thresholds": (1, 5, 10, 25, 50, 100, 150, 200, 300),
     "names": "拆解第一刀 五步拆解 十步拆解 廿五步 五十步 百步拆解 百五十步 两百步 三百步",
     "icons": "fa-code-fork fa-folder-tree fa-object-ungroup fa-bars-staggered fa-indent fa-outdent fa-diagram-successor fa-share-nodes fa-diagram-next"},

    # ── 章节奖章 · 长线战役 ──────────────────────────
    {"type": "campaign_count", "color": "#e8b818",
     "thresholds": (1, 3, 5, 10, 20, 30, 50, 75, 100),
     "names": "第一役 三线并举 五线并举 十役 二十役 三十役 五十役 七十五役 百役之章",
     "icons": "fa-chess-board fa-map-location fa-torii-gate fa-chess-pawn fa-chess-knight fa-chess-bishop fa-chess-king fa-chess-queen fa-chess"},

    # ── 活动奖章 · 六星干员 ──────────────────────────
    {"type": "six_star_owned", "color": "#d43028",
     "thresholds": (1, 2, 3, 5, 8, 10, 15, 20, 30, 50),
     "names": "首位六星 六星成双 三位六星 五位六星 八位六星 十位六星 十五位六星 二十位六星 三十位六星 五十位六星",
     "icons": "fa-bolt-lightning fa-diamond fa-crown fa-gem fa-star fa-certificate fa-award fa-medal fa-trophy fa-solar-panel"},

    # ── 活动奖章 · 五星干员 ──────────────────────────
    {"type": "five_star_owned", "color": "#ffd76a",
     "thresholds": (1, 2, 3, 5, 8, 10, 15, 20, 30, 50),
     "names": "首位五星 五星成双 三位五星 五位五星 八位五星 十位五星 十五位五星 二十位五星 三十位五星 五十位五星",
     "icons": "fa-star-half fa-star-half-stroke fa-sun fa-moon fa-cloud-sun fa-fan fa-leaf fa-fire-flame-simple fa-snowflake fa-wind"},

    # ── 记录奖章 · 任务备注 ──────────────────────────
    {"type": "notes_written", "color": "#a080c8",
     "thresholds": (1, 5, 10, 25, 50, 100, 150, 200, 300),
     "names": "第一笔注 五则手记 十则手记 廿五则 五十则 百则手记 百五十则 两百则 三百则",
     "icons": "fa-note-sticky fa-pen fa-pen-clip fa-marker fa-highlighter fa-pen-fancy fa-file-lines fa-file-pen fa-bookmark"},

    # ── 财富奖章 · 累计龙门币 ────────────────────────
    {"type": "lungmen_earned", "color": "#c9a227",
     "thresholds": (10000, 50000, 100000, 250000, 500000, 1000000, 2500000, 5000000),
     "names": "万贯 五万贯 十万贯 廿五万贯 五十万贯 百万贯 两百五十万 五百万贯",
     "icons": "fa-money-bill fa-money-bill-wave fa-money-bill-trend-up fa-money-bill-transfer fa-wallet fa-piggy-bank fa-scale-balanced fa-gem"},

    # ── 财富奖章 · 累计合成玉 ────────────────────────
    {"type": "orundum_earned", "color": "#d43028",
     "thresholds": (1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000),
     "names": "千玉 五千玉 万玉 两万五千玉 五万玉 十万玉 廿五万玉 五十万玉",
     "icons": "fa-circle-dot fa-circle fa-ring fa-bahai fa-yin-yang fa-spinner fa-compact-disc fa-record-vinyl"},
]

# 图标兜底池：手写清单里撞车（或不够用）时，从这里按顺序取还没被占用的。
# 全部取自项目自带 Font Awesome 6 Free Solid，构建后会有脚本逐枚校验。
ACHIEVEMENT_ICON_SPARE = """
fa-sun fa-cloud fa-star fa-heart fa-bolt fa-fire fa-droplet fa-leaf fa-tree fa-seedling
fa-mountain fa-water fa-wind fa-snowflake fa-moon fa-rocket fa-anchor fa-compass fa-map fa-globe
fa-cube fa-cubes fa-box fa-gift fa-tag fa-tags fa-flag fa-bookmark fa-bell fa-bullhorn
fa-eye fa-hand fa-hands fa-fist-raised fa-thumbs-up fa-award fa-medal fa-trophy fa-crown fa-gem
fa-shield fa-shield-halved fa-sword fa-khanda fa-crosshairs fa-bullseye fa-target fa-location-dot fa-pin fa-thumbtack
fa-clock fa-hourglass fa-stopwatch fa-calendar fa-calendar-day fa-calendar-week fa-list fa-list-check fa-clipboard fa-clipboard-list
fa-pen fa-pencil fa-marker fa-highlighter fa-eraser fa-ruler fa-compass-drafting fa-scissors fa-paperclip fa-link
fa-chart-line fa-chart-bar fa-chart-pie fa-chart-area fa-diagram-project fa-sitemap fa-network-wired fa-share-nodes fa-code-branch fa-cubes-stacked
fa-user fa-user-group fa-users fa-people-group fa-person fa-person-walking fa-person-running fa-person-hiking fa-person-swimming fa-person-skiing
fa-heart-pulse fa-stethoscope fa-pills fa-syringe fa-briefcase-medical fa-hospital fa-lungs fa-brain fa-bone fa-tooth
fa-flask fa-vial fa-microscope fa-atom fa-dna fa-dice fa-dice-d20 fa-puzzle-piece fa-chess fa-chess-knight
fa-graduation-cap fa-school fa-book fa-book-open fa-bookmark fa-scroll fa-feather fa-feather-pointed fa-pen-nib fa-ink
fa-camera fa-image fa-images fa-palette fa-brush fa-paintbrush fa-wand-magic fa-wand-sparkles fa-sparkles fa-star-of-life
fa-music fa-headphones fa-microphone fa-volume-high fa-play fa-pause fa-forward fa-backward fa-shuffle fa-repeat
fa-house fa-building fa-city fa-warehouse fa-industry fa-factory fa-store fa-shop fa-cart-shopping fa-basket-shopping
fa-car fa-truck fa-truck-fast fa-train fa-plane fa-ship fa-bicycle fa-motorcycle fa-rocket fa-satellite
fa-key fa-lock fa-lock-open fa-unlock fa-fingerprint fa-id-card fa-address-card fa-passport fa-stamp fa-certificate
fa-coins fa-sack-dollar fa-wallet fa-piggy-bank fa-money-bill fa-receipt fa-scale-balanced fa-hand-holding-dollar fa-vault fa-calculator
fa-sun-plant-wilt fa-cloud-sun fa-cloud-rain fa-cloud-bolt fa-umbrella fa-temperature-high fa-temperature-low fa-smog fa-tornado fa-hurricane
fa-dragon fa-hippo fa-horse fa-frog fa-spider fa-worm fa-fish fa-dove fa-crow fa-feather
fa-egg fa-carrot fa-lemon fa-pepper-hot fa-drumstick-bite fa-bowl-food fa-plate-wheat fa-wheat-awn fa-mortar-pestle fa-blender
fa-mug-hot fa-apple-whole fa-candy-cane fa-cookie fa-cake-candles fa-ice-cream fa-pizza-slice fa-burger fa-utensils fa-kitchen-set
fa-tent fa-campground fa-fire-flame-curved fa-fire-flame-simple fa-fire-burner fa-volcano fa-mound fa-hill-rockslide fa-landmark-flag fa-explosion
fa-skull fa-skull-crossbones fa-ghost fa-robot fa-alien fa-meteor fa-satellite-dish fa-tower-broadcast fa-tower-observation fa-broadcast-tower
fa-route fa-signs-post fa-tree-city fa-binoculars fa-magnifying-glass fa-magnifying-glass-location fa-earth-asia fa-earth-americas fa-location-arrow fa-crosshairs
fa-bars-progress fa-bars-staggered fa-list-tree fa-folder-tree fa-object-ungroup fa-indent fa-outdent fa-diagram-lean-canvas fa-diagram-next fa-diagram-successor
fa-carrot fa-clover fa-horse-head fa-ring fa-hat-cowboy fa-cow fa-kiwi-bird fa-fish-fins fa-shrimp fa-bug
fa-note-sticky fa-file-lines fa-file-pen fa-file-circle-check fa-file-arrow-up fa-file-export fa-download fa-upload fa-server fa-database
fa-square-check fa-check fa-check-double fa-clipboard-check fa-stamp fa-id-badge fa-shield-heart fa-ranking-star fa-chart-simple fa-table-cells-large
"""


# 生成章时用来拼描述文案：{条件类型: (中文说明, 单位)}
ACH_TYPE_META = {
    "task_count_created":         ("创建任务", "个"),
    "task_count_completed":       ("完成任务", "个"),
    "task_count_completed_main":  ("完成主线任务", "个"),
    "task_count_completed_side":  ("完成支线任务", "个"),
    "task_count_completed_6star": ("完成 6★ 难度任务", "个"),
    "task_count_completed_high":  ("完成高优先级任务", "个"),
    "tracking_hours_total":       ("累计追踪", "小时"),
    "tracking_sessions_count":    ("追踪", "次"),
    "streak_days":                ("连续打卡", "天"),
    "level_reached":              ("达到等级", "级"),
    "gacha_draws":                ("累计寻访", "次"),
    "gift_pack_purchased":        ("购买礼包", "个"),
    "skins_owned":                ("拥有时装", "件"),
    "pomodoro_count":             ("完成番茄钟", "次"),
    "pomodoro_minutes_total":     ("番茄钟累计", "分钟"),
    "import_count":               ("导入数据", "次"),
    "operators_owned":            ("拥有干员", "位"),
    "six_star_owned":             ("拥有六星干员", "位"),
    "five_star_owned":            ("拥有五星干员", "位"),
    "warehouse_kinds":            ("仓库藏品", "种"),
    "subtask_count":              ("创建子任务", "个"),
    "campaign_count":             ("创建长线战役", "场"),
    "notes_written":              ("填写任务备注", "则"),
    "lungmen_earned":             ("累计获得龙门币", ""),
    "orundum_earned":             ("累计获得合成玉", ""),
}


def _ach_tier_for(rank: int, total: int) -> str:
    """家族内位置 → 档位。前段铜、中段银、后段金、末段钻。"""
    if total <= 1:
        return "bronze"
    r = rank / (total - 1)
    if r < 0.25:
        return "bronze"
    if r < 0.55:
        return "silver"
    if r < 0.82:
        return "gold"
    return "diamond"


_ACH_REWARD_BY_TIER = {"bronze": 30, "silver": 95, "gold": 280, "diamond": 760}


def _ach_reward_exp(tier: str, rank: int, total: int) -> int:
    """奖励经验：同档位里越靠后的阈值给得越多，取整到 5。"""
    base = _ACH_REWARD_BY_TIER.get(tier, 30)
    ratio = rank / max(1, total - 1)
    return max(10, int(round(base * (1.0 + 1.2 * ratio) / 5.0) * 5))


def _load_fa_icon_names() -> set:
    """读出项目自带 Font Awesome 里**真实存在**的图标名（.fa-xxx:before）。

    蚀刻章的图标是按名字写死在预设表里的，写错一个，卡片上就是一个空白方块 ——
    所以构建时对着 CSS 核一遍。读不到 CSS 时返回空集，表示「不校验」，
    不能让一个样式文件读失败把整个服务带崩。
    """
    css_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            STATIC_DIR, "vendor", "fontawesome", "all.min.css")
    try:
        with open(css_path, encoding="utf-8", errors="replace") as fh:
            css = fh.read()
    except OSError:
        return set()
    return set(re.findall(r"\.fa-([a-z0-9\-]+):before", css))


_FA_ICON_NAMES = _load_fa_icon_names()


def _build_family_achievements():
    """把 ACHIEVEMENT_FAMILIES 摊平成与 PRESET_ACHIEVEMENTS 同构的 tuple 表。

    同时做三件事：
      1. 跳过与老表 (condition_type, condition_value) 重复的阈值 —— 同一条条件
         的同一个数值只该有一枚章（老表优先，因为它的 ID 被老库引用着）。
      2. 图标全局唯一 —— 取自用过的就换备用池里的下一枚。
      3. 图标必须真实存在 —— 拿 CSS 里的图标名核验，名字写错（或者这个 FA 版本
         根本没有）就换备用池，避免渲染成空白方块。
    """
    used_icons = {row[7] for row in PRESET_ACHIEVEMENTS}
    used_pairs = {(row[3], row[4]) for row in PRESET_ACHIEVEMENTS}
    used_ids = {row[0] for row in PRESET_ACHIEVEMENTS}
    spare = ACHIEVEMENT_ICON_SPARE.split()
    spare_idx = 0

    def _usable(cls: str) -> bool:
        if not cls or not cls.startswith("fa-") or cls in used_icons:
            return False
        if _FA_ICON_NAMES and cls[3:] not in _FA_ICON_NAMES:
            return False      # 这个 FA 版本里没有这枚图标
        return True

    def _take_icon(preferred: str) -> str:
        nonlocal spare_idx
        if _usable(preferred):
            used_icons.add(preferred)
            return preferred
        while spare_idx < len(spare):
            cand = spare[spare_idx]
            spare_idx += 1
            if _usable(cand):
                used_icons.add(cand)
                return cand
        # 池子也见底了：加序号硬去重（正常不会走到这里）
        n = 2
        base = preferred or "fa-star"
        while f"{base}-{n}" in used_icons:
            n += 1
        used_icons.add(f"{base}-{n}")
        return f"{base}-{n}"

    built = []
    for fam in ACHIEVEMENT_FAMILIES:
        ctype = fam["type"]
        color = fam["color"]
        names = fam["names"].split()
        icons = fam["icons"].split()
        entries = []
        for i, val in enumerate(fam["thresholds"]):
            if (ctype, val) in used_pairs:
                continue          # 老表已经有同条件同数值的章，跳过
            entries.append((val,
                            names[i] if i < len(names) else f"{ctype} {val}",
                            icons[i] if i < len(icons) else ""))
        total = len(entries)
        for rank, (val, nm, ic) in enumerate(entries):
            tier = _ach_tier_for(rank, total)
            slug = str(val).replace(".", "_")
            aid = f"{ctype}__{slug}"
            if aid in used_ids:
                aid = f"{ctype}__{slug}__x"
            used_ids.add(aid)
            used_pairs.add((ctype, val))
            label, unit = ACH_TYPE_META.get(ctype, (ctype, ""))
            desc = f"{label} {val} {unit}".strip() if unit else f"{label} {val}"
            built.append((aid, nm, desc, ctype, val,
                          _ach_reward_exp(tier, rank, total), 0,
                          _take_icon(ic), color, tier))
    return built


EXTENDED_ACHIEVEMENTS = _build_family_achievements()
ALL_PRESET_ACHIEVEMENTS = PRESET_ACHIEVEMENTS + EXTENDED_ACHIEVEMENTS



def init_db():
    with db_cursor() as cur:
        cur.executescript("""
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            parent_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            priority INTEGER DEFAULT 1 CHECK(priority BETWEEN 1 AND 6),
            task_line TEXT DEFAULT 'side' CHECK(task_line IN ('main','side')),
            status TEXT DEFAULT 'todo' CHECK(status IN ('todo','in_progress','paused','done','cancelled')),
            progress_mode TEXT DEFAULT 'auto' CHECK(progress_mode IN ('auto','manual','count')),
            progress REAL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
            target_value REAL CHECK(target_value IS NULL OR target_value > 0),
            current_value REAL CHECK(current_value IS NULL OR current_value >= 0),
            prerequisite_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
            planned_start TEXT,
            planned_end TEXT,
            due_date TEXT,
            repeat_type TEXT CHECK(repeat_type IN ('daily','weekly','monthly','custom')),
            repeat_interval INTEGER CHECK(repeat_interval IS NULL OR repeat_interval > 0),
            repeat_next_date TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            completed_at TEXT,
            is_tracked INTEGER DEFAULT 0 CHECK(is_tracked IN (0,1)),
            reward_exp REAL DEFAULT 0,
            reward_lungmen REAL DEFAULT 0,
            reward_source_stone REAL DEFAULT 0,
            reward_orundum REAL DEFAULT 0,
            drop_config TEXT,
            reward_claimed INTEGER DEFAULT 0 CHECK(reward_claimed IN (0,1)),
            notes TEXT DEFAULT '',
            sort_order REAL DEFAULT 0,
            archived INTEGER DEFAULT 0 CHECK(archived IN (0,1)),
            deleted INTEGER DEFAULT 0 CHECK(deleted IN (0,1))
        );

        CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
        CREATE INDEX IF NOT EXISTS idx_tasks_line ON tasks(task_line);
        CREATE INDEX IF NOT EXISTS idx_tasks_tracked ON tasks(is_tracked);
        CREATE INDEX IF NOT EXISTS idx_tasks_deleted ON tasks(deleted);
        CREATE INDEX IF NOT EXISTS idx_tasks_archived ON tasks(archived);
        CREATE INDEX IF NOT EXISTS idx_tasks_prereq ON tasks(prerequisite_id);

        CREATE TABLE IF NOT EXISTS resources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resource_type TEXT NOT NULL CHECK(resource_type IN ('exp','source_stone','lungmen','orundum','sanity')),
            current_value REAL DEFAULT 0 CHECK(current_value >= 0),
            max_value REAL,
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            UNIQUE(resource_type)
        );

        CREATE TABLE IF NOT EXISTS resource_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resource_type TEXT NOT NULL,
            amount REAL NOT NULL,
            reason TEXT NOT NULL,
            ref_id INTEGER,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );

        CREATE TABLE IF NOT EXISTS inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            material_type TEXT NOT NULL,
            qty REAL DEFAULT 0 CHECK(qty >= 0),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            UNIQUE(material_type)
        );

        -- 干员寻访（抽卡）：仅此模块可产出「干员信物」。
        -- operator_records 记录每位干员的持有份数与信物数；信物只在抽到重复干员时 +1。
        CREATE TABLE IF NOT EXISTS operator_records (
            operator_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            rarity INTEGER NOT NULL CHECK(rarity IN (2,3,4,5,6)),
            copies INTEGER DEFAULT 0 CHECK(copies >= 0),
            tokens INTEGER DEFAULT 0 CHECK(tokens >= 0),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );

        -- 抽卡保底计数：total_pulls 累计抽数；since_last_6star 距上次出 6★ 的抽数（用于 50 抽保底）。
        CREATE TABLE IF NOT EXISTS gacha_pity (
            key TEXT PRIMARY KEY,
            value INTEGER NOT NULL DEFAULT 0
        );

        -- 已购买的干员时装（皮肤）。皮肤目录由 OPERATOR_POOL 推导，只需记录已购。
        CREATE TABLE IF NOT EXISTS skins_owned (
            skin_id TEXT PRIMARY KEY,
            operator_id TEXT NOT NULL,
            operator_name TEXT NOT NULL,
            skin_name TEXT NOT NULL,
            cost_source_stone INTEGER NOT NULL,
            purchased_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );

        CREATE TABLE IF NOT EXISTS gift_packs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            pack_type TEXT CHECK(pack_type IN ('fixed','random','mixed')),
            content_config TEXT NOT NULL,
            cost_source_stone REAL NOT NULL CHECK(cost_source_stone >= 0),
            rarity TEXT CHECK(rarity IN ('common','rare','epic','legendary')),
            available_from TEXT NOT NULL,
            available_until TEXT NOT NULL,
            purchased INTEGER DEFAULT 0 CHECK(purchased IN (0,1)),
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );

        CREATE TABLE IF NOT EXISTS achievements (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            condition_type TEXT NOT NULL,
            condition_value REAL NOT NULL,
            condition_params TEXT,
            reward_exp REAL DEFAULT 0,
            reward_lungmen REAL DEFAULT 0,
            reward_source_stone REAL DEFAULT 0,
            reward_orundum REAL DEFAULT 0,
            badge_config TEXT,
            hidden INTEGER DEFAULT 0 CHECK(hidden IN (0,1)),
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );

        CREATE TABLE IF NOT EXISTS achievement_unlocks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            achievement_id TEXT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
            unlocked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS tracking_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            started_at TEXT NOT NULL,
            ended_at TEXT,
            duration_seconds INTEGER CHECK(duration_seconds IS NULL OR duration_seconds >= 0),
            focus_mode INTEGER DEFAULT 0 CHECK(focus_mode IN (0,1))
        );

        CREATE TABLE IF NOT EXISTS pomodoro_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
            kind TEXT NOT NULL CHECK(kind IN ('focus','break')),
            planned_seconds INTEGER NOT NULL DEFAULT 1500 CHECK(planned_seconds > 0),
            started_at TEXT NOT NULL,
            ended_at TEXT,
            status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','cancelled')),
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );

        CREATE TABLE IF NOT EXISTS reality_rewards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            target_type TEXT NOT NULL CHECK(target_type IN ('level','exp','tasks_completed','streak_days','tracking_hours','custom')),
            target_value REAL NOT NULL CHECK(target_value > 0),
            current_value REAL DEFAULT 0 CHECK(current_value >= 0),
            reward_text TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','achieved','claimed','archived')),
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            achieved_at TEXT,
            claimed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            color TEXT DEFAULT 'grey'
        );

        CREATE TABLE IF NOT EXISTS task_tags (
            task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            PRIMARY KEY (task_id, tag_id)
        );

        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK(id = 1),
            settings_json TEXT NOT NULL
        );
        """)

        # 迁移：tasks 增加 track 字段（daily=日常任务 / campaign=主线战役）
        cur.execute("PRAGMA table_info(tasks)")
        _cols = [r['name'] for r in cur.fetchall()]
        if 'track' not in _cols:
            cur.execute("ALTER TABLE tasks ADD COLUMN track TEXT DEFAULT 'daily' CHECK(track IN ('daily','campaign'))")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_tasks_track ON tasks(track)")

        # 初始资源
        # 理智上限不再写死 120 —— 它由博士等级决定（见 sanity_cap），
        # 新库从 1 级起算 = 82；老库下面还有一次 sync 兜底。
        resources = [
            ('exp', 0, None),
            ('source_stone', 0, None),
            ('lungmen', 0, None),
            ('orundum', 0, None),
            ('sanity', sanity_cap(1), sanity_cap(1))
        ]
        for r in resources:
            cur.execute("INSERT OR IGNORE INTO resources (resource_type, current_value, max_value) VALUES (?, ?, ?)", r)

        # 默认设置
        default_settings = {
            "tracking_panel_collapsed": False,
            "focus_mode": False,
            "quick_track": False,
            "show_side_when_tracking_main": False,
            "show_main_when_tracking_side": False,
            "show_sanity": True,
            "pomodoro_focus_minutes": 25,
            "pomodoro_break_minutes": 5,
            "wallpaper_url": "",
            "wallpaper_type": "none",
            "theme": "dark",
            "import_count": 0,
            "level_rewards_claimed": [],
            "username": "博士",
            "categories": ["学习", "健身", "工作", "生活", "其他"],
            "pomodoro_sound": "on"
        }
        cur.execute("INSERT OR IGNORE INTO settings (id, settings_json) VALUES (1, ?)", (json.dumps(default_settings),))

        # 迁移：已存在的设置补充 categories 字段（受管分类清单）
        cur.execute("SELECT settings_json FROM settings WHERE id = 1")
        _srow = cur.fetchone()
        if _srow:
            _s = json.loads(_srow[0])
            if 'categories' not in _s:
                _s['categories'] = ["学习", "健身", "工作", "生活", "其他"]
                cur.execute("UPDATE settings SET settings_json = ? WHERE id = 1", (json.dumps(_s),))

        # 预置蚀刻章：先 INSERT OR IGNORE 保住解锁记录，再无条件 UPDATE 把定义刷新成最新
        # （老库里这批章的 badge_config 是 NULL → 渲染成全站同一个 fa-award，必须刷）
        # R23：这里换成 ALL_PRESET_ACHIEVEMENTS = R21 手写老表 + 家族生成的新章（约 350 枚）。
        for (aid, name, desc, ctype, cval, exp, lm, icon, color, tier) in ALL_PRESET_ACHIEVEMENTS:
            conf = json.dumps({"icon": icon, "color": color, "tier": tier,
                               "metal": TIER_METAL.get(tier, TIER_METAL["bronze"])},
                              ensure_ascii=False)
            cur.execute("""
                INSERT OR IGNORE INTO achievements
                (id, name, description, condition_type, condition_value,
                 reward_exp, reward_lungmen, reward_source_stone, reward_orundum, badge_config, hidden)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 0)
            """, (aid, name, desc, ctype, cval, exp, lm, conf))
            cur.execute("""
                UPDATE achievements
                SET name = ?, description = ?, condition_type = ?, condition_value = ?,
                    reward_exp = ?, reward_lungmen = ?, badge_config = ?
                WHERE id = ?
            """, (name, desc, ctype, cval, exp, lm, conf, aid))

        generate_weekly_packs(cur)

        # 理智上限迁移：老库把 max_value 写死成 120，这里按当前博士等级重算一次。
        # 每次启动都跑一遍，成本是一次 SELECT + 最多一次 UPDATE。
        try:
            sync_sanity_cap(cur, calculate_level(get_resource(cur, 'exp')))
        except Exception:
            pass

        # 老数据补点亮：创建/完成/专注/连续这些是"历史累计值"，只有发生新的完成事件才会
        # 触发 check_achievement —— 于是老用户进来看到的是一片全灭（用户："我怎么不知道我做了九个"）。
        # 启动时统一扫一遍，把已达成的直接补上。
        sweep_achievements(cur)


# ------------------------------------------------------------
#  礼包体系（对齐明日方舟原版「组合包」分类）
#  原版常驻组合包大致分为：新人组合包、罗德岛补给卡（月卡）、每周养成组合包、
#  专业强化包、新人养成组合包、新人寻访组合包（十连券）、每月寻访组合包（大月卡）。
#  这里保留原版的定位与相对性价比，换算进 Quest-log 的资源体系，
#  统一用「至纯源石」购买，产出龙门币 / 合成玉 / 理智 / 经验 / 仓库素材。
#  （按用户设定：龙门币与源石只能由任务或礼包产出，不能被兑换出来。）
# ------------------------------------------------------------
# 每周上架的礼包数量（1 个常驻锚点 + 滚动位）。R21：4 → 8，用户嫌太少。
WEEKLY_PACK_COUNT = 8

ARK_GIFT_PACKS = [
    {"name": "新人组合包", "description": "罗德岛新人补给：龙门币 + 基础养成素材",
     "pack_type": "fixed", "rarity": "common", "cost_source_stone": 3,
     "resources": {"lungmen": 8000, "exp": 800, "orundum": 300}, "materials": (3, 0, 1)},
    {"name": "罗德岛补给卡", "description": "每周补给：合成玉与理智，外加养成资源",
     "pack_type": "fixed", "rarity": "common", "cost_source_stone": 8,
     "resources": {"lungmen": 20000, "orundum": 1400, "sanity": 560}, "materials": (4, 0, 2)},
    {"name": "每周养成组合包", "description": "常规周常养成资源包，固定资源 + 随机素材",
     "pack_type": "mixed", "rarity": "rare", "cost_source_stone": 12,
     "resources": {"lungmen": 30000, "exp": 2000, "sanity": 800}, "materials": (5, 1, 3)},
    {"name": "专业强化包", "description": "面向干员专精的进阶素材包",
     "pack_type": "fixed", "rarity": "rare", "cost_source_stone": 18,
     "resources": {"lungmen": 50000, "exp": 3000}, "materials": (6, 2, 4)},
    {"name": "新人养成组合包", "description": "一次性大额养成资源，含源石返还",
     "pack_type": "fixed", "rarity": "epic", "cost_source_stone": 26,
     "resources": {"lungmen": 60000, "exp": 4000, "source_stone": 3}, "materials": (5, 2, 4)},
    {"name": "新人寻访组合包", "description": "含两次十连寻访所需的合成玉（6000）",
     "pack_type": "fixed", "rarity": "epic", "cost_source_stone": 35,
     "resources": {"orundum": 6000, "lungmen": 30000}, "materials": (3, 1, 3)},
    {"name": "每月寻访组合包", "description": "大月卡：合成玉 + 源石返还 + 顶级素材",
     "pack_type": "mixed", "rarity": "legendary", "cost_source_stone": 70,
     "resources": {"orundum": 6000, "source_stone": 6, "lungmen": 60000, "exp": 4000},
     "materials": (6, 3, 5)},
    # ---- R21 新增：货架从 4 个扩到 8 个，并加入「限定时装」随机奖励 ----
    {"name": "理智应急包", "description": "小额补给：理智 + 龙门币，随取随用",
     "pack_type": "fixed", "rarity": "common", "cost_source_stone": 5,
     "resources": {"sanity": 320, "lungmen": 12000}, "materials": (2, 0, 1)},
    {"name": "龙门币周转箱", "description": "纯龙门币补给，缓解养成开销",
     "pack_type": "fixed", "rarity": "common", "cost_source_stone": 10,
     "resources": {"lungmen": 45000, "exp": 1200}, "materials": (2, 0, 1)},
    {"name": "素材周转箱", "description": "随机养成素材，品类杂但量大",
     "pack_type": "mixed", "rarity": "rare", "cost_source_stone": 16,
     "resources": {"lungmen": 24000}, "materials": (6, 1, 4)},
    {"name": "精英化材料包", "description": "面向精英化的进阶素材集合",
     "pack_type": "fixed", "rarity": "rare", "cost_source_stone": 22,
     "resources": {"exp": 5000, "sanity": 600}, "materials": (7, 2, 5)},
    {"name": "时装特典包", "description": "养成资源 + 1 件限定时装（不在商店直售）",
     "pack_type": "mixed", "rarity": "epic", "cost_source_stone": 32,
     "resources": {"lungmen": 40000, "orundum": 1200}, "materials": (5, 2, 4),
     "skin_drop": 1},
    {"name": "限定衣装箱", "description": "高阶养成资源 + 1 件限定时装（不在商店直售）",
     "pack_type": "mixed", "rarity": "epic", "cost_source_stone": 46,
     "resources": {"lungmen": 70000, "exp": 6000, "orundum": 2400}, "materials": (6, 2, 5),
     "skin_drop": 1},
    {"name": "周年庆典包", "description": "庆典限定：顶级资源 + 1 件限定时装",
     "pack_type": "mixed", "rarity": "legendary", "cost_source_stone": 88,
     "resources": {"orundum": 6000, "source_stone": 8, "lungmen": 90000, "exp": 8000},
     "materials": (8, 3, 5), "skin_drop": 1},
]


def _shop_day_index() -> int:
    """「货架周期序号」——从 2026-01-01 04:00 起算的【周数】，每过一个周一 04:00 严格 +1。

    R19：刷新周期由「每日」改回「每周」（用户：抽卡处/皮肤处/礼包处按周刷新更合理，
    每天换一批太快，刚看中的东西第二天就没了）。
    和 _stable_index（散列出随机下标）不同，这个值每周必然递增，
    拿它当轮换窗口的起点，就能保证「相邻两周上架的礼包一定不一样」，
    而不会出现散列撞车导致连着两周同一批的情况。
    """
    base = datetime(2026, 1, 1, REPEAT_RESET_HOUR).astimezone()
    return (period_start('weekly') - base).days // 7


def _rolling_pick(seq: list, day_index: int, k: int, offset: int = 0) -> list:
    """按周期序号滚动取 k 个：窗口每期整体错开一格，走完一圈自动回到开头。"""
    n = len(seq)
    if n == 0:
        return []
    start = (day_index + offset) % n
    return [seq[(start + i) % n] for i in range(min(k, n))]


def generate_weekly_packs(cur):
    """礼包货架轮换（R19：周期回到「每周」，每周一 04:00 换一批）。

      · 罗德岛补给卡仍是常驻锚点（对应原版月卡，不该消失）
      · 其余 3 个按周期序号滚动上架 —— 本周内结果固定（刷新不变），跨周自动换
      · 总数固定为 4（1 锚点 + 3 滚动）—— 偶数个，两行两列铺满，
        不再出现「3+1 缺一块」的丑排版（原来是 3 + day%2，可能为 5 个）
    """
    start = period_start('weekly').astimezone(timezone.utc)
    end = start + timedelta(days=7)
    # ⚠️ 时间口径必须统一成 UTC：/api/gift-packs 用 now_iso()（UTC）做字符串比较，
    #    若这里写本地时区的 "+08:00" 串，就能和 "…+00:00" 比出大小关系错误，
    #    礼包会被整批过滤掉（表现为货架空白）。
    now = now_iso()
    # 清掉过期包 + 「不是本周期起点生成的遗留包」。
    # R19 从日更改回周更时踩到的坑：日更时代生成的包窗口是 1 天，
    # 它们的 available_from 落在本周窗口内（于是不会被"早于周期起点"的条件命中），
    # 会一直挂在货架上，导致货架同时出现新旧两批、数量也不是偶数。
    # ⚠️ 这里用【字符串精确比较 available_from】，不用 datetime() 归一化：
    #    存储串带 "+08:00" 偏移，SQLite 的 datetime() 对带偏移的 ISO 串会返回 NULL，
    #    NULL 参与比较恒为假 —— 于是"删不掉"，这正是日更→周更后货架不清的根因。
    cur.execute("""DELETE FROM gift_packs
                   WHERE purchased = 0
                     AND (datetime(available_until) < datetime(?) OR available_from <> ?)""",
                (now, start.isoformat()))
    # R21：货架数量从 4 提到 8。已在架上但数量对不上的旧批次（比如上一次
    #      还是 4 个生成出来的）要整批换掉，否则用户看到的永远还是四个。
    cur.execute("SELECT COUNT(*) FROM gift_packs WHERE available_from = ? AND purchased = 0",
                (start.isoformat(),))
    _n = cur.fetchone()[0]
    # 只有「本周期还没上架」或「上架数量和当前设定不符且本周一件都还没买」时才重铺，
    # 否则用户买了几件后一重启货架就整批换新，等于白送。
    cur.execute("SELECT COUNT(*) FROM gift_packs WHERE available_from = ? AND purchased = 1",
                (start.isoformat(),))
    bought_this_period = cur.fetchone()[0]
    if _n != WEEKLY_PACK_COUNT and bought_this_period == 0:
        cur.execute("DELETE FROM gift_packs WHERE purchased = 0 AND available_from = ?",
                    (start.isoformat(),))
        day = _shop_day_index()
        anchor = next(p for p in ARK_GIFT_PACKS if p["name"] == "罗德岛补给卡")
        others = [p for p in ARK_GIFT_PACKS if p is not anchor]
        # R21：货架从 4 个扩到 8 个（1 常驻 + 7 滚动）——用户嫌「只有四个」，
        #      8 个仍保持偶数，两列/四列网格都不会缺角。
        chosen = [anchor] + _rolling_pick(others, day, 7)
        # 每周至少保证 1 个「限定时装」包上架，否则限定时装永远拿不到
        if not any(p.get("skin_drop") for p in chosen):
            skin_packs = [p for p in ARK_GIFT_PACKS if p.get("skin_drop")]
            if skin_packs:
                chosen[-1] = skin_packs[day % len(skin_packs)]
        for pack in chosen:
            n, lo, hi = pack["materials"]
            mats = [{"type": k, "amount": a} for k, a in _pick_pack_materials(n, lo, hi)]
            if pack["pack_type"] == "mixed":
                # mixed：固定部分必给，另外从素材里随机再抽 2 件
                content = {"fixed": dict(pack["resources"]),
                           "random": [f"{m['type']}:{m['amount']}" for m in mats]}
            else:
                content = {"resources": dict(pack["resources"]), "materials": mats}
            if pack.get("skin_drop"):
                content["skin_drop"] = int(pack["skin_drop"])
            cur.execute("""
                INSERT INTO gift_packs (name, description, pack_type, content_config, cost_source_stone, rarity, available_from, available_until)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (pack["name"], pack["description"], pack["pack_type"], json.dumps(content),
                  pack["cost_source_stone"], pack["rarity"], start.isoformat(), end.isoformat()))


def background_weekly_pack_refresh():
    while True:
        now = _local_now()
        # 下一个周期起点：本周一 04:00（已过就是下周一）
        next_reset = period_start('weekly') + timedelta(days=7)
        sleep_seconds = max(30.0, (next_reset - now).total_seconds())
        time.sleep(sleep_seconds)
        try:
            with db_cursor() as cur:
                generate_weekly_packs(cur)
                cur.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        except Exception as e:
            print(f"礼包刷新失败: {e}")


# ---------- 辅助函数 ----------
def now_iso():
    return datetime.now(timezone.utc).isoformat()


_APP_VERSION_CACHE: Optional[dict] = None


def app_version_info() -> dict:
    """版本号从 Git 自动生成：vYY.MM.DD.<提交数>，不用再手工敲 V1.0。

    没有 git 或不在仓库里时退回「今天日期 + 0」，前端照样有东西显示。
    """
    global _APP_VERSION_CACHE
    if _APP_VERSION_CACHE is not None:
        return _APP_VERSION_CACHE
    repo = os.path.dirname(os.path.abspath(__file__))
    info = {
        "build": 0,
        "commit": "local",
        "date": datetime.now().strftime("%Y-%m-%d"),
        "subject": "",
    }

    def _git(*args: str) -> str:
        try:
            # Windows 下 git 输出是 UTF-8，但 Python 默认用 locale(GBK) 解码，
            # 中文提交信息会变乱码；显式按 UTF-8 解并容错。
            proc = subprocess.run(["git", *args], cwd=repo, capture_output=True,
                                  timeout=6)
            if proc.returncode != 0:
                return ""
            try:
                return proc.stdout.decode("utf-8").strip()
            except UnicodeDecodeError:
                return proc.stdout.decode("utf-8", errors="replace").strip()
        except Exception:
            return ""

    count = _git("rev-list", "--count", "HEAD")
    commit = _git("rev-parse", "--short", "HEAD")
    date = _git("show", "-s", "--format=%cd", "--date=format:%Y-%m-%d", "HEAD")
    subject = _git("show", "-s", "--format=%s", "HEAD")
    if count.isdigit():
        info["build"] = int(count)
    if commit:
        info["commit"] = commit
    if date:
        info["date"] = date
    if subject:
        info["subject"] = subject

    try:
        d = datetime.strptime(info["date"], "%Y-%m-%d")
    except ValueError:
        d = datetime.now()
    info["version"] = f"v{d.year % 100:02d}.{d.month:02d}.{d.day:02d}.{info['build']}"
    info["label"] = f"{info['version']}+{info['commit']}"
    _APP_VERSION_CACHE = info
    return info


# ---------- 等级 / 经验曲线（与前端 static/app.js 保持一致） ----------
# 明日方舟真实「升级所需声望」曲线；SCALE 越小升级越快，FLOOR 为单级最低经验。
_AK_EXP_TABLE = [500,800,1240,1320,1400,1480,1560,1640,1720,1800,1880,1960,2040,2120,2200,2280,2360,2440,2520,2600,2680,2760,2840,2920,3000,3080,3160,3240,3350,3460,3570,3680,3790,3900,4200,4500,4800,5100,5400,5700,6000,6300,6600,6900,7200,7500,7800,8100,8400,8700,9000,9500,10000,10500,11000,11500,12000,12500,13000,13500,14000,14500,15000,15500,16000,17000,18000,19000,20000,21000,22000,23000,24000,25000,26000,27000,28000,29000,30000,31000,32000,33000,34000,35000,36000,37000,38000,39000,40000,41000,42000,43000,44000,45000,46000,47000,48000,49000,50000,51000,52000,54000,56000,58000,60000,62000,64000,66000,68000,70000,73000,76000,79000,82000,85000,88000,91000,94000,97000,100000]
# 二次曲线：need(L) = BASE + LIN*(L-1) + QUAD*(L-1)^2
# 必须与前端 static/app.js 的 LEVEL_BASE / LEVEL_LIN / LEVEL_QUAD / LEVEL_ROUND / LEVEL_FLOOR 完全一致，
# 否则前后端算出的等级会不一致（升级检测在后端、等级显示在前端）。
_LEVEL_BASE = 60
_LEVEL_LIN = 20
_LEVEL_QUAD = 1.0
_LEVEL_ROUND = 5
_LEVEL_FLOOR = 50


def _level_exp_for_level(level: int) -> int:
    n = max(0, level - 1)
    need = _LEVEL_BASE + _LEVEL_LIN * n + _LEVEL_QUAD * n * n
    # int(x + 0.5) 等价于 JS 的 Math.round（四舍五入，非银行家舍入），保证与前端一致
    return max(_LEVEL_FLOOR, int(need / _LEVEL_ROUND + 0.5) * _LEVEL_ROUND)


def calculate_level(exp: float) -> int:
    if exp < 0:
        exp = 0
    level = 1
    total = 0
    while True:
        need = _level_exp_for_level(level)
        if exp < total + need:
            return level
        total += need
        level += 1


# ---------- 理智上限：对齐明日方舟原版的「博士等级 → 理智上限」曲线 ----------
# 原版等级上限 120 级，上限 82 起、135 封顶，分段线性：
#     1 -   5 级：每级 +2        （1 级 82 → 5 级 90）
#     5 -  35 级：每级 +1        （5 级 90 → 35 级 120）
#    35 -  85 级：每 5 级 +1     （35 级 120 → 85 级 130）
#    85 - 100 级：停滞           （维持 130）
#   100 - 120 级：每 4 级 +1     （101 / 105 / 109 / 113 / 117 各 +1 → 满级 135）
# 校验点（与原版公开数据表一致）：1级82 / 5级90 / 35级120 / 85级130 /
# 116级134 / 117级135 / 120级135。
_AK_SANITY_BASE = 82
_AK_SANITY_MAX = 135
_AK_SANITY_LEVEL_CAP = 120


def sanity_cap(level: int) -> int:
    """给定博士等级，返回其对应的理智上限（原版公式）。"""
    try:
        lv = int(level)
    except (TypeError, ValueError):
        lv = 1
    lv = max(1, min(lv, _AK_SANITY_LEVEL_CAP))
    cap = _AK_SANITY_BASE
    cap += (min(lv, 5) - 1) * 2                  # 1-5：每级 +2
    if lv > 5:
        cap += min(lv, 35) - 5                   # 5-35：每级 +1
    if lv > 35:
        cap += (min(lv, 85) - 35) // 5           # 35-85：每 5 级 +1
    if lv > 100:
        cap += (lv - 101) // 4 + 1               # 100-120：101/105/109/113/117 各 +1
    return min(cap, _AK_SANITY_MAX)


def sanity_cap_gain(level: int) -> int:
    """升到 level+1 时理智上限会增加多少（0 表示该级不涨）。"""
    return max(0, sanity_cap(level + 1) - sanity_cap(level))


def sync_sanity_cap(cur, level: int) -> int:
    """把 resources.sanity.max_value 同步为当前等级的理智上限。

    自然恢复受上限约束，所以上限变小（例如老库写死的 120 掉到 16 级的 101）时
    要把当前值一起压下来，否则会出现「126/101」这种看着像 bug 的显示。
    上限变大时只抬上限，不动当前值 —— 由升级流程决定是否回满。
    """
    cap = sanity_cap(level)
    cur.execute("SELECT max_value, current_value FROM resources WHERE resource_type = 'sanity'")
    row = cur.fetchone()
    if row is None:
        cur.execute("INSERT OR IGNORE INTO resources (resource_type, current_value, max_value) VALUES ('sanity', ?, ?)",
                    (cap, cap))
        return cap
    cur.execute("UPDATE resources SET max_value = ?, updated_at = ? WHERE resource_type = 'sanity'",
                (cap, now_iso()))
    if row["current_value"] is not None and row["current_value"] > cap:
        cur.execute("UPDATE resources SET current_value = ?, updated_at = ? WHERE resource_type = 'sanity'",
                    (cap, now_iso()))
    return cap


def add_resource(cur, resource_type: str, amount: float, reason: str, ref_id: int = None):
    if amount == 0:
        return
    cur.execute("UPDATE resources SET current_value = current_value + ?, updated_at = ? WHERE resource_type = ?",
                (amount, now_iso(), resource_type))
    cur.execute("INSERT INTO resource_transactions (resource_type, amount, reason, ref_id) VALUES (?, ?, ?, ?)",
                (resource_type, amount, reason, ref_id))


def get_resource(cur, resource_type: str) -> float:
    cur.execute("SELECT current_value FROM resources WHERE resource_type = ?", (resource_type,))
    row = cur.fetchone()
    return row[0] if row else 0


def add_inventory(cur, material_type: str, amount: float):
    """累加仓库素材数量（用于随机掉落收集）。"""
    if amount == 0:
        return
    cur.execute(
        "INSERT INTO inventory (material_type, qty, updated_at) VALUES (?, ?, ?) "
        "ON CONFLICT(material_type) DO UPDATE SET qty = qty + excluded.qty, updated_at = excluded.updated_at",
        (material_type, amount, now_iso()))


def get_inventory(cur) -> Dict[str, float]:
    """返回仓库中所有素材 {material_type: qty}。"""
    cur.execute("SELECT material_type, qty FROM inventory")
    return {row["material_type"]: row["qty"] for row in cur.fetchall()}


def add_drops_to_inventory(cur, drop_config: Optional[str]):
    """把掉落配置中的方舟素材(MTL_/sprite_)累加进仓库。

    返回本次实际入库的素材列表 [{'type':..., 'amount':...}]，
    供前端提示「仓库 +xxx」，避免用户领了奖励却看不到仓库变化。
    """
    granted = []
    if not drop_config:
        return granted
    try:
        config = json.loads(drop_config)
    except (ValueError, TypeError):
        return granted
    for drop in config.get("random_drops", []):
        if ':' not in drop:
            continue
        res_type, amount_str = drop.split(':', 1)
        # 仓库素材统一以 mat_ 前缀标识（见 build_warehouse.py）
        if res_type.startswith('mat_'):
            try:
                amt = float(amount_str)
                add_inventory(cur, res_type, amt)
                granted.append({"type": res_type, "amount": amt})
            except ValueError:
                pass
    return granted



def get_reality_reward_progress(cur, reward) -> float:
    """根据目标类型计算当前进度。"""
    target_type = reward["target_type"] if isinstance(reward, dict) else reward["target_type"]
    if target_type == 'level':
        return float(calculate_level(get_resource(cur, 'exp')))
    if target_type == 'exp':
        return get_resource(cur, 'exp')
    if target_type == 'tasks_completed':
        cur.execute("SELECT COUNT(*) FROM tasks WHERE status = 'done' AND deleted = 0")
        return float(cur.fetchone()[0])
    if target_type == 'streak_days':
        return float(calculate_streak_days(cur))
    if target_type == 'tracking_hours':
        cur.execute("SELECT COALESCE(SUM(duration_seconds), 0) FROM tracking_sessions WHERE ended_at IS NOT NULL")
        return float(cur.fetchone()[0]) / 3600.0
    return float(reward["current_value"] if isinstance(reward, dict) else reward["current_value"])


def close_open_pomodoro(cur):
    cur.execute("""
        UPDATE pomodoro_sessions
        SET ended_at = ?, status = 'cancelled'
        WHERE status = 'running'
    """, (now_iso(),))


def check_reality_rewards_achieved(cur):
    """将达到目标的未领取奖励自动标记为 achieved。"""
    cur.execute("SELECT * FROM reality_rewards WHERE status = 'pending'")
    for reward in cur.fetchall():
        progress = get_reality_reward_progress(cur, reward)
        if progress >= reward["target_value"]:
            cur.execute("UPDATE reality_rewards SET status = 'achieved', achieved_at = ? WHERE id = ?",
                        (now_iso(), reward["id"]))


def check_level_reached(cur, level: int):
    cur.execute(
        "SELECT id, condition_value, reward_exp, reward_lungmen, reward_source_stone, reward_orundum FROM achievements WHERE condition_type = 'level_reached' AND condition_value <= ?",
        (level,))
    for ach in cur.fetchall():
        cur.execute("SELECT id FROM achievement_unlocks WHERE achievement_id = ?", (ach["id"],))
        if cur.fetchone():
            continue
        cur.execute("INSERT INTO achievement_unlocks (achievement_id, unlocked_at) VALUES (?, ?)",
                    (ach["id"], now_iso()))
        if ach["reward_exp"]:
            add_resource(cur, 'exp', ach["reward_exp"], f'achievement_{ach["id"]}')
        if ach["reward_lungmen"]:
            add_resource(cur, 'lungmen', ach["reward_lungmen"], f'achievement_{ach["id"]}')
        if ach["reward_source_stone"]:
            add_resource(cur, 'source_stone', ach["reward_source_stone"], f'achievement_{ach["id"]}')
        if ach["reward_orundum"]:
            add_resource(cur, 'orundum', ach["reward_orundum"], f'achievement_{ach["id"]}')


def check_and_apply_level_up(cur, old_exp: float, new_exp: float):
    old_level = calculate_level(old_exp)
    new_level = calculate_level(new_exp)
    if new_level > old_level:
        # 先按新等级刷新理智上限，再回满 —— 上限本身就是等级的函数。
        new_cap = sync_sanity_cap(cur, new_level)
        cur.execute("SELECT current_value FROM resources WHERE resource_type = 'sanity'")
        row = cur.fetchone()
        current_sanity = row["current_value"] if row else 0
        diff = new_cap - current_sanity
        if diff > 0:
            add_resource(cur, 'sanity', diff, 'level_up')
        check_level_reached(cur, new_level)
        if new_level % 5 == 0:
            cur.execute("SELECT settings_json FROM settings WHERE id = 1")
            settings = json.loads(cur.fetchone()[0])
            claimed_levels = settings.get("level_rewards_claimed", [])
            if new_level not in claimed_levels:
                content = _build_level_pack_content(new_level)
                far_future = "9999-12-31T23:59:59Z"
                cur.execute("""
                    INSERT INTO gift_packs (name, description, pack_type, content_config, cost_source_stone, rarity, available_from, available_until)
                    VALUES (?, ?, 'fixed', ?, 0, 'epic', ?, ?)
                """, (f"等级{new_level}礼包", f"恭喜达到{new_level}级！", json.dumps(content), now_iso(), far_future))
                claimed_levels.append(new_level)
                settings["level_rewards_claimed"] = claimed_levels
                cur.execute("UPDATE settings SET settings_json = ? WHERE id = 1", (json.dumps(settings),))


def check_achievement(cur, condition_type: str, current_value: float, task_id: int = None):
    cur.execute(
        "SELECT id, condition_type, condition_value, reward_exp, reward_lungmen, reward_source_stone, reward_orundum FROM achievements WHERE condition_type = ?",
        (condition_type,))
    achievements = cur.fetchall()
    for ach in achievements:
        cur.execute("SELECT id FROM achievement_unlocks WHERE achievement_id = ?", (ach["id"],))
        if cur.fetchone():
            continue
        if current_value >= ach["condition_value"]:
            cur.execute("INSERT INTO achievement_unlocks (achievement_id, unlocked_at, task_id) VALUES (?, ?, ?)",
                        (ach["id"], now_iso(), task_id))
            old_exp = get_resource(cur, 'exp')
            if ach["reward_exp"]:
                add_resource(cur, 'exp', ach["reward_exp"], f'achievement_{ach["id"]}', task_id)
            if ach["reward_lungmen"]:
                add_resource(cur, 'lungmen', ach["reward_lungmen"], f'achievement_{ach["id"]}', task_id)
            if ach["reward_source_stone"]:
                add_resource(cur, 'source_stone', ach["reward_source_stone"], f'achievement_{ach["id"]}', task_id)
            if ach["reward_orundum"]:
                add_resource(cur, 'orundum', ach["reward_orundum"], f'achievement_{ach["id"]}', task_id)
            new_exp = get_resource(cur, 'exp')
            check_and_apply_level_up(cur, old_exp, new_exp)


def _scalar_or_zero(cur, sql, params=()):
    """跑一条只取一个值的 SQL；表不存在 / 字段不存在一律当 0，绝不抛。"""
    try:
        cur.execute(sql, params)
        row = cur.fetchone()
        if row is None:
            return 0
        v = row[0]
        return v if v is not None else 0
    except Exception:
        return 0


def cumulative_achievement_values(cur) -> dict:
    """所有「累计型」蚀刻章条件的当前值。

    R23：这里抽成公共函数 —— 启动补扫和事件触发必须用同一份口径，
    否则会出现「重启才亮、当场不亮」这类不一致。
    """
    vals = {
        'task_count_created':         _scalar_or_zero(cur, "SELECT COUNT(*) FROM tasks WHERE deleted = 0"),
        'task_count_completed':       _scalar_or_zero(cur, "SELECT COUNT(*) FROM tasks WHERE status = 'done' AND deleted = 0"),
        'task_count_completed_main':  _scalar_or_zero(cur, "SELECT COUNT(*) FROM tasks WHERE status = 'done' AND task_line = 'main' AND deleted = 0"),
        'task_count_completed_side':  _scalar_or_zero(cur, "SELECT COUNT(*) FROM tasks WHERE status = 'done' AND task_line = 'side' AND deleted = 0"),
        'task_count_completed_6star': _scalar_or_zero(cur, "SELECT COUNT(*) FROM tasks WHERE status = 'done' AND priority = 6 AND deleted = 0"),
        'task_count_completed_high':  _scalar_or_zero(cur, "SELECT COUNT(*) FROM tasks WHERE status = 'done' AND priority >= 5 AND deleted = 0"),
        'tracking_hours_total':       _scalar_or_zero(cur, "SELECT COALESCE(SUM(duration_seconds), 0) FROM tracking_sessions WHERE ended_at IS NOT NULL") / 3600.0,
        'tracking_sessions_count':    _scalar_or_zero(cur, "SELECT COUNT(*) FROM tracking_sessions WHERE ended_at IS NOT NULL"),
        'gift_pack_purchased':        _scalar_or_zero(cur, "SELECT COUNT(*) FROM gift_packs WHERE purchased = 1"),
        'gacha_draws':                _scalar_or_zero(cur, "SELECT COALESCE(CAST(value AS INTEGER), 0) FROM gacha_pity WHERE key = 'total_pulls'"),
        'operators_owned':            _scalar_or_zero(cur, "SELECT COUNT(*) FROM operator_records"),
        'six_star_owned':             _scalar_or_zero(cur, "SELECT COUNT(*) FROM operator_records WHERE rarity = 6"),
        'five_star_owned':            _scalar_or_zero(cur, "SELECT COUNT(*) FROM operator_records WHERE rarity >= 5"),
        'skins_owned':                _scalar_or_zero(cur, "SELECT COUNT(*) FROM skins_owned"),
        'pomodoro_count':             _scalar_or_zero(cur, "SELECT COUNT(*) FROM pomodoro_sessions WHERE status = 'completed' AND kind = 'focus'"),
        'pomodoro_minutes_total':     _scalar_or_zero(cur, "SELECT COALESCE(SUM(planned_seconds), 0) FROM pomodoro_sessions WHERE status = 'completed' AND kind = 'focus'") / 60.0,
        'warehouse_kinds':            _scalar_or_zero(cur, "SELECT COUNT(*) FROM inventory WHERE qty > 0"),
        'subtask_count':              _scalar_or_zero(cur, "SELECT COUNT(*) FROM tasks WHERE parent_id IS NOT NULL AND deleted = 0"),
        'campaign_count':             _scalar_or_zero(cur, "SELECT COUNT(*) FROM tasks WHERE track = 'campaign' AND deleted = 0"),
        'notes_written':              _scalar_or_zero(cur, "SELECT COUNT(*) FROM tasks WHERE deleted = 0 AND notes IS NOT NULL AND TRIM(notes) != ''"),
        'lungmen_earned':             _scalar_or_zero(cur, "SELECT COALESCE(SUM(amount), 0) FROM resource_transactions WHERE resource_type = 'lungmen' AND amount > 0"),
        'orundum_earned':             _scalar_or_zero(cur, "SELECT COALESCE(SUM(amount), 0) FROM resource_transactions WHERE resource_type = 'orundum' AND amount > 0"),
    }
    try:
        vals['streak_days'] = calculate_streak_days(cur)
    except Exception:
        vals['streak_days'] = 0
    return vals


def check_cumulative_achievements(cur, task_id: int = None):
    """把「累计型」条件全算一遍并触发判定。

    挂在任务完成 / 追踪结束 / 抽卡 / 导入这些事件点上，
    和启动补扫 sweep_achievements 共用 cumulative_achievement_values 的口径。
    任何一项失败都不影响其它项，也不该把主流程带崩。
    """
    for ctype, value in cumulative_achievement_values(cur).items():
        try:
            check_achievement(cur, ctype, value, task_id)
        except Exception:
            continue


def sweep_achievements(cur):
    """按当前数据把「累计型」蚀刻章统一补点亮一次。

    check_achievement 只在事件发生时被调用（新建任务 / 完成任务 / 停止追踪…），
    所以对一个已经有历史数据的库来说，那些早就该亮的章永远不会亮 ——
    界面看起来就是「明明有 9 条解锁记录，卡片却一张都不发光」。
    这里在启动时（以及导入数据后）把每种条件的当前值算一遍。
    单项失败不影响其它项，也不要让它挡住启动。"""
    check_cumulative_achievements(cur, None)


def update_parent_progress(cur, parent_id: int):
    if parent_id is None:
        return
    cur.execute("SELECT progress_mode, status FROM tasks WHERE id = ?", (parent_id,))
    parent = cur.fetchone()
    if parent is None:
        return
    cur.execute(
        "SELECT COUNT(*) FROM tasks WHERE parent_id = ? AND deleted = 0 AND archived = 0 AND status != 'cancelled'",
        (parent_id,))
    has_children = cur.fetchone()[0] > 0
    if has_children and parent["progress_mode"] != 'auto':
        cur.execute("UPDATE tasks SET progress_mode = 'auto' WHERE id = ?", (parent_id,))
    if parent["progress_mode"] != 'auto':
        return
    cur.execute("""
        SELECT AVG(progress) as avg_progress, COUNT(*) as cnt
        FROM tasks 
        WHERE parent_id = ? AND deleted = 0 AND archived = 0 AND status != 'cancelled'
    """, (parent_id,))
    row = cur.fetchone()
    if row["cnt"] == 0:
        new_progress = 0
    else:
        new_progress = row["avg_progress"] or 0
        cur.execute("UPDATE tasks SET progress = ?, updated_at = ? WHERE id = ?", (new_progress, now_iso(), parent_id))
    cur.execute("SELECT parent_id FROM tasks WHERE id = ?", (parent_id,))
    grandparent = cur.fetchone()
    if grandparent and grandparent["parent_id"]:
        update_parent_progress(cur, grandparent["parent_id"])


def calculate_task_difficulty(cur, task_id: int, task: dict) -> float:
    """综合难度算法：星级 + 任务线 + 子任务数 + 前置依赖 → 1~15 分"""
    score = 0.0
    # 基础：星级 (1-6)
    score += task.get('priority', 1)
    # 任务线：主线 > 支线 > 日常
    line = task.get('task_line', '')
    if line == 'main':
        score += 2.5
    elif line == 'side':
        score += 1.0
    # campaign（长线战役）额外加成
    if task.get('track') == 'campaign':
        score += 1.5
    # 子任务数量加成（每个+0.5，上限+3）
    cur.execute(
        "SELECT COUNT(*) FROM tasks WHERE parent_id = ? AND deleted = 0 AND archived = 0 AND status != 'cancelled'",
        (task_id,))
    child_count = cur.fetchone()[0]
    score += min(child_count * 0.5, 3.0)
    # 前置依赖加成
    if task.get('prerequisite_id'):
        score += 1.0
    return max(1.0, min(score, 15.0))


# =========================================================
# 仓库素材目录与掉落池
#   目录由 build_warehouse.py 从官方 gamedata/excel/item_table.json 生成，
#   含官方中文名/分类/稀有度；掉落池据此按稀有度动态构建（高级加权）。
# =========================================================
WAREHOUSE_CATALOG_PATH = os.path.join(STATIC_DIR, "warehouse_catalog.json")


def _load_warehouse_catalog() -> list:
    """加载仓库素材目录；缺失时降级为空列表（不影响主流程）。"""
    try:
        with open(WAREHOUSE_CATALOG_PATH, encoding="utf-8") as f:
            return json.load(f)["items"]
    except Exception as e:
        print(f"[warn] 仓库素材目录加载失败: {e}")
        return []


WAREHOUSE_CATALOG = _load_warehouse_catalog()

# 各档位允许掉落的稀有度区间（0灰 1绿 2蓝 3紫 4金 5传说）
#   星级映射: ★1-2→low, ★3→mid, ★4→high, ★5-6→extreme
POOL_RARITY_RANGE = {
    'low':     (0, 1),
    'mid':     (0, 2),
    'high':    (1, 3),
    'extreme': (2, 4),
}
# 稀有度 -> 掉落数量区间（越稀有掉得越少）
RARITY_AMOUNT = {0: (2, 5), 1: (2, 4), 2: (1, 3), 3: (1, 2), 4: (1, 2), 5: (1, 1)}


def _build_material_pools() -> dict:
    """按稀有度构建四档掉落池。

    权重 = (稀有度+1)^2 —— 越稀有的素材在池内权重越高，
    配合"高星池只放高稀有度"的区间限制，实现「高星出高级素材」的高级加权。
    """
    pools = {k: [] for k in POOL_RARITY_RANGE}
    for it in WAREHOUSE_CATALOG:
        if it.get('cat') == '信物':
            continue  # 信物不走常规池，改为高星稀有额外奖励
        r = int(it.get('r', 0))
        mn, mx = RARITY_AMOUNT.get(r, (1, 2))
        weight = (r + 1) ** 2
        for pname, (lo, hi) in POOL_RARITY_RANGE.items():
            if lo <= r <= hi:
                pools[pname].append((it['key'], mn, mx, weight))
    return pools


MATERIAL_DROP_POOLS = _build_material_pools()


def _pick_pack_materials(n, min_r=0, max_r=4, rng=None):
    """从官方仓库目录里挑选 n 个「多种类别、不重复」的素材 key（均带生成好的图标）。

    只返回 mat_ 前缀的真实目录 key，绝不臆造图标缺失的 key。
    按类别分层取样，保证一次礼包里素材品类多样（不要每次就那几个东西）。
    """
    rng = rng or random
    pool = [it for it in WAREHOUSE_CATALOG
            if min_r <= int(it.get('r', 0)) <= max_r and it.get('cat') != '信物']
    by_cat = {}
    for it in pool:
        by_cat.setdefault(it['cat'], []).append(it)
    cats = list(by_cat.keys())
    chosen, seen = [], set()
    attempts = 0
    while len(chosen) < n and cats and attempts < n * 12:
        attempts += 1
        cat = rng.choice(cats)
        cands = [x for x in by_cat[cat] if x['key'] not in seen]
        if not cands:
            continue
        it = rng.choice(cands)
        seen.add(it['key'])
        # 数量随稀有度提升（越稀有给得越少）
        amt = rng.randint(1, 2 + int(it.get('r', 0)))
        chosen.append((it['key'], amt))
    return chosen


def _build_level_pack_content(level: int) -> dict:
    """等级礼包内容：随等级提升奖励价值，素材多样（取自官方目录，图标齐备）。

    level 为 5 的倍数；tier = level//5（5→1, 10→2, 15→3...）。
    """
    tier = max(1, level // 5)
    # R24：升级礼包不再发源石 —— 原版等级奖励给的是素材 / 龙门币 / 合成玉，
    # 源石只来自关卡首通与充值。以前这里 120 级一次就送 50 颗源石。
    resources = {
        "source_stone": 0,
        "orundum": 100 + tier * 30,
        "lungmen": 5000 + tier * 4000,
        "exp": 200 + tier * 150,
    }
    min_r = 0 if tier < 2 else 1
    max_r = min(1 + tier, 4)
    mats = _pick_pack_materials(2 + tier, min_r, max_r)
    return {
        "resources": resources,
        "materials": [{"type": k, "amount": a} for k, a in mats],
    }


# 信物（干员信物等收集品）：仅高星任务极小概率额外掉落
WAREHOUSE_TOKENS = [it['key'] for it in WAREHOUSE_CATALOG if it.get('cat') == '信物']

# 基础货币掉落（龙门币/合成玉/源石），按档位配置数量与权重
# R24：原版关卡掉落根本不掉源石（源石只来自首通 / 大版本补偿 / 充值），
# 所以把 source_stone 从常规掉落池里整个拿掉，只保留后面「极小概率惊喜掉落」那一条。
BASE_CURRENCY_DROPS = {
    'low':     [('lungmen', 300, 1200, 10), ('orundum', 5, 20, 4)],
    'mid':     [('lungmen', 800, 2500, 10), ('orundum', 15, 45, 5)],
    'high':    [('lungmen', 1500, 4000, 9), ('orundum', 35, 90, 6)],
    'extreme': [('lungmen', 3000, 7000, 8), ('orundum', 80, 180, 6)],
}


def _weighted_distinct_pick(pool, count, rng):
    """在掉落池内按权重无重复地抽取 count 个条目，返回 ['key:amount', ...]"""
    items = [(e[0], e[1], e[2], e[3]) for e in pool]
    keys = [e[0] for e in items]
    weights = [e[3] for e in items]
    chosen = []
    chosen_keys = set()
    candidates = list(range(len(items)))
    for _ in range(count):
        avail = [i for i in candidates if keys[i] not in chosen_keys]
        if not avail:
            break
        avail_weights = [weights[i] for i in avail]
        idx = rng.choices(avail, weights=avail_weights, k=1)[0]
        key, mn, mx, _ = items[idx]
        chosen_keys.add(key)
        amount = rng.randint(mn, max(mn, mx))
        chosen.append(f"{key}:{amount}")
    return chosen


def _pick_pool(star: int) -> str:
    """按任务星级分池：★1-2 基础, ★3 进阶, ★4 稀有, ★5-6 顶级"""
    if star <= 2:
        return 'low'
    elif star == 3:
        return 'mid'
    elif star == 4:
        return 'high'
    else:
        return 'extreme'


def calculate_random_drops(task_id: int, completed_at: str, cur=None) -> List[str]:
    """基于任务星级的方舟风格掉落系统（按星分池 + 高级加权）

    cur: 可选。调用方若已持有数据库连接（如导入流程中，任务尚未提交），
         必须传入同一个 cursor，否则新连接读不到未提交的任务行，导致掉落为空。
    """
    rng = random.SystemRandom()
    drops = []

    def _generate(cur):
        cur.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
        row = cur.fetchone()
        if not row:
            return []
        task = dict(row)

        star = int(task.get('priority', 1))
        difficulty = calculate_task_difficulty(cur, task_id, task)
        pool_name = _pick_pool(star)
        # 素材池 + 基础货币
        pool = list(MATERIAL_DROP_POOLS[pool_name]) + list(BASE_CURRENCY_DROPS[pool_name])

        # 掉落数量：随星级提升，且每次随机波动（不再固定 2 个）
        lo, hi = {1: (1, 2), 2: (1, 2), 3: (1, 3), 4: (2, 4), 5: (2, 5), 6: (3, 5)}.get(star, (1, 2))
        drop_count = rng.randint(lo, hi)
        # 小概率再额外多掉一个（惊喜感）
        if rng.random() < 0.18:
            drop_count += 1

        # 按权重无重复抽取
        out = _weighted_distinct_pick(pool, drop_count, rng)

        # 极小概率额外掉落源石（所有星级都有机会，随难度提高）。
        # R24：原版关卡不掉源石，这里只留「惊喜掉落」，概率从 2%~9.5% 降到 0.6%~1.2%，
        # 且数量固定 1 颗 —— 以前高难度一次能掉 3 颗，是源石通胀的第二个来源。
        lo_c, hi_c = ECONOMY["drop_stone_chance"]
        if rng.random() < lo_c + difficulty * (hi_c - lo_c) / 10.0:
            out.append(f"source_stone:{ECONOMY['drop_stone_amount']}")

        # 注意：干员信物不再由此掉落 —— 按设定，信物只能通过「干员寻访」抽卡获得。
        return out

    if cur is not None:
        return _generate(cur)
    with db_cursor() as c:
        return _generate(c)


def parse_drop_config_to_rewards(drop_config: Optional[str]) -> Dict[str, float]:
    """解析掉落配置为资源奖励（支持基础资源 + 方舟素材）"""
    rewards = {'source_stone': 0, 'orundum': 0, 'lungmen': 0, 'exp': 0}
    if not drop_config:
        return rewards
    try:
        config = json.loads(drop_config)
        drops = config.get("random_drops", [])
        for drop in drops:
            if ':' in drop:
                res_type, amount_str = drop.split(':', 1)
                try:
                    amount = float(amount_str)
                    # 基础资源直接累加
                    if res_type in rewards:
                        rewards[res_type] += amount
                    # 素材类（mat_ 前缀）：归入 materials 列表供弹窗展示
                    elif res_type.startswith('mat_'):
                        if 'materials' not in rewards:
                            rewards['materials'] = []
                        rewards['materials'].append({'type': res_type, 'amount': int(amount)})
                except ValueError:
                    pass
    except:
        pass
    return rewards


def handle_task_completion(cur, task_id: int):
    cur.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
    task = cur.fetchone()
    if task is None or task["status"] != 'done':
        return
    if not task["reward_claimed"] and task["drop_config"] is None:
        drops = calculate_random_drops(task_id, task["completed_at"] or now_iso())
        drop_config = {"random_drops": drops}
        cur.execute("UPDATE tasks SET drop_config = ? WHERE id = ?", (json.dumps(drop_config), task_id))
    # 成就检查
    cur.execute("SELECT COUNT(*) FROM tasks WHERE status = 'done' AND deleted = 0")
    total_completed = cur.fetchone()[0]
    check_achievement(cur, 'task_count_completed', total_completed, task_id)
    if task["task_line"] == 'main':
        cur.execute("SELECT COUNT(*) FROM tasks WHERE status = 'done' AND task_line = 'main' AND deleted = 0")
        main_completed = cur.fetchone()[0]
        check_achievement(cur, 'task_count_completed_main', main_completed, task_id)
    else:
        cur.execute("SELECT COUNT(*) FROM tasks WHERE status = 'done' AND task_line = 'side' AND deleted = 0")
        side_completed = cur.fetchone()[0]
        check_achievement(cur, 'task_count_completed_side', side_completed, task_id)
    streak = calculate_streak_days(cur)
    check_achievement(cur, 'streak_days', streak, task_id)
    # R23：其余累计型条件（6★/高优先任务数、子任务、战役、备注…）统一扫一遍
    check_cumulative_achievements(cur, task_id)
    if task["repeat_type"]:
        # 只推进「下次重置时刻」，不生成副本；到点由 sweep_repeat_tasks 就地归位
        advance_repeat_schedule(cur, task_id)
    if task["parent_id"]:
        update_parent_progress(cur, task["parent_id"])


def cascade_complete_descendants(cur, parent_id: int):
    """递归把某任务下所有未完成、未取消的子任务标为完成（聚合语义：父完成=整体完成）。"""
    cur.execute(
        "SELECT id FROM tasks WHERE parent_id = ? AND deleted = 0 AND archived = 0 AND status != 'done' AND status != 'cancelled'",
        (parent_id,))
    for r in cur.fetchall():
        cid = r["id"]
        cascade_complete_descendants(cur, cid)
        cur.execute("UPDATE tasks SET status='done', progress=100, completed_at=?, updated_at=? WHERE id=?",
                    (now_iso(), now_iso(), cid))
        handle_task_completion(cur, cid)


def calculate_streak_days(cur):
    cur.execute("""
        SELECT DISTINCT date(completed_at, 'utc') as comp_date 
        FROM tasks 
        WHERE status = 'done' AND completed_at IS NOT NULL AND deleted = 0 
        ORDER BY comp_date DESC
    """)
    dates = [row["comp_date"] for row in cur.fetchall()]
    if not dates:
        return 0
    today_utc = datetime.now(timezone.utc).date().isoformat()
    if dates[0] != today_utc:
        return 0
    streak = 1
    current_date = datetime.now(timezone.utc).date() - timedelta(days=1)
    for d in dates[1:]:
        if d == current_date.isoformat():
            streak += 1
            current_date -= timedelta(days=1)
        else:
            break
    return streak


"""重复任务的重置规则：以本地时间凌晨 04:00 为日界线。

和明日方舟的日常刷新一致——04:00 之前算「前一天」，04:00 之后才进入新的一天。
旧实现把 repeat_next_date 记成「完成时间 + 24 小时」，于是 18 号晚上 19:28 打完的
日常要到 19 号 19:28 才刷新，第二天早上根本没法做。现在统一按周期边界判断。
"""
REPEAT_RESET_HOUR = 4


def _local_now() -> datetime:
    """带本地时区的当前时间（服务器上就是北京时间）。"""
    return datetime.now().astimezone()


def period_start(repeat_type: str, ref: Optional[datetime] = None) -> datetime:
    """ref 所在的「当前周期」起点（本地时区，04:00）。

    每日：最近的 04:00；每周：本周一 04:00；每月：1 号 04:00。
    """
    ref = ref or _local_now()
    if ref.tzinfo is None:
        ref = ref.astimezone()
    anchor = ref - timedelta(hours=REPEAT_RESET_HOUR)
    if repeat_type == 'weekly':
        anchor = anchor - timedelta(days=anchor.weekday())
    elif repeat_type == 'monthly':
        anchor = anchor.replace(day=1)
    return anchor.replace(hour=REPEAT_RESET_HOUR, minute=0, second=0, microsecond=0)


def next_reset_at(repeat_type: str, interval: Optional[int] = None,
                  ref: Optional[datetime] = None) -> datetime:
    """ref 之后的下一个重置时刻（本地时区）。"""
    base = period_start(repeat_type, ref)
    if repeat_type == 'weekly':
        return base + timedelta(weeks=1)
    if repeat_type == 'monthly':
        month, year = base.month + 1, base.year
        if month > 12:
            month, year = 1, year + 1
        return base.replace(year=year, month=month)
    if repeat_type == 'custom':
        return base + timedelta(days=max(1, interval or 1))
    return base + timedelta(days=1)


def _as_aware(dt_str: Optional[str]) -> Optional[datetime]:
    """把库里的 ISO 时间字符串转成带时区的 datetime（旧的没带时区的按 UTC 处理）。"""
    if not dt_str:
        return None
    try:
        dt = datetime.fromisoformat(dt_str)
    except Exception:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _repeat_is_due(row, now_local: datetime) -> bool:
    """这条重复任务是否已经跨过了它的重置点（该归位了）。"""
    completed = _as_aware(row["completed_at"])
    if completed is None:
        return False
    repeat_type = row["repeat_type"]
    if repeat_type == 'custom':
        due = completed + timedelta(days=max(1, row["repeat_interval"] or 1))
        return due <= now_local
    return completed < period_start(repeat_type, now_local)


def sweep_repeat_tasks(cur) -> int:
    """把所有跨过重置点的重复任务归位：状态回「待办」、进度清零、清掉上一轮的掉落。

    由 /api/tasks 与 /api/tasks/tree 自动调用，所以只要打开页面就会自动刷新，
    不依赖任何后台定时器。
    """
    now_local = _local_now()
    cur.execute("""
        SELECT id, repeat_type, repeat_interval, status, completed_at, progress_mode,
               parent_id, is_tracked
        FROM tasks
        WHERE deleted = 0 AND archived = 0 AND repeat_type IS NOT NULL
          AND status IN ('done', 'cancelled')
    """)
    due_rows = [r for r in cur.fetchall() if _repeat_is_due(r, now_local)]
    if not due_rows:
        return 0
    for row in due_rows:
        nxt = next_reset_at(row["repeat_type"], row["repeat_interval"], now_local)
        cur.execute("""
            UPDATE tasks
               SET status = 'todo',
                   progress = 0,
                   current_value = CASE WHEN progress_mode = 'count' THEN 0 ELSE current_value END,
                   completed_at = NULL,
                   drop_config = NULL,
                   reward_claimed = 0,
                   repeat_next_date = ?,
                   updated_at = ?
             WHERE id = ?
        """, (nxt.isoformat(), now_iso(), row["id"]))
        if row["parent_id"]:
            update_parent_progress(cur, row["parent_id"])
    return len(due_rows)


def advance_repeat_schedule(cur, task_id: int):
    """任务完成时只把「下次重置时刻」推到下一个 04:00，不再生成副本。

    归位由 sweep_repeat_tasks 按周期边界统一处理，副本方案会和重置互相打架。
    """
    cur.execute("SELECT repeat_type, repeat_interval FROM tasks WHERE id = ?", (task_id,))
    task = cur.fetchone()
    if task is None or not task["repeat_type"]:
        return
    nxt = next_reset_at(task["repeat_type"], task["repeat_interval"])
    cur.execute("UPDATE tasks SET repeat_next_date = ? WHERE id = ?", (nxt.isoformat(), task_id))


def _legacy_create_repeat_copy(cur, task_id: int):
    """【已停用】旧的「完成即生成副本」实现，保留仅为兼容历史数据。
    新逻辑见 advance_repeat_schedule + sweep_repeat_tasks。"""
    cur.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
    task = cur.fetchone()
    if task["repeat_next_date"]:
        try:
            if datetime.fromisoformat(task["repeat_next_date"]) > datetime.now(timezone.utc):
                return
        except:
            pass
    repeat_type = task["repeat_type"]
    base_date = datetime.now(timezone.utc)
    if task["repeat_next_date"]:
        base_date = datetime.fromisoformat(task["repeat_next_date"])
    if repeat_type == 'daily':
        next_date = base_date + timedelta(days=1)
    elif repeat_type == 'weekly':
        next_date = base_date + timedelta(weeks=1)
    elif repeat_type == 'monthly':
        month = base_date.month + 1
        year = base_date.year
        if month > 12:
            month = 1
            year += 1
        next_date = base_date.replace(year=year, month=month)
    elif repeat_type == 'custom':
        interval = task["repeat_interval"] or 1
        next_date = base_date + timedelta(days=interval)
    else:
        return
    # 副本不继承父任务和前置依赖
    reward_exp = task["priority"] * 50 * (1.3 if task["task_line"] == 'main' else 1.0)
    reward_lungmen = task["priority"] * 100 * (1.2 if task["task_line"] == 'side' else 1.0)
    # R19：周期副本同样要能产出源石 —— 原来这里直接透传 task 的 0，
    # 于是「重复任务」永远给不出源石（这也是用户觉得源石不够用的原因之一）
    reward_source_stone = task["reward_source_stone"] or auto_reward_source_stone(
        task["priority"], task["task_line"])
    reward_orundum = task["reward_orundum"] or auto_reward_orundum(
        task["priority"], task["task_line"])
    cur.execute("""
        INSERT INTO tasks (
            parent_id, title, description, priority, task_line, status, progress_mode, progress,
            target_value, current_value, prerequisite_id, planned_start, planned_end, due_date,
            repeat_type, repeat_interval, repeat_next_date, created_at, updated_at,
            is_tracked, reward_exp, reward_lungmen, reward_source_stone, reward_orundum,
            drop_config, notes, sort_order, archived, deleted
        ) VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
    """, (
        task["title"],
        task["description"],
        task["priority"],
        task["task_line"],
        'todo',
        'manual' if task["progress_mode"] == 'auto' else task["progress_mode"],
        0,
        task["target_value"],
        0 if task["progress_mode"] == 'count' else None,
        task["planned_start"],
        task["planned_end"],
        task["due_date"],
        repeat_type,
        task["repeat_interval"],
        now_iso(),
        now_iso(),
        0,
        reward_exp,
        reward_lungmen,
        reward_source_stone,
        reward_orundum,
        task["notes"],
        0,
        0,
        0
    ))
    new_task_id = cur.lastrowid
    cur.execute("SELECT tag_id FROM task_tags WHERE task_id = ?", (task_id,))
    tag_ids = [row["tag_id"] for row in cur.fetchall()]
    for tag_id in tag_ids:
        cur.execute("INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)", (new_task_id, tag_id))
    cur.execute("UPDATE tasks SET repeat_next_date = ? WHERE id = ?", (next_date.isoformat(), task_id))


def get_task_with_tags(cur, task_id: int):
    cur.execute("SELECT * FROM tasks WHERE id = ? AND deleted = 0", (task_id,))
    task = cur.fetchone()
    if task is None:
        return None
    task_dict = dict(task)
    # 如果奖励字段为0，则动态计算
    if task_dict["reward_exp"] == 0:
        child_count = cur.execute(
            "SELECT COUNT(*) FROM tasks WHERE parent_id = ? AND deleted = 0 AND archived = 0 AND status != 'cancelled'",
            (task_id,)).fetchone()[0]
        if task["task_line"] == 'main':
            reward_exp = task["priority"] * 50 * 1.3
        else:
            reward_exp = task["priority"] * 50
        reward_exp += child_count * 10
        task_dict["reward_exp"] = reward_exp
    if task_dict["reward_lungmen"] == 0:
        if task["task_line"] == 'side':
            reward_lungmen = task["priority"] * 100 * 1.2
        else:
            reward_lungmen = task["priority"] * 100
        task_dict["reward_lungmen"] = reward_lungmen
    # R19：列表/详情里显示的源石、合成玉也按同一口径兜底，
    # 否则 UI 上写 0、实际发奖却有钱，用户会以为"任务不给源石"。
    if (task_dict["reward_source_stone"] or 0) == 0:
        task_dict["reward_source_stone"] = auto_reward_source_stone(task["priority"], task["task_line"])
    if (task_dict["reward_orundum"] or 0) == 0:
        task_dict["reward_orundum"] = auto_reward_orundum(task["priority"], task["task_line"])
    cur.execute("""
        SELECT t.name, t.color FROM tags t
        JOIN task_tags tt ON t.id = tt.tag_id
        WHERE tt.task_id = ?
    """, (task_id,))
    task_dict["tags"] = [dict(row) for row in cur.fetchall()]
    return task_dict


def build_task_tree(cur, parent_id=None, include_archived=False, include_deleted=False):
    query = "SELECT * FROM tasks WHERE 1=1"
    params = []
    if not include_deleted:
        query += " AND deleted = 0"
    if not include_archived:
        query += " AND archived = 0"
    cur.execute(query, params)
    all_tasks = [dict(row) for row in cur.fetchall()]
    if not all_tasks:
        return []
    task_ids = [t["id"] for t in all_tasks]
    placeholders = ','.join('?' for _ in task_ids)
    cur.execute(
        f"SELECT parent_id, COUNT(*) as cnt FROM tasks WHERE parent_id IN ({placeholders}) AND deleted = 0 AND archived = 0 AND status != 'cancelled' GROUP BY parent_id",
        task_ids)
    child_count_map = {row["parent_id"]: row["cnt"] for row in cur.fetchall()}
    cur.execute(f"""
        SELECT tt.task_id, t.name, t.color
        FROM task_tags tt
        JOIN tags t ON tt.tag_id = t.id
        WHERE tt.task_id IN ({placeholders})
    """, task_ids)
    tag_map = {}
    for row in cur.fetchall():
        task_id = row["task_id"]
        if task_id not in tag_map:
            tag_map[task_id] = []
        tag_map[task_id].append({"name": row["name"], "color": row["color"]})
    task_dict_by_id = {}
    for t in all_tasks:
        t["tags"] = tag_map.get(t["id"], [])
        child_count = child_count_map.get(t["id"], 0)
        if t["reward_exp"] == 0:
            if t["task_line"] == 'main':
                reward_exp = t["priority"] * 50 * 1.3
            else:
                reward_exp = t["priority"] * 50
            reward_exp += child_count * 10
            t["reward_exp"] = reward_exp
        if t["reward_lungmen"] == 0:
            if t["task_line"] == 'side':
                reward_lungmen = t["priority"] * 100 * 1.2
            else:
                reward_lungmen = t["priority"] * 100
            t["reward_lungmen"] = reward_lungmen
        t["children"] = []
        task_dict_by_id[t["id"]] = t
    roots = []
    for t in all_tasks:
        parent = t.get("parent_id")
        if parent is not None and parent in task_dict_by_id:
            task_dict_by_id[parent]["children"].append(t)
        else:
            roots.append(t)

    def sort_key(task):
        dep_ready = True
        if task.get("prerequisite_id"):
            prereq = task_dict_by_id.get(task["prerequisite_id"])
            if prereq and prereq["status"] != 'done':
                dep_ready = False
        line_order = 0 if task["task_line"] == 'main' else 1
        due_date = task.get("due_date") or "9999-12-31T23:59:59Z"
        priority_order = -task["priority"]
        sort_order = task.get("sort_order", 0)
        return (0 if dep_ready else 1, line_order, due_date, priority_order, sort_order)

    def sort_children(node):
        node["children"].sort(key=sort_key)
        for child in node["children"]:
            sort_children(child)

    for root in roots:
        sort_children(root)
    roots.sort(key=sort_key)
    return roots


# ---------- Pydantic 模型 ----------
class TaskCreate(BaseModel):
    title: str
    description: str = ''
    priority: int = Field(1, ge=1, le=6)
    task_line: str = Field('side', pattern='^(main|side)$')
    track: str = Field('daily', pattern='^(daily|campaign)$')
    status: str = Field('todo', pattern='^(todo|in_progress|paused|done|cancelled)$')
    progress_mode: Optional[str] = Field(None, pattern='^(auto|manual|count)$')
    progress: float = 0
    target_value: Optional[float] = None
    current_value: Optional[float] = None
    prerequisite_id: Optional[int] = None
    planned_start: Optional[str] = None
    planned_end: Optional[str] = None
    due_date: Optional[str] = None
    repeat_type: Optional[str] = Field(None, pattern='^(daily|weekly|monthly|custom)$')
    repeat_interval: Optional[int] = None
    repeat_next_date: Optional[str] = None
    is_tracked: bool = False
    reward_exp: Optional[float] = None
    reward_lungmen: Optional[float] = None
    reward_source_stone: float = 0
    reward_orundum: float = 0
    drop_config: Optional[str] = None
    notes: str = ''
    sort_order: float = 0
    parent_id: Optional[int] = None
    tags: List[str] = []

    @validator('progress')
    def progress_range(cls, v):
        if v < 0 or v > 100:
            raise ValueError('progress must be between 0 and 100')
        return v


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[int] = Field(None, ge=1, le=6)
    task_line: Optional[str] = Field(None, pattern='^(main|side)$')
    track: Optional[str] = Field(None, pattern='^(daily|campaign)$')
    status: Optional[str] = Field(None, pattern='^(todo|in_progress|paused|done|cancelled)$')
    progress_mode: Optional[str] = Field(None, pattern='^(auto|manual|count)$')
    progress: Optional[float] = None
    target_value: Optional[float] = None
    current_value: Optional[float] = None
    prerequisite_id: Optional[int] = None
    planned_start: Optional[str] = None
    planned_end: Optional[str] = None
    due_date: Optional[str] = None
    repeat_type: Optional[str] = Field(None, pattern='^(daily|weekly|monthly|custom)$')
    repeat_interval: Optional[int] = None
    repeat_next_date: Optional[str] = None
    is_tracked: Optional[bool] = None
    reward_exp: Optional[float] = None
    reward_lungmen: Optional[float] = None
    reward_source_stone: Optional[float] = None
    reward_orundum: Optional[float] = None
    drop_config: Optional[str] = None
    notes: Optional[str] = None
    sort_order: Optional[float] = None
    parent_id: Optional[int] = None
    archived: Optional[bool] = None
    deleted: Optional[bool] = None
    tags: Optional[List[str]] = None


class ProgressUpdate(BaseModel):
    progress: float = Field(..., ge=0, le=100)


class CountUpdate(BaseModel):
    current_value: float = Field(..., ge=0)


class TrackingStart(BaseModel):
    focus_mode: bool = False


class ImportData(BaseModel):
    version: int
    tasks: List[Dict[str, Any]]
    tags: Optional[List[Dict[str, str]]] = []


class ReorderRequest(BaseModel):
    task_ids: List[int]


class ExchangeRequest(BaseModel):
    # 兑换方向：from_type 消耗，to_type 获得。
    # 经济规则（明日方舟原版）：
    #   - 龙门币只能通过任务 / 礼包获得，不可被兑换出去（禁止作为 from_type）。
    #   - 源石不可被兑换出去（禁止作为 from_type）。
    #   - 唯一允许的兑换：源石 → 合成玉，比例 1 源石 = 180 合成玉。
    from_type: str = Field(..., pattern='^(source_stone)$')
    to_type: str = Field(..., pattern='^(orundum)$')
    amount: float = Field(..., gt=0)


class PomodoroStart(BaseModel):
    kind: str = Field('focus', pattern='^(focus|break)$')
    task_id: Optional[int] = None
    planned_seconds: Optional[int] = Field(None, gt=0)


class RealityRewardCreate(BaseModel):
    title: str
    description: str = ''
    target_type: str = Field(..., pattern='^(level|exp|tasks_completed|streak_days|tracking_hours|custom)$')
    target_value: float = Field(..., gt=0)
    current_value: float = 0
    reward_text: str = ''


class RealityRewardUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    target_type: Optional[str] = Field(None, pattern='^(level|exp|tasks_completed|streak_days|tracking_hours|custom)$')
    target_value: Optional[float] = Field(None, gt=0)
    current_value: Optional[float] = Field(None, ge=0)
    reward_text: Optional[str] = None
    status: Optional[str] = Field(None, pattern='^(pending|achieved|claimed|archived)$')


# ---------- 循环依赖检查 ----------
def check_cycle_prerequisite(cur, task_id: int, new_prereq_id: int) -> bool:
    visited = set()
    stack = [new_prereq_id]
    while stack:
        current = stack.pop()
        if current == task_id:
            return True
        if current in visited:
            continue
        visited.add(current)
        cur.execute("SELECT prerequisite_id FROM tasks WHERE id = ?", (current,))
        row = cur.fetchone()
        if row and row["prerequisite_id"]:
            stack.append(row["prerequisite_id"])
    return False


def check_cycle_parent(cur, task_id: int, new_parent_id: int) -> bool:
    current = new_parent_id
    while current is not None:
        if current == task_id:
            return True
        cur.execute("SELECT parent_id FROM tasks WHERE id = ?", (current,))
        row = cur.fetchone()
        current = row["parent_id"] if row else None
    return False


# ---------- FastAPI 应用 ----------
app = FastAPI(title="QUEST LOG API")

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/media/{file_path:path}")
async def media_file(file_path: str, request: Request):
    base_dir = os.path.realpath(os.path.join(STATIC_DIR, "wallpapers"))
    full_path = os.path.realpath(os.path.join(base_dir, file_path))
    if not full_path.startswith(base_dir) or not os.path.isfile(full_path):
        raise HTTPException(status_code=404, detail="文件不存在")

    file_size = os.path.getsize(full_path)
    content_type = mimetypes.guess_type(full_path)[0] or "video/mp4"

    range_header = request.headers.get("range")

    if range_header:
        try:
            range_str = range_header.replace("bytes=", "")
            start_str, _, end_str = range_str.partition("-")
            start = int(start_str) if start_str else 0
            end = int(end_str) if end_str else file_size - 1

            if start >= file_size:
                return Response(status_code=416, headers={"Content-Range": f"bytes */{file_size}"})

            end = min(end, file_size - 1)
            length = end - start + 1

            def iterfile_range():
                with open(full_path, "rb") as f:
                    f.seek(start)
                    remaining = length
                    chunk_size = 1024 * 1024
                    while remaining > 0:
                        read_size = min(chunk_size, remaining)
                        chunk = f.read(read_size)
                        if not chunk:
                            break
                        yield chunk
                        remaining -= len(chunk)

            return StreamingResponse(
                iterfile_range(),
                status_code=206,
                headers={
                    "Content-Range": f"bytes {start}-{end}/{file_size}",
                    "Accept-Ranges": "bytes",
                    "Content-Length": str(length),
                    "Content-Type": content_type,
                    "Cache-Control": "no-cache",
                }
            )
        except (ValueError, IndexError):
            pass

    def iterfile_full():
        with open(full_path, "rb") as f:
            chunk_size = 1024 * 1024
            while True:
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                yield chunk

    return StreamingResponse(
        iterfile_full(),
        headers={
            "Accept-Ranges": "bytes",
            "Content-Type": content_type,
            "Cache-Control": "no-cache",
        }
    )


@app.middleware("http")
async def unify_response_format(request, call_next):
    response = await call_next(request)
    ctype = response.headers.get("content-type", "")
    if not ctype.startswith("application/json"):
        return response
    # Read the full body, then rebuild a fresh Response from the parsed data
    # so the consumed body_iterator never leaves a stale Content-Length.
    body = b""
    async for chunk in response.body_iterator:
        body += chunk
    try:
        data = json.loads(body)
    except Exception:
        return Response(content=body, media_type=ctype,
                        status_code=response.status_code)
    if isinstance(data, dict) and "code" not in data and "data" in data:
        data = {"code": 0, "message": "ok", "data": data["data"]}
    out = json.dumps(data, ensure_ascii=False).encode("utf-8")
    return Response(content=out, media_type="application/json",
                    status_code=response.status_code)


@app.get("/")
async def read_root():
    return FileResponse("static/index.html")


@app.on_event("startup")
async def startup():
    init_db()
    refresh_thread = threading.Thread(target=background_weekly_pack_refresh, daemon=True)
    refresh_thread.start()


@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(status_code=exc.status_code,
                        content={"code": exc.status_code, "message": exc.detail, "data": None})


# ---------- API 路由 ----------
@app.get("/api/version")
async def get_version():
    """版本号固定为 V1.0（用户要求：不再随 git 提交数自动变化）。

    构建信息（build / commit / date / subject）仍然保留，鼠标悬停能看到，
    只是顶栏显示的那个版本号不再滚动。
    """
    info = dict(app_version_info())
    info["version"] = "V1.0"
    return {"data": info}


@app.get("/api/tasks/tree")
async def get_task_tree(include_archived: bool = False, include_deleted: bool = False):
    with db_cursor() as cur:
        # 每次读任务前先按 04:00 日界线归位重复任务，这样「打开页面 = 自动刷新日常」
        sweep_repeat_tasks(cur)
        tree = build_task_tree(cur, include_archived=include_archived, include_deleted=include_deleted)
    return {"data": tree}


@app.get("/api/tasks")
async def get_tasks(
        sweep: bool = True,
        status: Optional[str] = None,
        priority: Optional[int] = None,
        tag: Optional[str] = None,
        task_line: Optional[str] = None,
        track: Optional[str] = None,
        is_tracked: Optional[bool] = None,
        keyword: Optional[str] = None,
        include_archived: bool = False,
        include_deleted: bool = False,
):
    with db_cursor() as cur:
        if sweep:
            sweep_repeat_tasks(cur)
        query = "SELECT * FROM tasks WHERE 1=1"
        params = []
        if not include_deleted:
            query += " AND deleted = 0"
        if not include_archived:
            query += " AND archived = 0"
        if status:
            query += " AND status = ?"
            params.append(status)
        if priority:
            query += " AND priority = ?"
            params.append(priority)
        if task_line:
            query += " AND task_line = ?"
            params.append(task_line)
        if track:
            query += " AND track = ?"
            params.append(track)
        if is_tracked is not None:
            query += " AND is_tracked = ?"
            params.append(1 if is_tracked else 0)
        if keyword:
            query += " AND (title LIKE ? OR description LIKE ?)"
            kw = f"%{keyword}%"
            params.extend([kw, kw])
        if tag:
            query += " AND id IN (SELECT task_id FROM task_tags WHERE tag_id IN (SELECT id FROM tags WHERE name = ?))"
            params.append(tag)
        query += """
            ORDER BY 
                CASE WHEN 
                    (prerequisite_id IS NULL OR prerequisite_id IN (SELECT id FROM tasks WHERE status='done'))
                    AND
                    (parent_id IS NULL OR parent_id IN (SELECT id FROM tasks WHERE status='done'))
                THEN 0 ELSE 1 END,
                CASE task_line WHEN 'main' THEN 0 ELSE 1 END,
                due_date IS NULL, due_date ASC,
                priority DESC,
                sort_order ASC
        """
        cur.execute(query, params)
        tasks = cur.fetchall()
        task_ids = [row["id"] for row in tasks]
        if not task_ids:
            return {"data": []}
        placeholders = ','.join('?' for _ in task_ids)
        cur.execute(
            f"SELECT parent_id, COUNT(*) as cnt FROM tasks WHERE parent_id IN ({placeholders}) AND deleted = 0 AND archived = 0 AND status != 'cancelled' GROUP BY parent_id",
            task_ids)
        child_count_map = {row["parent_id"]: row["cnt"] for row in cur.fetchall()}
        cur.execute(f"""
            SELECT tt.task_id, t.name, t.color
            FROM task_tags tt
            JOIN tags t ON tt.tag_id = t.id
            WHERE tt.task_id IN ({placeholders})
        """, task_ids)
        tag_map = {}
        for row in cur.fetchall():
            task_id = row["task_id"]
            if task_id not in tag_map:
                tag_map[task_id] = []
            tag_map[task_id].append({"name": row["name"], "color": row["color"]})
        result = []
        for task in tasks:
            task_dict = dict(task)
            child_count = child_count_map.get(task["id"], 0)
            if task_dict["reward_exp"] == 0:
                if task["task_line"] == 'main':
                    reward_exp = task["priority"] * 50 * 1.3
                else:
                    reward_exp = task["priority"] * 50
                reward_exp += child_count * 10
                task_dict["reward_exp"] = reward_exp
            if task_dict["reward_lungmen"] == 0:
                if task["task_line"] == 'side':
                    reward_lungmen = task["priority"] * 100 * 1.2
                else:
                    reward_lungmen = task["priority"] * 100
                task_dict["reward_lungmen"] = reward_lungmen
            # R19：源石 / 合成玉同样兜底（与 _grant_task_rewards 同口径）
            if (task_dict["reward_source_stone"] or 0) == 0:
                task_dict["reward_source_stone"] = auto_reward_source_stone(task["priority"], task["task_line"])
            if (task_dict["reward_orundum"] or 0) == 0:
                task_dict["reward_orundum"] = auto_reward_orundum(task["priority"], task["task_line"])
            task_dict["tags"] = tag_map.get(task["id"], [])
            result.append(task_dict)
    return {"data": result}


@app.get("/api/tasks/{task_id}")
async def get_task(task_id: int):
    with db_cursor() as cur:
        task = get_task_with_tags(cur, task_id)
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
    return {"data": task}


ALLOWED_STATUS_TRANSITIONS = {
    "todo": ["in_progress", "paused", "cancelled", "done"],
    "in_progress": ["paused", "done", "cancelled"],
    "paused": ["in_progress", "todo", "cancelled", "done"],
    "done": [],
    "cancelled": ["todo"]
}


@app.post("/api/tasks")
async def create_task(task: TaskCreate):
    with db_cursor() as cur:
        if task.parent_id is not None:
            cur.execute("SELECT id, status FROM tasks WHERE id = ? AND deleted = 0", (task.parent_id,))
            parent = cur.fetchone()
            if not parent:
                raise HTTPException(status_code=400, detail="父任务不存在或已删除")
            # 父子为聚合关系，子任务可独立创建为已完成状态，不再因父未完成而拦截
        if task.prerequisite_id is not None:
            cur.execute("SELECT id, status FROM tasks WHERE id = ? AND deleted = 0", (task.prerequisite_id,))
            prereq = cur.fetchone()
            if not prereq:
                raise HTTPException(status_code=400, detail="前置任务不存在或已删除")
            if task.status == 'done' and prereq["status"] != 'done':
                raise HTTPException(status_code=400, detail="前置任务未完成，不能直接创建为已完成状态")
        progress_mode = 'count' if task.target_value is not None else 'manual'
        if progress_mode == 'count':
            if task.current_value is None:
                if task.status == 'done':
                    raise HTTPException(status_code=400, detail="计数任务直接创建为已完成状态时必须提供 current_value")
                current_value = 0
            else:
                current_value = task.current_value
            if task.status == 'done' and current_value < task.target_value:
                raise HTTPException(status_code=400, detail="计数任务 current_value 未达到目标值，不能标记为完成")
        else:
            current_value = None
        reward_exp = task.reward_exp if task.reward_exp is not None else 0
        reward_lungmen = task.reward_lungmen if task.reward_lungmen is not None else 0
        if task.status == 'done':
            progress_value = 100
        elif progress_mode == 'manual':
            progress_value = task.progress
        elif progress_mode == 'count' and task.target_value:
            progress_value = (current_value / task.target_value) * 100
        else:
            progress_value = 0
        completed_at = now_iso() if task.status == 'done' else None

        cur.execute("""
            INSERT INTO tasks (
                parent_id, title, description, priority, task_line, track, status, progress_mode, progress,
                target_value, current_value, prerequisite_id, planned_start, planned_end, due_date,
                repeat_type, repeat_interval, repeat_next_date, created_at, updated_at,
                is_tracked, reward_exp, reward_lungmen, reward_source_stone, reward_orundum,
                drop_config, notes, sort_order, archived, deleted, completed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            task.parent_id,
            task.title,
            task.description,
            task.priority,
            task.task_line,
            task.track,
            task.status,
            progress_mode,
            progress_value,
            task.target_value,
            current_value if progress_mode == 'count' else None,
            task.prerequisite_id,
            task.planned_start,
            task.planned_end,
            task.due_date,
            task.repeat_type,
            task.repeat_interval,
            task.repeat_next_date,
            now_iso(),
            now_iso(),
            1 if task.is_tracked else 0,
            reward_exp,
            reward_lungmen,
            task.reward_source_stone,
            task.reward_orundum,
            task.drop_config if task.status != 'done' else None,
            task.notes,
            task.sort_order,
            0,
            0,
            completed_at
        ))
        task_id = cur.lastrowid
        if task.prerequisite_id is not None:
            if check_cycle_prerequisite(cur, task_id, task.prerequisite_id):
                raise HTTPException(status_code=400, detail="前置任务形成循环依赖")
        for tag_name in task.tags:
            cur.execute("SELECT id FROM tags WHERE name = ?", (tag_name,))
            tag_row = cur.fetchone()
            if tag_row:
                tag_id = tag_row[0]
            else:
                cur.execute("INSERT INTO tags (name) VALUES (?)", (tag_name,))
                tag_id = cur.lastrowid
            cur.execute("INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)", (task_id, tag_id))
        cur.execute("SELECT COUNT(*) FROM tasks WHERE deleted = 0")
        total_created = cur.fetchone()[0]
        check_achievement(cur, 'task_count_created', total_created, task_id)
        # R23：子任务 / 战役 / 备注 这几类也随新建任务变化
        check_cumulative_achievements(cur, task_id)
        if task.parent_id:
            update_parent_progress(cur, task.parent_id)
        if task.status == 'done':
            handle_task_completion(cur, task_id)
        new_task = get_task_with_tags(cur, task_id)
    return {"data": new_task}


@app.put("/api/tasks/{task_id}")
async def update_task(task_id: int, updates: TaskUpdate):
    with db_cursor() as cur:
        cur.execute("SELECT * FROM tasks WHERE id = ? AND deleted = 0", (task_id,))
        existing = cur.fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="任务不存在")

        if updates.status is not None and updates.status != existing["status"]:
            allowed = ALLOWED_STATUS_TRANSITIONS.get(existing["status"], [])
            if updates.status not in allowed:
                raise HTTPException(status_code=400, detail=f"不允许从 {existing['status']} 转换到 {updates.status}")

        if existing['status'] == 'done':
            if updates.parent_id is not None or updates.prerequisite_id is not None:
                raise HTTPException(status_code=400, detail="已完成任务不能修改父任务或前置依赖")
        if existing['status'] == 'done' and existing['reward_claimed'] == 1:
            if updates.priority is not None or updates.task_line is not None:
                raise HTTPException(status_code=400, detail="任务已领取奖励，不能修改优先级或任务线")

        if existing['status'] == 'done' and (updates.status is None or updates.status == 'done'):
            forbidden = ['progress', 'current_value', 'target_value', 'progress_mode']
            for field in forbidden:
                if getattr(updates, field) is not None:
                    raise HTTPException(status_code=400, detail="任务已完成，不能修改进度相关字段")
        if existing['status'] == 'done' and existing[
            'reward_claimed'] == 1 and updates.status is not None and updates.status != 'done':
            raise HTTPException(status_code=400, detail="任务已领取奖励，不可回退")
        if existing['status'] == 'done' and existing[
            'repeat_type'] and updates.status is not None and updates.status != 'done':
            raise HTTPException(status_code=400, detail="重复任务已完成，不可回退")

        update_fields = {}
        for field, value in updates.dict(exclude_unset=True).items():
            if field == 'tags':
                continue
            if field == 'is_tracked':
                update_fields[field] = 1 if value else 0
            elif field in ('archived', 'deleted'):
                update_fields[field] = 1 if value else 0
            else:
                update_fields[field] = value

        new_prerequisite_id = update_fields.get('prerequisite_id', existing['prerequisite_id'])
        new_parent_id = update_fields.get('parent_id', existing['parent_id'])

        if new_parent_id is not None:
            cur.execute("SELECT id, status FROM tasks WHERE id = ? AND deleted = 0", (new_parent_id,))
            parent = cur.fetchone()
            if not parent:
                raise HTTPException(status_code=400, detail="父任务不存在或已删除")
            if check_cycle_parent(cur, task_id, new_parent_id):
                raise HTTPException(status_code=400, detail="父任务形成循环依赖")
            # 父子为聚合关系，不再用「父未完成」拦截子任务置为 done
            final_status = update_fields.get('status', existing['status'])
        if new_prerequisite_id is not None:
            cur.execute("SELECT id, status FROM tasks WHERE id = ? AND deleted = 0", (new_prerequisite_id,))
            prereq = cur.fetchone()
            if not prereq:
                raise HTTPException(status_code=400, detail="前置任务不存在或已删除")
            if check_cycle_prerequisite(cur, task_id, new_prerequisite_id):
                raise HTTPException(status_code=400, detail="前置任务形成循环依赖")
            final_status = update_fields.get('status', existing['status'])
            if final_status == 'done' and prereq['status'] != 'done':
                raise HTTPException(status_code=400, detail="前置任务未完成")

        status_changed_to_done = update_fields.get('status') == 'done' and existing['status'] != 'done'
        if status_changed_to_done:
            target_value = update_fields.get('target_value', existing['target_value'])
            current_value = update_fields.get('current_value', existing['current_value'])
            if target_value is not None and (current_value is None or current_value < target_value):
                raise HTTPException(status_code=400, detail="计数任务未达到目标值")
            update_fields['completed_at'] = now_iso()
            update_fields['progress'] = 100
            if target_value is not None and current_value < target_value:
                update_fields['current_value'] = target_value

        update_fields['updated_at'] = now_iso()
        set_clause = ', '.join([f"{k} = ?" for k in update_fields.keys()])
        values = list(update_fields.values())
        values.append(task_id)
        cur.execute(f"UPDATE tasks SET {set_clause} WHERE id = ?", values)

        cur.execute("SELECT target_value, parent_id FROM tasks WHERE id = ?", (task_id,))
        row = cur.fetchone()
        target_value = row["target_value"] if row else None
        parent_id = row["parent_id"] if row else None
        cur.execute(
            "SELECT COUNT(*) FROM tasks WHERE parent_id = ? AND deleted = 0 AND archived = 0 AND status != 'cancelled'",
            (task_id,))
        has_children = cur.fetchone()[0] > 0
        if has_children:
            new_mode = 'auto'
        elif target_value is not None:
            new_mode = 'count'
        else:
            new_mode = 'manual'
        cur.execute("UPDATE tasks SET progress_mode = ? WHERE id = ?", (new_mode, task_id))

        if updates.tags is not None:
            cur.execute("DELETE FROM task_tags WHERE task_id = ?", (task_id,))
            for tag_name in updates.tags:
                cur.execute("SELECT id FROM tags WHERE name = ?", (tag_name,))
                tag_row = cur.fetchone()
                if tag_row:
                    tag_id = tag_row[0]
                else:
                    cur.execute("INSERT INTO tags (name) VALUES (?)", (tag_name,))
                    tag_id = cur.lastrowid
                cur.execute("INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)", (task_id, tag_id))

        if not status_changed_to_done and existing['status'] != 'done':
            cur.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
            updated_task = cur.fetchone()
            if updated_task['progress_mode'] == 'count' and updated_task['target_value'] is not None and updated_task[
                'current_value'] is not None and updated_task['current_value'] >= updated_task['target_value']:
                if updated_task['prerequisite_id']:
                    cur.execute("SELECT status FROM tasks WHERE id = ?", (updated_task['prerequisite_id'],))
                    prereq = cur.fetchone()
                    if prereq and prereq['status'] != 'done':
                        raise HTTPException(status_code=400, detail="前置任务未完成")
                # 父子为聚合关系，不再用「父未完成」拦截子任务自动置为 done
                cur.execute("UPDATE tasks SET status='done', progress=100, completed_at=?, updated_at=? WHERE id=?",
                            (now_iso(), now_iso(), task_id))
                handle_task_completion(cur, task_id)

        if status_changed_to_done:
            handle_task_completion(cur, task_id)

        if 'parent_id' in update_fields:
            if existing["parent_id"]:
                update_parent_progress(cur, existing["parent_id"])
            if update_fields['parent_id']:
                update_parent_progress(cur, update_fields['parent_id'])
        elif 'progress' in update_fields or 'status' in update_fields or 'current_value' in update_fields:
            if existing["parent_id"]:
                update_parent_progress(cur, existing["parent_id"])

        updated_task = get_task_with_tags(cur, task_id)
    return {"data": updated_task}


@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: int):
    with db_cursor() as cur:
        def soft_delete_recursive(pid):
            cur.execute("""
                UPDATE tracking_sessions 
                SET ended_at = ?, duration_seconds = CAST((julianday(?) - julianday(started_at)) * 86400 AS INTEGER)
                WHERE task_id = ? AND ended_at IS NULL
            """, (now_iso(), now_iso(), pid))
            cur.execute("UPDATE tasks SET is_tracked = 0 WHERE id = ?", (pid,))
            cur.execute("UPDATE tasks SET deleted = 1, updated_at = ? WHERE id = ? AND deleted = 0", (now_iso(), pid))
            cur.execute("SELECT id FROM tasks WHERE parent_id = ? AND deleted = 0", (pid,))
            children = cur.fetchall()
            for child in children:
                soft_delete_recursive(child["id"])

        soft_delete_recursive(task_id)
        cur.execute(
            "SELECT COALESCE(SUM(duration_seconds), 0) as total_seconds FROM tracking_sessions WHERE ended_at IS NOT NULL")
        total_hours = cur.fetchone()[0] / 3600
        check_achievement(cur, 'tracking_hours_total', total_hours, task_id)
        # R23：追踪次数也是累计型蚀刻章
        check_cumulative_achievements(cur, task_id)
        cur.execute("SELECT parent_id FROM tasks WHERE id = ?", (task_id,))
        row = cur.fetchone()
        parent_id = row["parent_id"] if row else None
        if parent_id:
            update_parent_progress(cur, parent_id)
    return {"data": {"id": task_id, "deleted": True}}


@app.post("/api/tasks/{task_id}/restore")
async def restore_task(task_id: int):
    with db_cursor() as cur:
        def restore_recursive(pid):
            cur.execute("UPDATE tasks SET deleted = 0, updated_at = ? WHERE id = ? AND deleted = 1", (now_iso(), pid))
            cur.execute("SELECT id FROM tasks WHERE parent_id = ? AND deleted = 1", (pid,))
            children = cur.fetchall()
            for child in children:
                restore_recursive(child["id"])

        restore_recursive(task_id)
        cur.execute("SELECT parent_id FROM tasks WHERE id = ?", (task_id,))
        row = cur.fetchone()
        parent_id = row["parent_id"] if row else None
        if parent_id:
            update_parent_progress(cur, parent_id)
    return {"data": {"id": task_id, "restored": True}}


@app.post("/api/tasks/reorder")
async def reorder_tasks(request: ReorderRequest):
    with db_cursor() as cur:
        if not request.task_ids:
            return {"data": {"reordered": True}}
        placeholders = ','.join('?' for _ in request.task_ids)
        cur.execute(f"SELECT id, parent_id FROM tasks WHERE id IN ({placeholders}) AND deleted = 0", request.task_ids)
        tasks = cur.fetchall()
        if len(tasks) != len(request.task_ids):
            raise HTTPException(status_code=400, detail="部分任务不存在")
        parent_ids = set(task["parent_id"] for task in tasks)
        if len(parent_ids) > 1:
            raise HTTPException(status_code=400, detail="只能对同一层级的任务排序")
        for idx, task_id in enumerate(request.task_ids):
            cur.execute("UPDATE tasks SET sort_order = ?, updated_at = ? WHERE id = ?", (idx, now_iso(), task_id))
    return {"data": {"reordered": True}}


@app.post("/api/tasks/{task_id}/archive")
async def archive_task(task_id: int):
    with db_cursor() as cur:
        def archive_recursive(pid):
            cur.execute("UPDATE tasks SET archived = 1, updated_at = ? WHERE id = ? AND deleted = 0", (now_iso(), pid))
            cur.execute("SELECT id FROM tasks WHERE parent_id = ? AND deleted = 0", (pid,))
            children = cur.fetchall()
            for child in children:
                archive_recursive(child["id"])

        archive_recursive(task_id)
        cur.execute("SELECT parent_id FROM tasks WHERE id = ?", (task_id,))
        row = cur.fetchone()
        parent_id = row["parent_id"] if row else None
        if parent_id:
            update_parent_progress(cur, parent_id)
    return {"data": {"id": task_id, "archived": True}}


@app.post("/api/tasks/{task_id}/unarchive")
async def unarchive_task(task_id: int):
    with db_cursor() as cur:
        def unarchive_recursive(pid):
            cur.execute("UPDATE tasks SET archived = 0, updated_at = ? WHERE id = ? AND deleted = 0", (now_iso(), pid))
            cur.execute("SELECT id FROM tasks WHERE parent_id = ? AND deleted = 0", (pid,))
            children = cur.fetchall()
            for child in children:
                unarchive_recursive(child["id"])

        unarchive_recursive(task_id)
        cur.execute("SELECT parent_id FROM tasks WHERE id = ?", (task_id,))
        row = cur.fetchone()
        parent_id = row["parent_id"] if row else None
        if parent_id:
            update_parent_progress(cur, parent_id)
    return {"data": {"id": task_id, "archived": False}}


@app.post("/api/tasks/{task_id}/progress")
async def update_progress(task_id: int, progress_update: ProgressUpdate):
    with db_cursor() as cur:
        cur.execute("SELECT * FROM tasks WHERE id = ? AND deleted = 0", (task_id,))
        task = cur.fetchone()
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        if task["progress_mode"] != 'manual':
            raise HTTPException(status_code=400, detail="该任务不是手动进度模式")
        cur.execute("UPDATE tasks SET progress = ?, updated_at = ? WHERE id = ?",
                    (progress_update.progress, now_iso(), task_id))
        if task["parent_id"]:
            update_parent_progress(cur, task["parent_id"])
    return {"data": {"id": task_id, "progress": progress_update.progress}}


@app.post("/api/tasks/{task_id}/count")
async def update_count(task_id: int, count_update: CountUpdate):
    with db_cursor() as cur:
        cur.execute("SELECT * FROM tasks WHERE id = ? AND deleted = 0", (task_id,))
        task = cur.fetchone()
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        if task["progress_mode"] != 'count':
            raise HTTPException(status_code=400, detail="该任务不是计数模式")
        current = count_update.current_value
        target = task["target_value"]
        if target and current >= target:
            if task["prerequisite_id"]:
                cur.execute("SELECT status FROM tasks WHERE id = ?", (task["prerequisite_id"],))
                prereq = cur.fetchone()
            if prereq and prereq["status"] != 'done':
                raise HTTPException(status_code=400, detail="前置任务未完成")
            # 父子为聚合关系，不再用「父未完成」拦截子任务自动置为 done
        progress = (current / target * 100) if target else 0
        cur.execute("UPDATE tasks SET current_value = ?, progress = ?, updated_at = ? WHERE id = ?",
                    (current, progress, now_iso(), task_id))
        if target and current >= target:
            cur.execute(
                "UPDATE tasks SET status = 'done', progress = 100, completed_at = ?, updated_at = ? WHERE id = ?",
                (now_iso(), now_iso(), task_id))
            handle_task_completion(cur, task_id)
        if task["parent_id"]:
            update_parent_progress(cur, task["parent_id"])
    return {"data": {"id": task_id, "current_value": current, "progress": progress}}


@app.post("/api/tasks/{task_id}/track/start")
async def start_tracking(task_id: int, tracking_start: TrackingStart):
    with db_cursor() as cur:
        cur.execute("SELECT * FROM tasks WHERE id = ? AND deleted = 0", (task_id,))
        task = cur.fetchone()
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        cur.execute("""
            UPDATE tracking_sessions 
            SET ended_at = ?, duration_seconds = CAST((julianday(?) - julianday(started_at)) * 86400 AS INTEGER)
            WHERE ended_at IS NULL
        """, (now_iso(), now_iso()))
        cur.execute(
            "SELECT COALESCE(SUM(duration_seconds), 0) as total_seconds FROM tracking_sessions WHERE ended_at IS NOT NULL")
        total_hours = cur.fetchone()[0] / 3600
        check_achievement(cur, 'tracking_hours_total', total_hours, task_id)
        # R23：追踪次数也是累计型蚀刻章
        check_cumulative_achievements(cur, task_id)
        cur.execute("INSERT INTO tracking_sessions (task_id, started_at, focus_mode) VALUES (?, ?, ?)",
                    (task_id, now_iso(), 1 if tracking_start.focus_mode else 0))
        cur.execute("UPDATE tasks SET is_tracked = 1, updated_at = ? WHERE id = ?", (now_iso(), task_id))
        cur.execute("UPDATE tasks SET is_tracked = 0, updated_at = ? WHERE id != ?", (now_iso(), task_id))
    return {"data": {"task_id": task_id, "tracking": True}}


@app.post("/api/tasks/{task_id}/track/stop")
async def stop_tracking(task_id: int):
    with db_cursor() as cur:
        cur.execute("""
            UPDATE tracking_sessions 
            SET ended_at = ?, duration_seconds = CAST((julianday(?) - julianday(started_at)) * 86400 AS INTEGER)
            WHERE task_id = ? AND ended_at IS NULL
        """, (now_iso(), now_iso(), task_id))
        cur.execute("UPDATE tasks SET is_tracked = 0, updated_at = ? WHERE id = ?", (now_iso(), task_id))
        cur.execute(
            "SELECT COALESCE(SUM(duration_seconds), 0) as total_seconds FROM tracking_sessions WHERE ended_at IS NOT NULL")
        total_hours = cur.fetchone()[0] / 3600
        check_achievement(cur, 'tracking_hours_total', total_hours, task_id)
        # R23：追踪次数也是累计型蚀刻章
        check_cumulative_achievements(cur, task_id)
    return {"data": {"task_id": task_id, "tracking": False}}


@app.get("/api/tracking/current")
async def get_current_tracking():
    with db_cursor() as cur:
        cur.execute("""
            SELECT ts.*, t.title, t.id as task_id
            FROM tracking_sessions ts
            JOIN tasks t ON ts.task_id = t.id
            WHERE ts.ended_at IS NULL
            ORDER BY ts.started_at DESC LIMIT 1
        """)
        session = cur.fetchone()
        if not session:
            return {"data": None}
        return {"data": dict(session)}


@app.get("/api/pomodoro/current")
async def get_current_pomodoro():
    with db_cursor() as cur:
        cur.execute("SELECT * FROM pomodoro_sessions WHERE status = 'running' ORDER BY started_at DESC LIMIT 1")
        session = cur.fetchone()
        if not session:
            return {"data": None}
        return {"data": dict(session)}


@app.post("/api/pomodoro/start")
async def start_pomodoro(pomodoro: PomodoroStart):
    with db_cursor() as cur:
        close_open_pomodoro(cur)
        planned = pomodoro.planned_seconds
        if planned is None:
            cur.execute("SELECT settings_json FROM settings WHERE id = 1")
            row = cur.fetchone()
            settings = json.loads(row[0]) if row else {}
            minutes = settings.get("pomodoro_focus_minutes" if pomodoro.kind == 'focus' else "pomodoro_break_minutes", 25 if pomodoro.kind == 'focus' else 5)
            planned = int(minutes) * 60
        cur.execute("INSERT INTO pomodoro_sessions (task_id, kind, planned_seconds, started_at, status) VALUES (?, ?, ?, ?, 'running')",
                    (pomodoro.task_id, pomodoro.kind, planned, now_iso()))
        session_id = cur.lastrowid
        cur.execute("SELECT * FROM pomodoro_sessions WHERE id = ?", (session_id,))
        return {"data": dict(cur.fetchone())}


@app.post("/api/pomodoro/stop")
async def stop_pomodoro():
    with db_cursor() as cur:
        cur.execute("""
            UPDATE pomodoro_sessions
            SET ended_at = ?, status = 'completed'
            WHERE status = 'running'
        """, (now_iso(),))
        cur.execute("SELECT * FROM pomodoro_sessions WHERE status = 'completed' ORDER BY ended_at DESC LIMIT 1")
        session = cur.fetchone()
        # 番茄钟类蚀刻章
        cur.execute("SELECT COUNT(*) FROM pomodoro_sessions WHERE status = 'completed'")
        check_achievement(cur, 'pomodoro_count', cur.fetchone()[0], None)
        # R23：番茄钟累计分钟
        check_cumulative_achievements(cur, None)
        return {"data": dict(session) if session else None}


@app.post("/api/tasks/{task_id}/complete")
async def complete_task(task_id: int):
    with db_cursor() as cur:
        cur.execute("SELECT * FROM tasks WHERE id = ? AND deleted = 0", (task_id,))
        task = cur.fetchone()
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        if task["status"] == 'done':
            raise HTTPException(status_code=400, detail="任务已完成")
        if task["status"] == 'cancelled':
            raise HTTPException(status_code=400, detail="任务已取消")
        if task["prerequisite_id"]:
            cur.execute("SELECT status FROM tasks WHERE id = ?", (task["prerequisite_id"],))
            prereq = cur.fetchone()
            if prereq and prereq["status"] != 'done':
                raise HTTPException(status_code=400, detail="前置任务未完成")
        # 父子是聚合关系，不再互相当门禁（避免双向死锁）。
        # 父任务完成：级联完成其下所有未完成子任务（递归），使聚合语义成立。
        cascade_complete_descendants(cur, task_id)
        if task["progress_mode"] == 'count' and (
                task["current_value"] is None or task["current_value"] < task["target_value"]):
            raise HTTPException(status_code=400, detail="计数任务未达到目标值")
        cur.execute("""
            UPDATE tasks SET status = 'done', progress = 100, completed_at = ?, updated_at = ?
            WHERE id = ?
        """, (now_iso(), now_iso(), task_id))
        handle_task_completion(cur, task_id)
    return {"data": {"id": task_id, "status": "done"}}


# =========================================================================
# 任务奖励经济总配置（R24：对齐明日方舟原版产出节奏）
# -------------------------------------------------------------------------
# 用户反馈「任务奖励给得过多、源石获取太容易」。对照原版各渠道产出重新校准，
# 所有数值集中在下面这一个 ECONOMY 字典里，后续要调只改这里。
#
# 【原版各渠道产出基准】（推导下面数值的依据）
#   日常任务       100 合成玉 / 日   （15 个任务点 ≈ 6.7 玉/点）
#   周常任务       500 合成玉 / 周   （17 个周常目标 ≈ 29 玉/个）
#   剿灭作战      1800 合成玉 / 周   （未通「龙门市区 400 斩」时 1400 → 1600 → 1800）
#   月度签到     ~1000 合成玉 / 月
#   版本维护       300 合成玉 / 次   （大版本停服维护 5 颗源石）
#   主线首通         1 颗源石 + 10~30 合成玉（普通）/ 30 合成玉（突袭）
#   信用商店       280 合成玉 / 周   （20 信用点 = 10 玉，每日 2 次）
#   单抽 600 合成玉 / 十连 6000；1 源石 = 180 合成玉（仅允许源石→合成玉）
#
# 结论：原版 F2P 每月稳定约 1.5 万合成玉 ≈ 25 抽（≈ 5.8 抽/周）。
#       原版是靠「渠道周期上限」卡住产出的 —— 日常每日就 100，剿灭每周就 1800，
#       再多打也不给。所以这里除了调低单价，还必须加周期上限，
#       否则「多刷任务 = 无限抽」的漏洞依然存在。
# =========================================================================
ECONOMY = {
    # ── 抽卡成本与汇率（原版固定值，别随手改）──
    "draw_cost_orundum": 600,              # 单次寻访
    "draw_cost_ten": 6000,                 # 十连
    "achievement_draw_cost": 300,          # 蚀刻章抽取（非干员寻访，半价小抽）
    "stone_to_orundum": 180,               # 1 源石 = 180 合成玉

    # ── 原版渠道基准（只读参考，改动不影响逻辑，仅用于解释下面数值来源）──
    "origin_daily_orundum": 100,
    "origin_weekly_orundum": 500,
    "origin_annihilation_orundum": 1800,
    "origin_signin_orundum_monthly": 1000,
    "origin_maintain_orundum": 300,
    "origin_maintain_stone": 5,

    # ── 任务奖励 · 合成玉：按优先级分档 ──
    # 原版没有「一个任务」这种粒度，这里用「单抽 600 玉」反推：
    # 中度活跃用户每周约完成 10~12 个任务，希望落在 4~5 抽（2400~3000 玉）/周，
    # 即每任务含掉落约 200~280 玉 —— 任务本体给 8~110，剩下由关卡掉落补。
    "orundum_by_priority": {1: 8, 2: 15, 3: 30, 4: 50, 5: 75, 6: 110},
    "orundum_main_bonus": 15,             # 主线额外 15，对齐原版关卡首通 10~30 玉

    # ── 任务奖励 · 源石 ──
    # 原版源石是不可再生资源：只来自关卡首通 / 大版本补偿 / 充值，
    # 日常与周常一股都不给。所以只有 main 线才发，数量对齐「每关首通 1 颗」，
    # 6★ 视为章节终关 / 突袭首通给 2 颗。
    "stone_by_priority_main": {1: 0, 2: 1, 3: 1, 4: 1, 5: 1, 6: 2},

    # ── 周期上限（防刷：超出部分直接不发，而不是照发）──
    # 日上限 ≈ 日常 100 + 剿灭/周常的日均摊；
    # 周上限 ≈ 100×7 + 500 + 1800 ≈ 3200 玉 ≈ 5.3 抽/周（缺口由签到/活动/成就补）；
    # 源石周上限 ≈ 一周正常推图的首通量。
    # 日上限按原版日均（日常 100 + 剿灭 1800/7 + 周常 500/7 ≈ 428）放宽到 600，
    # 只用来挡「一天狂刷」；真正的天花板是周上限。
    "daily_orundum_cap": 600,
    "weekly_orundum_cap": 3000,
    "weekly_stone_cap": 8,

    # ── 掉落 · 源石 ──
    # 原版关卡掉落根本不掉源石（源石只来自首通），这里只保留极小概率的惊喜掉落。
    "drop_stone_chance": (0.006, 0.012),   # 按难度从 0.6% 线性到 1.2%
    "drop_stone_amount": 1,
}

STONE_BY_PRIORITY_MAIN = ECONOMY["stone_by_priority_main"]
ORUNDUM_BY_PRIORITY = ECONOMY["orundum_by_priority"]
ORUNDUM_MAIN_BONUS = ECONOMY["orundum_main_bonus"]


def _norm_priority(p) -> int:
    try:
        p = int(p or 1)
    except (TypeError, ValueError):
        p = 1
    return 1 if p < 1 else (6 if p > 6 else p)


def auto_reward_source_stone(priority, task_line: str = '') -> int:
    """任务源石奖励：只有主线首通给（原版每关 1 颗，章节/突袭 2 颗），支线一律 0。

    R24 前是「1~6 星给 1/1/2/2/3/5 颗，主线再 +1」，6★ 主线一次就是 6 颗 ——
    原版一整章（约 10 关）首通才给这么多，这是「源石太容易」的主要来源。
    """
    if task_line != 'main':
        return 0
    return STONE_BY_PRIORITY_MAIN.get(_norm_priority(priority), 0)


def auto_reward_orundum(priority, task_line: str = '') -> int:
    """任务合成玉奖励：按优先级分档，主线再加 10（对齐原版关卡首通 10~30 玉）。"""
    p = _norm_priority(priority)
    return ORUNDUM_BY_PRIORITY[p] + (ORUNDUM_MAIN_BONUS if task_line == 'main' else 0)


# ---------- 周期产出上限（防「多刷任务 = 无限抽」）----------
def _period_cutoff_utc(period: str) -> str:
    """周期起点的 UTC 时间串，与 resource_transactions.created_at 的存储格式对齐。

    resource_transactions 里既有 now_iso()（UTC，带 +00:00）也有建表默认值
    （strftime 的 UTC，带 Z），两者按字典序比较都能和这里的 '%Y-%m-%dT%H:%M:%S'
    正确排序，不必区分。
    """
    return period_start(period).astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S')


def _period_task_earned(cur, resource_type: str, period: str) -> float:
    """本周期内「任务奖励」已发放的该资源总量（不含礼包 / 兑换 / 抽卡等其它来源）。"""
    cur.execute(
        "SELECT COALESCE(SUM(amount), 0) FROM resource_transactions "
        "WHERE resource_type = ? AND reason LIKE 'task_reward_%' AND created_at >= ?",
        (resource_type, _period_cutoff_utc(period)))
    row = cur.fetchone()
    return float(row[0] if row else 0)


def cap_task_currency(cur, rewards: dict) -> list:
    """按 ECONOMY 的周期上限截断任务产出的源石 / 合成玉（原地改 rewards）。

    返回被截断的明细 list，供接口回给前端提示（没有截断就是空 list）。
    口径：日上限与周上限取更紧的那个；源石只卡周上限。
    """
    capped = []
    checks = (
        ('orundum', 'daily', 'daily_orundum_cap'),
        ('orundum', 'weekly', 'weekly_orundum_cap'),
        ('source_stone', 'weekly', 'weekly_stone_cap'),
    )
    for rtype, period, key in checks:
        want = rewards.get(rtype, 0) or 0
        if want <= 0:
            continue
        limit = float(ECONOMY[key])
        room = limit - _period_task_earned(cur, rtype, period)
        if room <= 0:
            rewards[rtype] = 0
            capped.append({"resource": rtype, "period": period, "limit": limit,
                           "wanted": want, "given": 0})
        elif want > room:
            rewards[rtype] = room
            capped.append({"resource": rtype, "period": period, "limit": limit,
                           "wanted": want, "given": room})
    return capped


def economy_snapshot(cur) -> dict:
    """当前周期产出进度快照：给接口 / 前端展示「本周还能拿多少」，也让上限可见。"""
    return {
        "caps": {
            "daily_orundum": ECONOMY["daily_orundum_cap"],
            "weekly_orundum": ECONOMY["weekly_orundum_cap"],
            "weekly_stone": ECONOMY["weekly_stone_cap"],
        },
        "earned": {
            "daily_orundum": _period_task_earned(cur, 'orundum', 'daily'),
            "weekly_orundum": _period_task_earned(cur, 'orundum', 'weekly'),
            "weekly_stone": _period_task_earned(cur, 'source_stone', 'weekly'),
        },
        "draw_cost_orundum": ECONOMY["draw_cost_orundum"],
        "stone_to_orundum": ECONOMY["stone_to_orundum"],
    }


def compute_task_rewards(cur, task) -> dict:
    """任务奖励的唯一计算口径（基础 + 自动兜底 + 掉落），不含发奖动作。

    R24：把 _grant_task_rewards 与 claim_all_rewards 里重复实现的两份计算合并到
    这里，两边都调它，避免改了一处忘了另一处（历史上漏同步过）。
    DB 里为 0 = 没指定，走自动兜底，不是「不给」。
    """
    task_id = task["id"]
    if task["reward_exp"] != 0:
        reward_exp = task["reward_exp"]
    else:
        reward_exp = task["priority"] * 50 * (1.3 if task["task_line"] == 'main' else 1.0)
        cur.execute(
            "SELECT COUNT(*) FROM tasks WHERE parent_id = ? AND deleted = 0 AND archived = 0 AND status != 'cancelled'",
            (task_id,))
        child_count = cur.fetchone()[0]
        reward_exp += child_count * 10
    if task["reward_lungmen"] != 0:
        reward_lungmen = task["reward_lungmen"]
    else:
        reward_lungmen = task["priority"] * 100 * (1.2 if task["task_line"] == 'side' else 1.0)
    if task["reward_source_stone"] != 0:
        reward_stone = task["reward_source_stone"]
    else:
        reward_stone = auto_reward_source_stone(task["priority"], task["task_line"])
    if task["reward_orundum"] != 0:
        reward_orundum = task["reward_orundum"]
    else:
        reward_orundum = auto_reward_orundum(task["priority"], task["task_line"])

    rewards = {
        'exp': reward_exp,
        'lungmen': reward_lungmen,
        'source_stone': reward_stone,
        'orundum': reward_orundum,
    }
    drop_rewards = parse_drop_config_to_rewards(task["drop_config"])
    rewards['source_stone'] += drop_rewards['source_stone']
    rewards['orundum'] += drop_rewards['orundum']
    rewards['lungmen'] += drop_rewards['lungmen']
    return rewards


def _grant_task_rewards(cur, task):
    """给单个任务结算奖励：基础资源 + 掉落素材入仓，并标记为已领取。

    返回 (rewards, materials, capped)，抽出复用是为了让「父任务一并领取
    所有子任务奖励」走完全相同的发奖路径，不会漏也不会重复。
    capped 是被周期上限截断的明细（没有截断就是空 list）。
    """
    task_id = task["id"]
    # R24：计算口径统一走 compute_task_rewards，再按周期上限截断源石 / 合成玉
    rewards = compute_task_rewards(cur, task)
    capped = cap_task_currency(cur, rewards)
    # 掉落素材进入仓库，并把实际入库明细返回给前端用于提示
    materials = add_drops_to_inventory(cur, task["drop_config"])
    for res_type, amount in rewards.items():
        if amount > 0:
            add_resource(cur, res_type, amount, f'task_reward_{task_id}', task_id)
    cur.execute("UPDATE tasks SET reward_claimed = 1, updated_at = ? WHERE id = ?", (now_iso(), task_id))
    old_exp = get_resource(cur, 'exp') - rewards['exp']
    new_exp = get_resource(cur, 'exp')
    check_and_apply_level_up(cur, old_exp, new_exp)
    return rewards, materials, capped


def collect_descendant_ids(cur, task_id: int) -> list:
    """某任务下所有子孙任务 id（默认不含自身）。"""
    out: list = []
    frontier = [task_id]
    while frontier:
        cur.execute(
            "SELECT id FROM tasks WHERE parent_id IN (%s)" % ','.join('?' * len(frontier)),
            frontier)
        kids = [r["id"] for r in cur.fetchall()]
        if not kids:
            break
        out.extend(kids)
        frontier = kids
    return out


def claim_with_children_enabled(cur) -> bool:
    """设置里「领取父任务时一并领取子任务奖励」，默认开启。"""
    try:
        cur.execute("SELECT settings_json FROM settings WHERE id = 1")
        row = cur.fetchone()
        if not row:
            return True
        cfg = json.loads(row[0] or '{}')
        return bool(cfg.get("claim_with_children", True))
    except Exception:
        return True


@app.post("/api/tasks/{task_id}/claim-reward")
async def claim_reward(task_id: int, with_children: Optional[bool] = None):
    with db_cursor() as cur:
        cur.execute("SELECT * FROM tasks WHERE id = ? AND deleted = 0", (task_id,))
        task = cur.fetchone()
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        if task["status"] != 'done':
            raise HTTPException(status_code=400, detail="任务未完成")
        if task["reward_claimed"]:
            raise HTTPException(status_code=400, detail="奖励已领取")

        # 一并领取：父任务先领，再把所有已完成且未领取的子孙任务一起领掉（每个只发一次）
        cascade = claim_with_children_enabled(cur) if with_children is None else bool(with_children)
        targets = [task]
        if cascade:
            ids = collect_descendant_ids(cur, task_id)
            if ids:
                ph = ','.join('?' * len(ids))
                cur.execute(
                    f"SELECT * FROM tasks WHERE id IN ({ph}) AND deleted = 0 "
                    f"AND status = 'done' AND reward_claimed = 0", ids)
                targets.extend(cur.fetchall())

        total = {'exp': 0, 'lungmen': 0, 'source_stone': 0, 'orundum': 0}
        materials = []
        detail = []
        capped = []
        for t in targets:
            r, m, c = _grant_task_rewards(cur, t)
            for k in total:
                total[k] += r.get(k, 0) or 0
            materials.extend(m or [])
            capped.extend(c or [])
            detail.append({"id": t["id"], "title": t["title"], "rewards": r})
        snapshot = economy_snapshot(cur)

    return {"data": {
        "id": task_id,
        "claimed": True,
        "rewards": total,
        "materials": materials,
        "claimed_count": len(targets),
        "detail": detail,
        "capped": capped,
        "economy": snapshot,
    }}


@app.post("/api/tasks/claim-all")
async def claim_all_rewards():
    with db_cursor() as cur:
        cur.execute("""
            SELECT id, priority, task_line, reward_exp, reward_lungmen, reward_source_stone, reward_orundum, drop_config
            FROM tasks
            WHERE status = 'done' AND reward_claimed = 0 AND deleted = 0
        """)
        tasks = cur.fetchall()
        total_rewards = {'exp': 0, 'lungmen': 0, 'source_stone': 0, 'orundum': 0}
        capped = []
        claimed_count = 0
        # R24：直接复用 _grant_task_rewards，和单条领取走完全同一条发奖路径
        # （含周期上限）。以前这里是复制粘贴的第二份计算，改单价时必然漏同步。
        for task in tasks:
            rewards, _materials, c = _grant_task_rewards(cur, task)
            for k in total_rewards:
                total_rewards[k] += rewards.get(k, 0) or 0
            capped.extend(c or [])
            claimed_count += 1
        snapshot = economy_snapshot(cur)
    return {"data": {"claimed": claimed_count, "rewards": total_rewards,
                     "capped": capped, "economy": snapshot}}


@app.get("/api/resources")
async def get_resources():
    with db_cursor() as cur:
        cur.execute("SELECT * FROM resources")
        resources = {}
        for row in cur.fetchall():
            resources[row["resource_type"]] = {
                "id": row["id"],
                "current_value": row["current_value"],
                "max_value": row["max_value"],
                "updated_at": row["updated_at"]
            }
        # 理智上限随博士等级走：把曲线信息一并给前端，免得公式在前后端各写一份。
        lvl = calculate_level(get_resource(cur, 'exp'))
        nxt = None
        for probe in range(lvl + 1, _AK_SANITY_LEVEL_CAP + 1):
            if sanity_cap_gain(probe) > 0:
                nxt = probe
                break
        meta = {
            "level": lvl,
            "sanity_cap": sanity_cap(lvl),
            "sanity_cap_next": sanity_cap(lvl + 1),
            "sanity_cap_gain": sanity_cap_gain(lvl),
            # 下一级不涨时，告诉前端到底哪一级才涨（85-100 级整段停滞）
            "sanity_next_gain_level": nxt,
            "sanity_next_gain_amount": sanity_cap_gain(nxt) if nxt else 0,
            "sanity_cap_max": _AK_SANITY_MAX,
            "sanity_level_cap": _AK_SANITY_LEVEL_CAP,
        }
    # ⚠️ meta 必须塞进 data 里：unify_response_format 中间件只会透传 data 这一个键，
    #    写成 {"data": ..., "meta": ...} 的话 meta 会被直接丢掉。
    return {"data": {"resources": resources, "meta": meta}}


@app.get("/api/inventory")
async def get_inventory_api():
    """返回仓库内容：基础货币(龙门币/源石/合成玉) + 方舟素材"""
    with db_cursor() as cur:
        cur.execute("SELECT resource_type, current_value FROM resources")
        res = {row["resource_type"]: row["current_value"] for row in cur.fetchall()}
        materials = get_inventory(cur)
    return {
        "data": {
            "currencies": {
                "lungmen": res.get("lungmen", 0),
                "source_stone": res.get("source_stone", 0),
                "orundum": res.get("orundum", 0),
            },
            "materials": [{"type": k, "qty": v} for k, v in materials.items()],
        }
    }


@app.get("/api/resources/transactions")
async def get_transactions(limit: int = 50, offset: int = 0):
    with db_cursor() as cur:
        cur.execute("SELECT * FROM resource_transactions ORDER BY created_at DESC LIMIT ? OFFSET ?", (limit, offset))
        transactions = [dict(row) for row in cur.fetchall()]
    return {"data": transactions}


@app.post("/api/resources/exchange")
async def exchange_resource(request: ExchangeRequest):
    # 允许的兑换方向白名单：源石 → 合成玉（1 源石 = 180 合成玉，明日方舟原版比例）。
    # 龙门币 / 源石均不可被兑换出去；龙门币只能由任务或礼包获得。
    EXCHANGE_ALLOWED = {
        ('source_stone', 'orundum'): ECONOMY["stone_to_orundum"],  # 1 源石 -> 180 合成玉
    }
    rate = EXCHANGE_ALLOWED.get((request.from_type, request.to_type))
    if rate is None:
        raise HTTPException(
            status_code=400,
            detail="该兑换不被允许：仅支持 源石 → 合成玉（1 源石 = 180 合成玉）。龙门币与源石不可被兑换出去。",
        )
    if request.amount is None or request.amount <= 0:
        raise HTTPException(status_code=400, detail="兑换数量必须为正数")

    with db_cursor() as cur:
        have = get_resource(cur, request.from_type)
        if have < request.amount:
            raise HTTPException(status_code=400, detail="源石不足")
        gained = request.amount * rate
        add_resource(cur, request.from_type, -request.amount, f'exchange_out_{request.to_type}', None)
        add_resource(cur, request.to_type, gained, f'exchange_in_{request.from_type}', None)
    return {
        "data": {
            "from_type": request.from_type,
            "to_type": request.to_type,
            "spent": request.amount,
            "gained": gained,
            "rate": rate,
        }
    }


@app.get("/api/reality-rewards")
async def get_reality_rewards():
    with db_cursor() as cur:
        check_reality_rewards_achieved(cur)
        cur.execute("SELECT * FROM reality_rewards ORDER BY status = 'archived', status = 'claimed', status = 'achieved', status = 'pending', created_at DESC")
        rewards = []
        for row in cur.fetchall():
            item = dict(row)
            item["current_value"] = get_reality_reward_progress(cur, item)
            rewards.append(item)
    return {"data": rewards}


@app.post("/api/reality-rewards")
async def create_reality_reward(reward: RealityRewardCreate):
    with db_cursor() as cur:
        cur.execute("""
            INSERT INTO reality_rewards (title, description, target_type, target_value, current_value, reward_text, status)
            VALUES (?, ?, ?, ?, ?, ?, 'pending')
        """, (reward.title, reward.description, reward.target_type, reward.target_value, reward.current_value, reward.reward_text))
        reward_id = cur.lastrowid
        check_reality_rewards_achieved(cur)
        cur.execute("SELECT * FROM reality_rewards WHERE id = ?", (reward_id,))
        item = dict(cur.fetchone())
        item["current_value"] = get_reality_reward_progress(cur, item)
    return {"data": item}


@app.put("/api/reality-rewards/{reward_id}")
async def update_reality_reward(reward_id: int, updates: RealityRewardUpdate):
    with db_cursor() as cur:
        cur.execute("SELECT * FROM reality_rewards WHERE id = ?", (reward_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="兑换目标不存在")
        fields = updates.dict(exclude_unset=True)
        if fields:
            sets = []
            params = []
            for key, value in fields.items():
                sets.append(f"{key} = ?")
                params.append(value)
            params.append(reward_id)
            cur.execute(f"UPDATE reality_rewards SET {', '.join(sets)} WHERE id = ?", params)
        check_reality_rewards_achieved(cur)
        cur.execute("SELECT * FROM reality_rewards WHERE id = ?", (reward_id,))
        item = dict(cur.fetchone())
        item["current_value"] = get_reality_reward_progress(cur, item)
    return {"data": item}


@app.delete("/api/reality-rewards/{reward_id}")
async def delete_reality_reward(reward_id: int):
    with db_cursor() as cur:
        cur.execute("DELETE FROM reality_rewards WHERE id = ?", (reward_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="兑换目标不存在")
    return {"data": {"deleted": True}}


@app.post("/api/reality-rewards/{reward_id}/claim")
async def claim_reality_reward(reward_id: int):
    with db_cursor() as cur:
        cur.execute("SELECT * FROM reality_rewards WHERE id = ?", (reward_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="兑换目标不存在")
        if row["status"] not in ('pending', 'achieved'):
            raise HTTPException(status_code=400, detail="该奖励当前不可领取")
        cur.execute("UPDATE reality_rewards SET status = 'claimed', claimed_at = ? WHERE id = ?",
                    (now_iso(), reward_id))
        cur.execute("SELECT * FROM reality_rewards WHERE id = ?", (reward_id,))
        item = dict(cur.fetchone())
        item["current_value"] = get_reality_reward_progress(cur, item)
    return {"data": item}


@app.get("/api/gift-packs")
async def get_gift_packs():
    with db_cursor() as cur:
        now = now_iso()
        # ⚠️ 必须用 datetime() 归一化再比较：
        #    available_from 存的是带时区的 ISO 串，直接做字符串比较会
        #    把 "+08:00" 与 "+00:00" 当同一基准，时间窗判定整批出错（礼包全被过滤）。
        #    datetime() 会先换算成 UTC 再比，带任何偏移的历史数据都正确。
        cur.execute("""SELECT * FROM gift_packs
                       WHERE purchased = 0
                         AND datetime(available_from) <= datetime(?)
                         AND datetime(available_until) >= datetime(?)""", (now, now))
        packs = [dict(row) for row in cur.fetchall()]
    packs.sort(key=lambda p: (p.get("cost_source_stone") or 0))
    return {"data": packs}


@app.post("/api/gift-packs/{pack_id}/purchase")
async def purchase_gift_pack(pack_id: int):
    with db_cursor() as cur:
        cur.execute("SELECT * FROM gift_packs WHERE id = ? AND purchased = 0", (pack_id,))
        pack = cur.fetchone()
        if not pack:
            raise HTTPException(status_code=404, detail="礼包不存在或已购买")
        cur.execute("SELECT current_value FROM resources WHERE resource_type = 'source_stone'")
        source_stone = cur.fetchone()[0]
        if source_stone < pack["cost_source_stone"]:
            raise HTTPException(status_code=400, detail="源石不足")
        add_resource(cur, 'source_stone', -pack["cost_source_stone"], f'gift_pack_purchase_{pack_id}', pack_id)
        old_exp = get_resource(cur, 'exp')
        content_config = json.loads(pack["content_config"])
        granted = []
        def _grant(res_type, amount):
            """发放内容：仓库素材(mat_)进仓库，其余进资源表；并记录已发放以便前端弹窗展示。"""
            if res_type.startswith('mat_'):
                add_inventory(cur, res_type, float(amount))
            else:
                add_resource(cur, res_type, amount, f'gift_pack_content_{pack_id}', pack_id)
            granted.append({"key": res_type, "amount": float(amount)})

        if pack["pack_type"] == 'fixed':
            resources = content_config.get("resources", {})
            for res_type, amount in resources.items():
                _grant(res_type, amount)
            # 修复：fixed 礼包的 materials 列表此前被忽略，从未发放
            for m in content_config.get("materials", []):
                if isinstance(m, dict) and m.get("type"):
                    _grant(m["type"], m["amount"])
        elif pack["pack_type"] == 'random':
            random_pool = content_config.get("random_pool", [])
            if random_pool:
                # 一次给 2~3 件，奖励更丰厚、品类更杂
                for chosen in random.sample(random_pool, min(3, len(random_pool))):
                    if ':' in chosen:
                        res_type, amount_str = chosen.split(':', 1)
                        try:
                            _grant(res_type, float(amount_str))
                        except ValueError:
                            pass
        elif pack["pack_type"] == 'mixed':
            fixed = content_config.get("fixed", {})
            for res_type, amount in fixed.items():
                _grant(res_type, amount)
            random_pool = content_config.get("random", [])
            if random_pool:
                for chosen in random.sample(random_pool, min(2, len(random_pool))):
                    if ':' in chosen:
                        res_type, amount_str = chosen.split(':', 1)
                        try:
                            _grant(res_type, float(amount_str))
                        except ValueError:
                            pass
        # R21：限定时装随机奖励 —— 原版不能用源石直接兑换的那批皮肤，
        #      时装商店不卖，只从带 skin_drop 的礼包里产出（用户要求）。
        if content_config.get("skin_drop"):
            owned_skins = {r[0] for r in cur.execute("SELECT skin_id FROM skins_owned").fetchall()}
            pool = [s for s in limited_skin_pool(12) if s["skin_id"] not in owned_skins]
            if not pool:                       # 池子都拿完了就允许重复（不至于买了没东西）
                pool = limited_skin_pool(12)
            if pool:
                pick = random.choice(pool)
                cur.execute("""INSERT OR IGNORE INTO skins_owned
                               (skin_id, operator_id, operator_name, skin_name, cost_source_stone)
                               VALUES (?, ?, ?, ?, 0)""",
                            (pick["skin_id"], pick["operator_id"], pick["operator_name"],
                             pick["skin_name"]))
                granted.append({"key": "skin", "amount": 1, "skin": pick})
            cur.execute("SELECT COUNT(*) FROM skins_owned")
            check_achievement(cur, 'skins_owned', cur.fetchone()[0], None)
        cur.execute("UPDATE gift_packs SET purchased = 1 WHERE id = ?", (pack_id,))
        cur.execute("SELECT COUNT(*) FROM gift_packs WHERE purchased = 1")
        purchased_count = cur.fetchone()[0]
        check_achievement(cur, 'gift_pack_purchased', purchased_count, None)
        new_exp = get_resource(cur, 'exp')
        check_and_apply_level_up(cur, old_exp, new_exp)
        # R23：礼包可能开出时装 → 时装件数 / 累计货币类章一起过一遍
        check_cumulative_achievements(cur, None)
    return {"data": {"id": pack_id, "purchased": True, "rewards": granted}}


@app.get("/api/achievements")
async def get_achievements():
    with db_cursor() as cur:
        cur.execute("SELECT * FROM achievements")
        achievements = [dict(row) for row in cur.fetchall()]
    return {"data": achievements}


@app.get("/api/achievements/unlocked")
async def get_unlocked_achievements():
    with db_cursor() as cur:
        # ⚠️ 必须显式别名出 achievement_id：`a.*` 里那列叫 id，
        #    前端 renderAchievements / renderProfileBadges / checkNewUnlocks 读的是
        #    u.achievement_id —— 不别名就永远是 undefined，解锁数对得上但一张卡都点不亮。
        cur.execute("""
            SELECT a.*, au.achievement_id AS achievement_id,
                   au.unlocked_at, au.task_id
            FROM achievements a
            JOIN achievement_unlocks au ON a.id = au.achievement_id
            ORDER BY au.unlocked_at DESC
        """)
        unlocked = [dict(row) for row in cur.fetchall()]
    return {"data": unlocked}


@app.post("/api/achievements/custom")
async def create_custom_achievement(
        name: str = Form(...),
        description: str = Form(...),
        condition_type: str = Form('custom'),
        condition_value: float = Form(0),
        hidden: bool = Form(False),
        badge_config: str = Form(None),
        image: UploadFile = File(None),
        color: str = Form(None),
        pattern: str = Form(None),
        custom_text: str = Form(None)
):
    if condition_type != 'custom':
        raise HTTPException(status_code=400, detail="自定义成就的条件类型必须为 'custom'")

    achievement_id = f"custom_{int(datetime.now().timestamp())}"
    badge_conf = {}
    if badge_config:
        badge_conf = json.loads(badge_config)
    if color:
        badge_conf["color"] = color
    if pattern:
        if pattern not in ('none', 'crystal', 'line', 'dots', 'hex'):
            raise HTTPException(status_code=400, detail="无效的底纹类型")
        badge_conf["pattern"] = pattern
    if custom_text:
        badge_conf["text"] = custom_text
    if image:
        filename = image.filename or ""
        ext = os.path.splitext(filename)[1].lower()
        if ext not in ('.png', '.jpg', '.jpeg', '.gif', '.webp'):
            raise HTTPException(status_code=400, detail="仅支持图片文件")
        content = await image.read()
        if len(content) > 5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="图片大小不能超过5MB")
        is_valid_image = False
        if content.startswith(b'\x89PNG\r\n\x1a\n'):
            is_valid_image = True
        elif content.startswith(b'\xff\xd8\xff'):
            is_valid_image = True
        elif content.startswith(b'GIF87a') or content.startswith(b'GIF89a'):
            is_valid_image = True
        elif content.startswith(b'RIFF') and content[8:12] == b'WEBP':
            is_valid_image = True
        if not is_valid_image:
            raise HTTPException(status_code=400, detail="文件内容不是有效图片")
        safe_filename = f"{uuid.uuid4().hex}{ext}"
        filepath = os.path.join(BADGE_DIR, safe_filename)
        with open(filepath, "wb") as f:
            f.write(content)
        badge_conf["image_path"] = f"/static/badges/{safe_filename}"

    with db_cursor() as cur:
        cur.execute("""
            INSERT INTO achievements (id, name, description, condition_type, condition_value, badge_config, hidden)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (achievement_id, name, description, condition_type, condition_value, json.dumps(badge_conf),
              1 if hidden else 0))
    return {"data": {"id": achievement_id, "badge_config": badge_conf}}


# ============================================================
#  干员寻访（抽卡）：专门产出「干员信物」
#  - 信物只能通过本模块获得（任务 / 礼包 / 兑换均不发信物）。
#  - 数据参考明日方舟原版：1 源石 = 180 合成玉，单次寻访 = 600 合成玉；
#    标准出率 6★2% / 5★8% / 4★50% / 3★40%；50 抽后 6★ 概率逐步提升，99 抽必出 6★；
#    十连第 10 抽保底 ≥4★。抽到重复干员时产出该干员「信物」+1。
# ============================================================
OPERATOR_GACHA_COST = ECONOMY["draw_cost_orundum"]   # 单次寻访消耗合成玉（原版 600）
OPERATOR_GACHA_RATES = {6: 0.02, 5: 0.08, 4: 0.50, 3: 0.40}  # 绝对出率
OPERATOR_PITY_THRESHOLD = 50       # 50 抽后开始软保底
OPERATOR_PITY_HARD = 98            # 距上次 6★ 达到 98 抽时，下一抽必出 6★

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CHARACTER_TABLE_PATH = os.path.join(
    BASE_DIR, "assets-source", "gamedata", "excel", "character_table.json")


# ---- 前端图片资源索引（由 build_char_assets.py 生成） ----
#   static/img/char/_index.json  : charId -> {portrait, token}   干员立绘 / 信物图标
#   static/img/skin/_index.json  : skinId -> {file, name, ...}   皮肤立绘（真实皮肤名）
CHAR_ASSETS_PATH = os.path.join(BASE_DIR, "static", "img", "char", "_index.json")
SKIN_ASSETS_PATH = os.path.join(BASE_DIR, "static", "img", "skin", "_index.json")


def _load_json_index(path: str) -> dict:
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


CHAR_ASSETS = _load_json_index(CHAR_ASSETS_PATH)      # charId -> {portrait, token}
SKIN_ASSETS = _load_json_index(SKIN_ASSETS_PATH)      # skinId -> {file, name, group, charId, rarity}
SKINS_BY_CHAR = {}
for _sid, _s in SKIN_ASSETS.items():
    SKINS_BY_CHAR.setdefault(_s.get("charId"), []).append(_sid)
for _cid in SKINS_BY_CHAR:
    SKINS_BY_CHAR[_cid].sort()


def _load_character_meta() -> dict:
    """读取本地明日方舟 character_table.json，拿干员稀有度/职业。

    rarity 在官方表里是 0~5（= 星级-1），这里统一换算成 1~6 星。
    读取失败时返回空 dict，卡池会退回用仓库目录自带的稀有度字段，不影响主流程。
    """
    try:
        with open(CHARACTER_TABLE_PATH, encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"[warn] 干员表加载失败（将用仓库目录稀有度兜底）: {e}")
        return {}
    meta = {}
    for v in data.values():
        name = v.get("name")
        raw = v.get("rarity") or 0
        if name and raw >= 1:          # rarity 0 为机器人/敌方单位，非可玩干员
            meta[name] = {"rarity": raw + 1, "profession": v.get("profession") or ""}
    return meta


OPERATOR_META = _load_character_meta()


def _build_operator_pool() -> list:
    """卡池 = 仓库「信物」目录里的全部干员，与信物一一对应。

    干员 id 直接用仓库目录的素材 key（如 mat_p_char_4179_monstr），
    这样寻访产出的信物和仓库里的信物必然是同一条记录，不会出现对不上的情况。
    过滤掉「先锋皇家信物 / 遗产信物 / 信物藏品」这类通用职业信物——
    它们不属于任何具体干员，不能作为寻访产出。
    """
    pool = []
    for it in WAREHOUSE_CATALOG:
        if it.get("cat") != "信物":
            continue
        raw = (it.get("name") or "").strip()
        if not raw.endswith("的信物"):
            continue                              # 通用职业信物，跳过
        op_name = raw[:-3].strip()
        if not op_name:
            continue
        info = OPERATOR_META.get(op_name)
        if info:
            rarity, profession = info["rarity"], info["profession"]
        else:
            rarity, profession = (it.get("r") or 2) + 1, ""
        # 立绘 / 信物图标：key 为 mat_p_char_XXXX，去掉 mat_p_ 前缀即是干员 charId
        asset = CHAR_ASSETS.get(it["key"][6:]) if it["key"].startswith("mat_p_") else None
        pool.append({
            "id": it["key"],
            "char_id": it["key"][6:] if it["key"].startswith("mat_p_") else it["key"],
            "name": op_name,
            "rarity": rarity,
            "profession": profession,
            "portrait": (asset or {}).get("portrait"),
            "token_icon": (asset or {}).get("token"),
        })
    return pool


OPERATOR_POOL = _build_operator_pool()
if not OPERATOR_POOL:      # 目录缺失时兜底，避免卡池为空导致寻访直接报错
    OPERATOR_POOL = [{"id": "mat_fallback_amiya", "name": "阿米娅", "rarity": 5, "profession": "CASTER"}]
OPERATOR_POOL_BY_RARITY = {}
for _op in OPERATOR_POOL:
    OPERATOR_POOL_BY_RARITY.setdefault(_op["rarity"], []).append(_op)
OPERATOR_POOL_BY_CHAR = {op["char_id"]: op for op in OPERATOR_POOL}


def _load_character_by_id() -> dict:
    """charId -> {name, rarity, profession}。

    和 _load_character_meta 的区别：这里保留 charId 作 key，
    时装商店要靠 charId 反查「这件皮肤属于谁」。
    """
    try:
        with open(CHARACTER_TABLE_PATH, encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return {}
    out = {}
    for cid, v in data.items():
        name = v.get("name")
        raw = v.get("rarity") or 0
        if name and raw >= 1:
            out[cid] = {"name": name, "rarity": raw + 1, "profession": v.get("profession") or ""}
    return out


CHARACTER_BY_ID = _load_character_by_id()


def _load_character_by_id_all() -> dict:
    """在 CHARACTER_BY_ID 的基础上补回 rarity 0 —— 也就是 1★ 干员。

    官方表里 rarity 0 里混着召唤物 / 敌方单位 / 场景物件（853 条），
    所以上面那个函数整体排除了 0，结果就是**一星干员一件时装都查不到**
    （Lancet-2 / Castle-3 / THRM-EX 这些的皮肤在货架上直接消失）。
    这里只收 char_ 前缀且职业非空的条目（11 名，全是真实可玩的一星干员），
    专门给时装商店反查「这件皮肤属于谁」用。
    """
    try:
        with open(CHARACTER_TABLE_PATH, encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return {}
    out = {}
    for cid, v in data.items():
        name = v.get("name")
        if not name or not cid.startswith("char_"):
            continue
        if not (v.get("profession") or ""):
            continue
        out[cid] = {"name": name, "rarity": (v.get("rarity") or 0) + 1,
                    "profession": v.get("profession") or ""}
    return out


CHARACTER_BY_ID_ALL = _load_character_by_id_all()


def _daily_key(salt: str) -> str:
    """轮换种子（R19：由「每天」改为「每周」—— 抽卡精选 / 时装货架按周更新）。

    以每周一 04:00 为分界：同一周内刷新页面结果固定，跨周自动换一批。
    函数名沿用，避免改动调用点。
    """
    return f"{salt}:{period_start('weekly').strftime('%Y%m%d')}"


def _rotate(seq: list, seed: str, n: int) -> list:
    """按稳定哈希把列表旋转一段后取前 n 个——同一自然日内结果固定。"""
    if not seq:
        return []
    start = _stable_index(seed, len(seq))
    return (seq[start:] + seq[:start])[:n]


def featured_operators() -> dict:
    """寻访弹窗顶部的「本期精选」：每周轮换，只挑有立绘的干员。

    返回 {six: [...], five: [...], four: [...]}，前端用来铺立绘展示条，
    让卡池在没有抽卡记录时也不是一片空白。
    """
    def pick(rarity: int, n: int) -> list:
        cand = [op for op in OPERATOR_POOL if op["rarity"] == rarity and op.get("portrait")]
        return _rotate(cand, _daily_key(f"featured:{rarity}"), n)

    # R21：六星给两个 —— 原版标准寻访本来就是「双 UP」，
    #      只摆一个既不像卡池，也让精选位显得空。
    return {
        "six": pick(6, 2),
        "five": pick(5, 4),
        "four": pick(4, 6),
        "date": period_start('weekly').strftime("%Y-%m-%d"),
    }


def _gacha_pity_get(cur, key, default=0):
    row = cur.execute("SELECT value FROM gacha_pity WHERE key=?", (key,)).fetchone()
    return row["value"] if row else default


def _gacha_pity_set(cur, key, value):
    cur.execute(
        "INSERT INTO gacha_pity (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (key, value),
    )


def roll_operator_rarity(since_last_6star):
    """按保底逻辑决定本次稀有度。返回 3/4/5/6。"""
    p6 = OPERATOR_GACHA_RATES[6]
    if since_last_6star >= OPERATOR_PITY_HARD:
        return 6
    if since_last_6star >= OPERATOR_PITY_THRESHOLD:
        # 软保底：自第 50 抽起，6★ 概率每抽 +2%，最高 100%
        p6 = min(1.0, p6 + 0.02 * (since_last_6star - OPERATOR_PITY_THRESHOLD + 1))
    roll = random.random()
    if roll < p6:
        return 6
    if roll < p6 + OPERATOR_GACHA_RATES[5]:
        return 5
    if roll < p6 + OPERATOR_GACHA_RATES[5] + OPERATOR_GACHA_RATES[4]:
        return 4
    return 3


def draw_one_operator(cur, force_min_rarity=None):
    """执行一次寻访（已在校验过合成玉余额、已扣费之后调用）。
    返回结果 dict，并更新 operator_records 与 gacha_pity。"""
    since = _gacha_pity_get(cur, "since_last_6star", 0)
    rarity = roll_operator_rarity(since)
    if force_min_rarity and rarity < force_min_rarity:
        rarity = force_min_rarity
    pool = OPERATOR_POOL_BY_RARITY.get(rarity) or OPERATOR_POOL
    op = random.choice(pool)
    # 更新干员记录：首抽为「新干员」，重复则「信物 +1」
    cur.execute(
        "INSERT INTO operator_records (operator_id, name, rarity, copies, tokens) "
        "VALUES (?, ?, ?, 0, 0) ON CONFLICT(operator_id) DO NOTHING",
        (op["id"], op["name"], rarity),
    )
    row = cur.execute(
        "SELECT copies, tokens FROM operator_records WHERE operator_id=?", (op["id"],)
    ).fetchone()
    copies = row["copies"] + 1
    is_new = (copies == 1)
    token_gain = 0 if is_new else 1
    tokens = row["tokens"] + token_gain
    cur.execute(
        "UPDATE operator_records SET copies=?, tokens=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "
        "WHERE operator_id=?",
        (copies, tokens, op["id"]),
    )
    # 保底计数
    total = _gacha_pity_get(cur, "total_pulls", 0) + 1
    _gacha_pity_set(cur, "total_pulls", total)
    since_next = 0 if rarity == 6 else since + 1
    _gacha_pity_set(cur, "since_last_6star", since_next)
    return {
        "operator_id": op["id"],
        "name": op["name"],
        "rarity": rarity,
        "is_new": is_new,
        "token_gain": token_gain,
        "portrait": op.get("portrait"),
        "token_icon": op.get("token_icon"),
    }


class GachaOperatorRequest(BaseModel):
    count: int = Field(..., ge=1, le=10)


@app.post("/api/gacha/operator")
async def gacha_operator(req: GachaOperatorRequest):
    count = req.count
    cost = OPERATOR_GACHA_COST * count
    with db_cursor() as cur:
        orundum = get_resource(cur, "orundum")
        if orundum < cost:
            raise HTTPException(status_code=400, detail="合成玉不足")
        add_resource(cur, "orundum", -cost, "gacha_operator", None)
        results = []
        for i in range(count):
            # 十连第 10 抽保底 ≥4★
            force = 4 if (count == 10 and i == 9) else None
            results.append(draw_one_operator(cur, force_min_rarity=force))
        since = _gacha_pity_get(cur, "since_last_6star", 0)
        total = _gacha_pity_get(cur, "total_pulls", 0)
        balance = get_resource(cur, "orundum")
        # 寻访 / 干员相关的蚀刻章（累计寻访次数、已招募干员数）
        check_achievement(cur, 'gacha_draws', total, None)
        cur.execute("SELECT COUNT(*) FROM operator_records")
        check_achievement(cur, 'operators_owned', cur.fetchone()[0], None)
        # R23：五星 / 六星干员持有数、累计合成玉
        check_cumulative_achievements(cur, None)
    return {
        "data": {
            "results": results,
            "cost": cost,
            "balance_orundum": balance,
            "pity": {
                "total_pulls": total,
                "since_last_6star": since,
                "guaranteed_in": max(1, (OPERATOR_PITY_HARD + 1) - since),
            },
        }
    }


@app.get("/api/gacha/operator/records")
async def gacha_operator_records():
    with db_cursor() as cur:
        rows = cur.execute(
            "SELECT operator_id, name, rarity, copies, tokens FROM operator_records "
            "ORDER BY rarity DESC, name ASC"
        ).fetchall()
        since = _gacha_pity_get(cur, "since_last_6star", 0)
        total = _gacha_pity_get(cur, "total_pulls", 0)
    # 附上立绘 / 信物图标，图鉴列表也带图
    operators = []
    for r in rows:
        d = dict(r)
        asset = CHAR_ASSETS.get((d.get("operator_id") or "")[6:], {})
        d["portrait"] = asset.get("portrait")
        d["token_icon"] = asset.get("token")
        operators.append(d)
    return {
        "data": {
            "operators": operators,
            "featured": featured_operators(),
            "pity": {
                "total_pulls": total,
                "since_last_6star": since,
                "guaranteed_in": max(1, (OPERATOR_PITY_HARD + 1) - since),
            },
        }
    }


# ============================================================
#  时装（皮肤）商店：用「至纯源石」购买，价格档位对齐明日方舟原版
#   15 源石：无特效，仅静态立绘
#   18 源石：在 15 档基础上替换技能特效
#   21 源石：在 18 档基础上改为动态立绘
#   24 源石：在 21 档基础上追加入场动画 + 全套新语音
#   27 源石：双形态动态立绘 + 新语音（原版最高档）
#  只列出「已持有」干员的时装——和原版一致：没有这名干员就穿不了他的皮肤。
# ============================================================
SKIN_TIER_LABEL = {
    9:  "默认服装",
    15: "静态立绘",
    18: "特效时装",
    21: "动态立绘",
    24: "动态立绘 · 全新语音",
    27: "双形态 · 全新语音",
}
# 各星级干员可能出现的档位（越稀有越容易出豪华皮）
# R21：补上 1★ / 2★ 两档 —— 原版里低星干员只有「默认服装」这一档，
#      价格也最低，这样时装商店 1~6 星六个档位才不会整片空缺。
SKIN_TIERS_BY_RARITY = {
    6: [21, 24, 24, 27],
    5: [18, 21, 21, 24],
    4: [15, 18, 18, 21],
    3: [15, 18],
    2: [9],
    1: [9],
}
# ------------------------------------------------------------
# 联动限定时装
# ------------------------------------------------------------
# ⚠️ R21 走错了一次：当时拿「档位 ≥ 24 源石」当限定判据，结果把一大堆
#    原版本来就能用源石直购的动态立绘皮肤（24 / 27 档）全划成了礼包限定。
#    用户的原话：「你这好多都是本来可以买的，怎么都成了礼包限定？不对吧」。
#    正确的判据是**皮肤所属系列**：方舟里真正不能用源石兑换的，
#    是这些品牌联动皮（怪物猎人 / 三丽鸥 / Ave Mujica / 肯德基 …），
#    它们本来就只能靠活动、联动兑换券拿到。普通主题活动（音律联觉、
#    缠梦古堡、雷神开拓者 …）的皮肤原版照样是源石直购，不能算限定。
SKIN_LIMITED_GROUPS = (
    "怪物猎人", "三丽鸥家族", "Ave Mujica", "肯德基", "小马宝莉",
    "轻松小熊", "WWF", "i.t", "国家地理", "中国电影资料馆",
    "罗小黑战记", "CASC",
)
SKIN_LIMITED_GROUP_PREFIXES = tuple(g + "/" for g in SKIN_LIMITED_GROUPS)


def is_limited_skin(sid: str) -> bool:
    """这件皮肤是不是「联动限定」（原版不能源石直购 → 只从礼包随机产出）。"""
    g = (SKIN_ASSETS.get(sid) or {}).get("group") or ""
    return g in SKIN_LIMITED_GROUPS or g.startswith(SKIN_LIMITED_GROUP_PREFIXES)
# 每位干员生成的时装数量
SKIN_COUNT_BY_RARITY = {6: 2, 5: 2, 4: 1, 3: 1, 2: 1}
SKIN_SERIES = [
    "珊瑚海岸", "漆黑预言", "静谧之夜", "缄默荣誉", "荒野求生", "城市行者",
    "破晓时分", "夜航星", "长夜将尽", "白沙之约", "深蓝之心", "绯红之诗",
    "雪境巡礼", "沙海遗珍", "云端之上", "机械之心", "花与剑", "旧日回响",
    "边境之歌", "霜华之姿", "暗巷行者", "星海漫游", "假日时光", "铁血余晖",
    "孤星轨迹", "薄暮追猎", "极地远征", "春日序曲", "秋日私语", "幻夜华章",
]


def _stable_index(seed: str, mod: int) -> int:
    """用 md5 做稳定哈希，保证同一皮肤每次启动价格/外观都一致（不能用内置 hash）。"""
    return int(hashlib.md5(seed.encode("utf-8")).hexdigest(), 16) % mod


def build_skins_for_operator(op: dict) -> list:
    """为一名干员生成他的时装列表（确定性，重启不变）。

    优先使用官方 skin_table 里的**真实皮肤**（真实名称 + 真实立绘）；
    该干员没有收录皮肤时，才退回按系列名生成的占位时装。
    """
    rarity = op["rarity"]
    tiers = SKIN_TIERS_BY_RARITY.get(rarity, [15, 18])
    real_ids = SKINS_BY_CHAR.get(op.get("char_id") or op["id"][6:], [])
    skins = []
    if real_ids:
        for i, sid in enumerate(real_ids):
            s = SKIN_ASSETS[sid]
            price = tiers[_stable_index(f"{sid}:price", len(tiers))]
            skins.append({
                "skin_id": sid,
                "operator_id": op["id"],
                "operator_name": op["name"],
                "rarity": rarity,
                "skin_name": s["name"],
                "series": s.get("group") or "",
                "image": s.get("file"),
                "tier_label": SKIN_TIER_LABEL.get(price, "静态立绘"),
                "cost": price,
                "limited": is_limited_skin(sid),
            })
        return skins
    # 无收录皮肤：退回生成式占位
    n = SKIN_COUNT_BY_RARITY.get(rarity, 1)
    for i in range(n):
        price = tiers[_stable_index(f"{op['id']}:{i}:price", len(tiers))]
        series = SKIN_SERIES[_stable_index(f"{op['id']}:{i}:series", len(SKIN_SERIES))]
        skins.append({
            "skin_id": f"{op['id']}#{i}",
            "operator_id": op["id"],
            "operator_name": op["name"],
            "rarity": rarity,
            "skin_name": series,
            "series": "",
            "image": (op.get("portrait")),
            "tier_label": SKIN_TIER_LABEL.get(price, "静态立绘"),
            "cost": price,
            "limited": False,      # 生成式占位时装不属于任何联动系列
        })
    return skins


def _build_skin_buckets() -> dict:
    """按星级把皮肤分桶 —— 货架要按星级配额取货，1~6 星每档都得有东西。"""
    buckets: dict = {}
    for sid, s in SKIN_ASSETS.items():
        cid = s.get("charId") or ""
        meta = CHARACTER_BY_ID_ALL.get(cid)
        if not meta or not s.get("file"):
            continue
        buckets.setdefault(meta["rarity"], []).append(sid)
    for r in buckets:
        buckets[r].sort()
    return buckets


SKIN_BUCKETS = _build_skin_buckets()

# 二星干员（夜刀 / 黑角 / 巡林者 / 杜林 / 12F）在原版一件源石时装都没有，
# 星级桶是空的。这里用他们自己的立绘补一档「默认服装」，
# 保证货架 1~6 星六个档位齐全，而不是永远只有 3/4/5/6 星。
STAR2_SKINS: list = []
for _cid, _meta in CHARACTER_BY_ID.items():
    if _meta["rarity"] != 2:
        continue
    _asset = CHAR_ASSETS.get(_cid) or {}
    STAR2_SKINS.append({
        "skin_id": f"{_cid}@default#1",
        "operator_id": (OPERATOR_POOL_BY_CHAR.get(_cid) or {}).get("id") or f"mat_p_{_cid}",
        "operator_name": _meta["name"],
        "rarity": 2,
        "skin_name": "默认服装",
        "series": "",
        "image": _asset.get("portrait"),
        "tier_label": SKIN_TIER_LABEL[9],
        "cost": 9,
    })

# 各星级每周上架件数（合计 21 件，货架比原来的 18 件更满）
SKIN_SHOP_QUOTA = {6: 5, 5: 5, 4: 4, 3: 3, 2: 2, 1: 2}


def _skin_shop_entry(sid: str, owned_op_ids: set) -> dict:
    """把一条皮肤记录包装成货架条目（含价格档位 / 是否限定 / 是否可下单）。"""
    s = SKIN_ASSETS.get(sid) or {}
    cid = s.get("charId") or ""
    # CHARACTER_BY_ID_ALL 含 1★ 干员（Lancet-2 / Castle-3 / THRM-EX …），
    # 少了它们货架上就没有一星档位
    meta = CHARACTER_BY_ID_ALL.get(cid) or {}
    op = OPERATOR_POOL_BY_CHAR.get(cid)
    rarity = meta.get("rarity") or 0
    tiers = SKIN_TIERS_BY_RARITY.get(rarity, [15, 18])
    price = tiers[_stable_index(f"{sid}:price", len(tiers))]
    return {
        "skin_id": sid,
        "operator_id": (op or {}).get("id") or f"mat_p_{cid}",
        "operator_name": meta.get("name") or "",
        "rarity": rarity,
        "skin_name": s.get("name") or "时装",
        "series": s.get("group") or "",
        "image": s.get("file"),
        "tier_label": SKIN_TIER_LABEL.get(price, "静态立绘"),
        "cost": price,
        "limited": is_limited_skin(sid),
        "owned": False,
        "unlocked": bool(op and op["id"] in owned_op_ids),
    }


def build_skin_shop(owned_op_ids: set, limit: int = 24) -> list:
    """时装商店的「货架」：每周轮换一批真实皮肤（R19：与卡池/礼包统一为周更）。

    R21 改动（用户反馈「时装兑换里只有 456 星」）：
      · 改为**按星级配额取货** —— 1★ 到 6★ 每档都有固定件数，
        不再是从全表里按稀有度倒序切一刀（那样永远只剩 5★/6★）。
      · 原版不能源石兑换的**联动限定**皮肤（怪物猎人 / 三丽鸥 / Ave Mujica…）
        不进货架，改走礼包随机奖励。普通主题活动皮照常直购。
      · 二星档用干员自身立绘补「默认服装」，六个星级档位不再空缺。

    原版的时装商店本来就会摆出你还没有的干员的皮肤——买得到、穿不上。
    这里同样处理：未持有干员的时装 unlocked=False，前端只给预览不给下单。
    """
    if not SKIN_BUCKETS:
        return []
    week = _daily_key("skinshop")
    shop = []
    for rarity in sorted(SKIN_BUCKETS.keys(), reverse=True):
        bucket = SKIN_BUCKETS[rarity]
        quota = SKIN_SHOP_QUOTA.get(rarity, 2)
        for sid in _rotate(bucket, f"{week}:{rarity}", len(bucket)):
            entry = _skin_shop_entry(sid, owned_op_ids)
            if entry["limited"]:
                continue                      # 限定皮：只在礼包随机奖励里出
            shop.append(entry)
            quota -= 1
            if quota <= 0:
                break
    # 二星补位：原版没有二星时装，用干员自身立绘撑起这一档
    for base in STAR2_SKINS:
        op_id = base["operator_id"]
        shop.append(dict(base, owned=False, unlocked=op_id in owned_op_ids, limited=False))
    shop.sort(key=lambda x: (-x["rarity"], -x["cost"], x["operator_name"]))
    return shop[:limit]


def limited_skin_pool(n: int = 8) -> list:
    """限定时装池（每周轮换）——原版不能用源石兑换的那批皮肤。

    只从礼包的随机奖励里产出，时装商店里买不到。
    """
    week = _daily_key("skinlimited")
    ids = [sid for sid in sorted(SKIN_ASSETS.keys())
           if (SKIN_ASSETS.get(sid) or {}).get("file")
           and CHARACTER_BY_ID_ALL.get((SKIN_ASSETS.get(sid) or {}).get("charId") or "")]
    picks = []
    for sid in _rotate(ids, week, len(ids)):
        entry = _skin_shop_entry(sid, set())
        if not entry["limited"]:
            continue
        entry["owned"] = False
        picks.append(entry)
        if len(picks) >= n:
            break
    return picks


@app.get("/api/skins")
async def list_skins():
    """时装商店：已持有干员的时装可下单；再附一条每日轮换的货架做预览。"""
    pool_by_id = {op["id"]: op for op in OPERATOR_POOL}
    with db_cursor() as cur:
        owned_ops = cur.execute(
            "SELECT operator_id, name, rarity, copies FROM operator_records WHERE copies > 0"
        ).fetchall()
        owned_skins = {r["skin_id"] for r in cur.execute("SELECT skin_id FROM skins_owned").fetchall()}
        stone = get_resource(cur, "source_stone")
    owned_ids = {r["operator_id"] for r in owned_ops}
    skins = []
    for r in owned_ops:
        op = pool_by_id.get(r["operator_id"]) or {
            "id": r["operator_id"], "name": r["name"], "rarity": r["rarity"], "profession": ""}
        for s in build_skins_for_operator(op):
            s["owned"] = s["skin_id"] in owned_skins
            s["unlocked"] = True
            skins.append(s)
    # 限定时装不进直购清单：原版买不到，只能从礼包随机奖励里出
    skins = [s for s in skins if not s.get("limited")]
    owned_skin_ids = {s["skin_id"] for s in skins}
    skins.sort(key=lambda s: (-s["rarity"], -s["cost"], s["operator_name"]))
    # 货架里剔掉已经在「可购买」区出现过的，避免同一件皮肤出现两次
    shop = [s for s in build_skin_shop(owned_ids) if s["skin_id"] not in owned_skin_ids]
    return {"data": {"skins": skins, "shop": shop, "source_stone": stone,
                     "limited_pool": limited_skin_pool(8),
                     "owned_count": len(owned_skins), "operator_count": len(owned_ops)}}


@app.get("/api/skin/full/{skin_id:path}")
async def skin_full_art(skin_id: str):
    """时装大图预览：直接吐官方原图（assets-source/skin/<portraitId>b.png，1024×1024）。

    前端缩略图是 512×512，放大到接近满屏会发虚；原图是 1024，属于降采样显示，
    放大预览依然清晰。assets-source 里 509 件的原图全部齐备，取不到时退回缩略图。
    """
    meta = SKIN_ASSETS.get(skin_id) or {}
    pid = meta.get("portraitId")
    src = os.path.join(BASE_DIR, "assets-source", "skin", f"{pid}b.png") if pid else None
    if src and os.path.exists(src):
        return FileResponse(src, media_type="image/png",
                            headers={"Cache-Control": "public, max-age=86400"})
    f = (meta.get("file") or "").lstrip("/")
    thumb = os.path.join(BASE_DIR, "static", f) if f.startswith("img/") else None
    if thumb and os.path.exists(thumb):
        return FileResponse(thumb, media_type="image/webp")
    raise HTTPException(status_code=404, detail="skin art not found")


class SkinPurchaseRequest(BaseModel):
    skin_id: str


@app.post("/api/skins/purchase")
async def purchase_skin(req: SkinPurchaseRequest):
    pool_by_id = {op["id"]: op for op in OPERATOR_POOL}
    # 先定位这件皮肤属于谁（只允许买已持有干员的皮肤）
    target = None
    with db_cursor() as cur:
        for r in cur.execute(
                "SELECT operator_id, name, rarity FROM operator_records WHERE copies > 0").fetchall():
            op = pool_by_id.get(r["operator_id"]) or {
                "id": r["operator_id"], "name": r["name"], "rarity": r["rarity"], "profession": ""}
            for s in build_skins_for_operator(op):
                if s["skin_id"] == req.skin_id:
                    target = s
                    break
            if target:
                break
    if not target:
        raise HTTPException(status_code=404, detail="未持有该干员，无法购买其时装")

    with db_cursor() as cur:
        if cur.execute("SELECT 1 FROM skins_owned WHERE skin_id=?", (req.skin_id,)).fetchone():
            raise HTTPException(status_code=400, detail="已拥有该时装")
        stone = get_resource(cur, "source_stone")
        if stone < target["cost"]:
            raise HTTPException(status_code=400, detail=f"源石不足（需要 {target['cost']}）")
        add_resource(cur, "source_stone", -target["cost"], "skin_purchase", None)
        cur.execute(
            "INSERT INTO skins_owned (skin_id, operator_id, operator_name, skin_name, cost_source_stone) "
            "VALUES (?, ?, ?, ?, ?)",
            (req.skin_id, target["operator_id"], target["operator_name"],
             target["skin_name"], target["cost"]),
        )
        balance = get_resource(cur, "source_stone")
        # 时装收藏类蚀刻章
        cur.execute("SELECT COUNT(*) FROM skins_owned")
        check_achievement(cur, 'skins_owned', cur.fetchone()[0], None)
        check_cumulative_achievements(cur, None)
    return {"data": {"purchased": target, "source_stone": balance}}


@app.post("/api/achievements/draw")
async def draw_achievement():
    DRAW_COST_ORUNDUM = ECONOMY["achievement_draw_cost"]
    with db_cursor() as cur:
        orundum = get_resource(cur, 'orundum')
        if orundum < DRAW_COST_ORUNDUM:
            raise HTTPException(status_code=400, detail="合成玉不足")

        cur.execute("""
            SELECT a.* FROM achievements a
            LEFT JOIN achievement_unlocks au ON a.id = au.achievement_id
            WHERE a.condition_type = 'custom' AND au.id IS NULL
        """)
        unachieved = cur.fetchall()
        if not unachieved:
            raise HTTPException(status_code=400, detail="暂无可用蚀刻章")

        chosen = random.choice(unachieved)

        add_resource(cur, 'orundum', -DRAW_COST_ORUNDUM, 'draw_achievement', None)

        cur.execute("INSERT INTO achievement_unlocks (achievement_id, unlocked_at) VALUES (?, ?)",
                    (chosen["id"], now_iso()))
        if chosen["reward_exp"]:
            add_resource(cur, 'exp', chosen["reward_exp"], f'achievement_{chosen["id"]}', None)
        if chosen["reward_lungmen"]:
            add_resource(cur, 'lungmen', chosen["reward_lungmen"], f'achievement_{chosen["id"]}', None)
        if chosen["reward_source_stone"]:
            add_resource(cur, 'source_stone', chosen["reward_source_stone"], f'achievement_{chosen["id"]}', None)
        if chosen["reward_orundum"]:
            add_resource(cur, 'orundum', chosen["reward_orundum"], f'achievement_{chosen["id"]}', None)

        old_exp = get_resource(cur, 'exp') - (chosen["reward_exp"] or 0)
        new_exp = get_resource(cur, 'exp')
        check_and_apply_level_up(cur, old_exp, new_exp)

        result = {
            "id": chosen["id"],
            "name": chosen["name"],
            "description": chosen["description"],
            "badge_config": json.loads(chosen["badge_config"]) if chosen["badge_config"] else {},
            "rewards": {
                "exp": chosen["reward_exp"],
                "lungmen": chosen["reward_lungmen"],
                "source_stone": chosen["reward_source_stone"],
                "orundum": chosen["reward_orundum"],
            }
        }
    return {"data": result}


@app.post("/api/import")
async def import_data(data: ImportData):
    if data.version != 1:
        raise HTTPException(status_code=400, detail="不支持的版本号")

    # 验证导入数据
    def validate_import_task(task_data):
        if not isinstance(task_data, dict):
            raise ValueError("任务必须是对象")
        title = task_data.get("title")
        if not isinstance(title, str) or not title.strip():
            raise ValueError("任务标题缺失或非字符串")
        priority = task_data.get("priority", 1)
        if not isinstance(priority, int) or priority < 1 or priority > 6:
            raise ValueError("优先级必须在1-6之间")
        task_line = task_data.get("task_line", "side")
        if task_line not in ("main", "side"):
            raise ValueError("任务线必须为 main 或 side")
        status = task_data.get("status", "todo")
        if status not in ("todo", "in_progress", "paused", "done", "cancelled"):
            raise ValueError("无效的任务状态")
        repeat_type = task_data.get("repeat_type")
        if repeat_type and repeat_type not in ("daily", "weekly", "monthly", "custom"):
            raise ValueError("无效的重复类型")
        if task_data.get("target_value") is not None:
            if not isinstance(task_data["target_value"], (int, float)) or task_data["target_value"] <= 0:
                raise ValueError("目标值必须为正数")
        if task_data.get("current_value") is not None:
            if not isinstance(task_data["current_value"], (int, float)) or task_data["current_value"] < 0:
                raise ValueError("当前值不能为负")
        children = task_data.get("children", [])
        if not isinstance(children, list):
            raise ValueError("children 必须为数组")
        for child in children:
            validate_import_task(child)

    try:
        for task in data.tasks:
            validate_import_task(task)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    with db_cursor() as cur:
        cur.execute("SELECT settings_json FROM settings WHERE id = 1")
        settings = json.loads(cur.fetchone()[0])
        import_count = settings.get("import_count", 0) + 1
        settings["import_count"] = import_count
        cur.execute("UPDATE settings SET settings_json = ? WHERE id = 1", (json.dumps(settings),))

        tag_name_to_id = {}
        for tag in data.tags or []:
            tag_name = tag["name"]
            color = tag.get("color", "grey")
            cur.execute("SELECT id FROM tags WHERE name = ?", (tag_name,))
            row = cur.fetchone()
            if row:
                tag_id = row[0]
            else:
                cur.execute("INSERT INTO tags (name, color) VALUES (?, ?)", (tag_name, color))
                tag_id = cur.lastrowid
            tag_name_to_id[tag_name] = tag_id

        original_id_map = {}
        prereq_map = {}

        def create_task_recursive(task_data, parent_id=None):
            # 使用字典访问方式
            original_id = task_data.pop("original_id", None)
            prerequisite_orig = task_data.pop("prerequisite_id", None)
            provided_drop_config = task_data.pop("drop_config", None)
            provided_completed_at = task_data.pop("completed_at", None)

            children = task_data.pop("children", [])
            tags = task_data.pop("tags", [])

            title = task_data.get("title", "")
            description = task_data.get("description", "")
            priority = task_data.get("priority", 1)
            task_line = task_data.get("task_line", "side")
            track = task_data.get("track", "daily")
            status = task_data.get("status", "todo")
            target_value = task_data.get("target_value")
            current_value = task_data.get("current_value")
            planned_start = task_data.get("planned_start")
            planned_end = task_data.get("planned_end")
            due_date = task_data.get("due_date")
            repeat_type = task_data.get("repeat_type")
            repeat_interval = task_data.get("repeat_interval")
            repeat_next_date = task_data.get("repeat_next_date")
            reward_exp = task_data.get("reward_exp", 0)
            reward_lungmen = task_data.get("reward_lungmen", 0)
            reward_source_stone = task_data.get("reward_source_stone", 0)
            reward_orundum = task_data.get("reward_orundum", 0)
            notes = task_data.get("notes", "")
            sort_order = task_data.get("sort_order", 0)
            progress = task_data.get("progress", 0)
            is_tracked = task_data.get("is_tracked", False)

            progress_mode = 'count' if target_value is not None else 'manual'

            if repeat_type and not repeat_next_date and status != 'done':
                # 统一按「下一次 04:00 刷新」计算，和 sweep_repeat_tasks 的判定一致
                if repeat_type not in ('daily', 'weekly', 'monthly', 'custom'):
                    repeat_type_for_next = 'daily'
                else:
                    repeat_type_for_next = repeat_type
                repeat_next_date = next_reset_at(repeat_type_for_next, repeat_interval).isoformat()

            if status == 'done':
                completed_at = provided_completed_at or now_iso()
                if progress_mode == 'count' and target_value is not None:
                    current_value = max(current_value or 0, target_value)
                progress_value = 100
            else:
                completed_at = None
                if progress_mode == 'count':
                    current_value = current_value or 0
                    progress_value = (current_value / target_value * 100) if target_value else 0
                else:
                    current_value = None
                    progress_value = progress

            # 显式列出30个列名和对应的30个值
            cur.execute("""
                INSERT INTO tasks (
                parent_id, title, description, priority, task_line, track, status, progress_mode, progress,
                target_value, current_value, prerequisite_id, planned_start, planned_end, due_date,
                repeat_type, repeat_interval, repeat_next_date, created_at, updated_at,
                is_tracked, reward_exp, reward_lungmen, reward_source_stone, reward_orundum,
                drop_config, notes, sort_order, archived, deleted, completed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                parent_id,  # 1
                title,  # 2
                description,  # 3
                priority,  # 4
                task_line,  # 5
                track,  # 6
                status,  # 7
                progress_mode,  # 8
                progress_value,  # 9
                target_value,  # 10
                current_value,  # 11
                None,  # 12 - prerequisite_id (稍后设置)
                planned_start,  # 13
                planned_end,  # 14
                due_date,  # 15
                repeat_type,  # 16
                repeat_interval,  # 17
                repeat_next_date,  # 18
                now_iso(),  # 19 - created_at
                now_iso(),  # 20 - updated_at
                1 if is_tracked else 0,  # 21
                reward_exp,  # 22
                reward_lungmen,  # 23
                reward_source_stone,  # 24
                reward_orundum,  # 25
                provided_drop_config,  # 26 - 导入自带的掉落必须保留（此前 status=='done' 会被置空）
                notes,  # 27
                sort_order,  # 28
                0,  # 29 - archived
                0,  # 30 - deleted
                completed_at  # 31
            ))
            new_task_id = cur.lastrowid
            if original_id is not None:
                original_id_map[original_id] = new_task_id
            if prerequisite_orig is not None:
                prereq_map[new_task_id] = prerequisite_orig
            for tag_name in tags:
                tag_id = tag_name_to_id.get(tag_name)
                if tag_id:
                    cur.execute("INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)", (new_task_id, tag_id))
            for child in children:
                create_task_recursive(child, new_task_id)
            if status == 'done' and not provided_drop_config:
                # 复用当前 cursor：任务行尚未提交，新连接读不到会导致掉落为空
                drops = calculate_random_drops(new_task_id, completed_at, cur=cur)
                drop_config = json.dumps({"random_drops": drops})
                cur.execute("UPDATE tasks SET drop_config = ? WHERE id = ?", (drop_config, new_task_id))
            return new_task_id

        for task in data.tasks:
            create_task_recursive(task.copy())

        for new_task_id, orig_prereq in prereq_map.items():
            if orig_prereq in original_id_map:
                cur.execute("UPDATE tasks SET prerequisite_id = ? WHERE id = ?",
                            (original_id_map[orig_prereq], new_task_id))

        cur.execute("SELECT id, prerequisite_id FROM tasks WHERE prerequisite_id IS NOT NULL AND deleted = 0")
        for row in cur.fetchall():
            if check_cycle_prerequisite(cur, row["id"], row["prerequisite_id"]):
                raise HTTPException(status_code=400, detail="导入数据中存在循环前置依赖")

        # 导入后不再强制校验「已完成但父/前置未完成」，避免导入失败；聚合进度会自行修正
        pass

        cur.execute("""
            SELECT id FROM tasks 
            WHERE status = 'done' AND repeat_type IS NOT NULL AND deleted = 0
        """)
        repeat_done_tasks = [row["id"] for row in cur.fetchall()]
        for tid in repeat_done_tasks:
            create_repeat_copy(cur, tid)

        cur.execute("SELECT DISTINCT parent_id FROM tasks WHERE deleted = 0 AND parent_id IS NOT NULL")
        parent_ids = [row["parent_id"] for row in cur.fetchall()]
        for pid in parent_ids:
            update_parent_progress(cur, pid)

        cur.execute("SELECT COUNT(*) FROM tasks WHERE deleted = 0")
        total_created = cur.fetchone()[0]
        check_achievement(cur, 'task_count_created', total_created, None)
        cur.execute("SELECT COUNT(*) FROM tasks WHERE status = 'done' AND deleted = 0")
        total_completed = cur.fetchone()[0]
        check_achievement(cur, 'task_count_completed', total_completed, None)
        cur.execute("SELECT COUNT(*) FROM tasks WHERE status = 'done' AND task_line = 'main' AND deleted = 0")
        main_completed = cur.fetchone()[0]
        check_achievement(cur, 'task_count_completed_main', main_completed, None)
        cur.execute("SELECT COUNT(*) FROM tasks WHERE status = 'done' AND task_line = 'side' AND deleted = 0")
        side_completed = cur.fetchone()[0]
        check_achievement(cur, 'task_count_completed_side', side_completed, None)
        streak = calculate_streak_days(cur)
        check_achievement(cur, 'streak_days', streak, None)
        check_achievement(cur, 'import_count', import_count, None)
        # R23：导入后把所有累计型条件补齐（新库可能带进来大量历史数据）
        check_cumulative_achievements(cur, None)
    return {"data": {"imported": True}}


@app.get("/api/export")
async def export_data():
    with db_cursor() as cur:
        cur.execute("SELECT * FROM tasks WHERE deleted = 0")
        tasks = [dict(row) for row in cur.fetchall()]
        task_dict = {t["id"]: t for t in tasks}
        root_tasks = []
        for t in tasks:
            t["children"] = []
            t["tags"] = []
        for t in tasks:
            if t["parent_id"] and t["parent_id"] in task_dict:
                task_dict[t["parent_id"]]["children"].append(t)
            else:
                root_tasks.append(t)
        for t in tasks:
            cur.execute("""
                SELECT t.name, t.color FROM tags t
                JOIN task_tags tt ON t.id = tt.tag_id
                WHERE tt.task_id = ?
            """, (t["id"],))
            t["tags"] = [{"name": row["name"], "color": row["color"]} for row in cur.fetchall()]

        def clean_task(task):
            cleaned = {
                "title": task["title"],
                "description": task.get("description", ""),
                "priority": task["priority"],
                "task_line": task["task_line"],
                "status": task["status"],
                "progress_mode": task["progress_mode"],
                "progress": task["progress"],
                "target_value": task["target_value"],
                "current_value": task["current_value"],
                "planned_start": task["planned_start"],
                "planned_end": task["planned_end"],
                "due_date": task["due_date"],
                "repeat_type": task["repeat_type"],
                "repeat_interval": task["repeat_interval"],
                "tags": [tag["name"] for tag in task["tags"]],
                "reward_exp": task["reward_exp"],
                "reward_lungmen": task["reward_lungmen"],
                "reward_source_stone": task["reward_source_stone"],
                "reward_orundum": task["reward_orundum"],
                "notes": task.get("notes", ""),
                "children": [clean_task(child) for child in task.get("children", [])],
                "original_id": task["id"],
                "prerequisite_id": task["prerequisite_id"],
                "completed_at": task["completed_at"],
                "drop_config": task["drop_config"],
            }
            return cleaned

        export_tasks = [clean_task(t) for t in root_tasks]
        export_data = {"version": 1, "tasks": export_tasks, "tags": []}
        cur.execute("SELECT name, color FROM tags")
        export_data["tags"] = [dict(row) for row in cur.fetchall()]
    return {"data": export_data}


@app.delete("/api/data/clear")
async def clear_data(scope: str = Query("all", description="tasks | resources | all")):
    """清空测试数据。保留 settings 与 achievements(预设定义)。
    - tasks:     任务 + 标签关联 + 追踪/番茄会话 + 任务相关成就解锁
    - resources: 资源(经验等)重置为初始值 + 资源流水
    - all:       以上全部 + 礼包 + 现实奖励 + 全部成就解锁
    """
    if scope not in ("tasks", "resources", "all"):
        raise HTTPException(status_code=400, detail="无效的清空范围，必须是 tasks / resources / all")

    cleared = {}
    with db_cursor() as cur:
        if scope in ("tasks", "all"):
            cur.execute("DELETE FROM task_tags")
            cur.execute("DELETE FROM tracking_sessions")
            cur.execute("DELETE FROM pomodoro_sessions")
            cur.execute("DELETE FROM achievement_unlocks")
            cur.execute("DELETE FROM tasks")
            cleared["tasks"] = True
        if scope in ("resources", "all"):
            cur.execute("DELETE FROM resources")
            cur.execute("DELETE FROM resource_transactions")
            init_resources = [
                ("exp", 0, None),
                ("source_stone", 0, None),
                ("lungmen", 0, None),
                ("orundum", 0, None),
                ("sanity", sanity_cap(1), sanity_cap(1)),
            ]
            for r in init_resources:
                cur.execute(
                    "INSERT INTO resources (resource_type, current_value, max_value) VALUES (?, ?, ?)",
                    r,
                )
            cleared["resources"] = True
        if scope == "all":
            cur.execute("DELETE FROM gift_packs")
            cur.execute("DELETE FROM reality_rewards")
            cur.execute("DELETE FROM tags")
            cleared["gift_packs"] = True
            cleared["reality_rewards"] = True
            cleared["tags"] = True
    return {"data": {"scope": scope, "cleared": cleared, "message": "数据已清空"}}


@app.get("/api/settings")
async def get_settings():
    with db_cursor() as cur:
        cur.execute("SELECT settings_json FROM settings WHERE id = 1")
        row = cur.fetchone()
        if row:
            settings = json.loads(row[0])
        else:
            settings = {}
    return {"data": settings}


@app.put("/api/settings")
async def update_settings(settings: Dict[str, Any]):
    allowed_keys = {
        "tracking_panel_collapsed",
        "focus_mode",
        "quick_track",
        "show_side_when_tracking_main",
        "show_main_when_tracking_side",
        "show_sanity",
        "pomodoro_focus_minutes",
        "pomodoro_break_minutes",
        "wallpaper_url",
        "wallpaper_type",
        "wp_current_id",
        "theme",
        "username",
        "categories",
        # 领取父任务时是否一并领取所有子任务奖励（默认开）
        "claim_with_children",
    }
    invalid_keys = set(settings.keys()) - allowed_keys
    if invalid_keys:
        raise HTTPException(status_code=400, detail=f"不允许更新的设置项: {', '.join(invalid_keys)}")
    filtered = {k: v for k, v in settings.items() if k in allowed_keys}
    with db_cursor() as cur:
        cur.execute("SELECT settings_json FROM settings WHERE id = 1")
        row = cur.fetchone()
        if row:
            existing = json.loads(row[0])
        else:
            existing = {}
        existing.update(filtered)
        cur.execute("UPDATE settings SET settings_json = ? WHERE id = 1", (json.dumps(existing),))
        if cur.rowcount == 0:
            cur.execute("INSERT INTO settings (id, settings_json) VALUES (1, ?)", (json.dumps(existing),))
    return {"data": existing}


# ============================================================
# 壁纸软件接入：检测本机 Wallpaper Engine / Lively Wallpaper 并一键切换
# ============================================================
@app.get("/api/wallpaper-software")
async def api_wallpaper_software():
    """检测本机已安装的壁纸软件及其可用壁纸列表。"""
    return {"data": detect_wallpaper_software()}


@app.get("/api/wallpaper-software/preview")
async def api_wallpaper_preview(id: str):
    """按需提供壁纸预览图（仅限已探测到的壁纸，避免路径穿越）。"""
    entry = get_wallpaper_entry(id)
    if not entry or not entry.get("preview_file") or not os.path.isfile(entry["preview_file"]):
        return Response(status_code=404, media_type="text/plain")
    return FileResponse(entry["preview_file"])


class WallpaperApplyRequest(BaseModel):
    id: str
    software: Optional[str] = None


# ---------- 移动端壁纸转码：懒生成 + 缓存 ----------
# 背景：WE 壁纸多是 1080p/10Mbps 的巨片（篝火 303MB）。经 cpolar 内网穿透在手机上
# 根本喂不动，会一直缓冲 -> 表现就是「壁纸不会动」。这里按需转出 720p/约 700kbps
# 的轻量版（实测 303MB -> 21MB，-93%），首次访问时转一次并缓存。
MOBILE_WP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "wallpaper_mobile")
_MOBILE_ENCODE_LOCK = threading.Lock()


def _find_ffmpeg():
    """优先系统 ffmpeg，其次 imageio_ffmpeg 自带的二进制。找不到返回 None。"""
    import shutil
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def get_mobile_video(entry, wallpaper_id):
    """生成/复用视频壁纸的移动端轻量版。失败返回 None（调用方回退原始视频）。"""
    src = entry.get("video_file")
    if not src or not os.path.isfile(src):
        return None
    try:
        os.makedirs(MOBILE_WP_DIR, exist_ok=True)
    except Exception:
        return None
    digest = hashlib.md5(wallpaper_id.encode("utf-8")).hexdigest()
    dst = os.path.join(MOBILE_WP_DIR, digest + ".mp4")
    if os.path.isfile(dst) and os.path.getsize(dst) > 0:
        return dst

    ffmpeg = _find_ffmpeg()
    if not ffmpeg:
        return None
    with _MOBILE_ENCODE_LOCK:
        # 双重检查：等待锁期间可能已被其他请求转好
        if os.path.isfile(dst) and os.path.getsize(dst) > 0:
            return dst
        tmp = dst + ".encoding.mp4"
        cmd = [
            ffmpeg, "-y", "-i", src,
            "-vf", "scale=1280:-2",              # 720p
            "-c:v", "libx264", "-preset", "fast", "-crf", "28",
            "-profile:v", "main", "-pix_fmt", "yuv420p",  # iOS 兼容性
            "-an",                                # 去音轨：壁纸无需声音，省带宽
            "-movflags", "+faststart",            # 边下边播
            tmp,
        ]
        try:
            subprocess.run(cmd, stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL, timeout=1800)
            if os.path.isfile(tmp) and os.path.getsize(tmp) > 0:
                os.replace(tmp, dst)
                return dst
        except Exception:
            pass
        finally:
            if os.path.isfile(tmp):
                try:
                    os.remove(tmp)
                except Exception:
                    pass
    return None


@app.get("/api/wallpaper-software/media")
async def api_wallpaper_media(id: str, mobile: bool = False):
    """提供壁纸实际媒体文件（视频 > 预览图 > 应用路径），供前端作为动态背景播放。

    mobile=1 时返回转码后的轻量版（仅对视频壁纸生效），供手机/弱网使用。
    """
    entry = get_wallpaper_entry(id)
    if not entry:
        return Response(status_code=404, media_type="text/plain")
    target = entry.get("video_file") or entry.get("image_file") or entry.get("preview_file") or entry.get("apply_path")
    # 移动端优先用低码率版本；转码在线程里跑，避免阻塞事件循环
    if mobile and entry.get("video_file"):
        mob = await asyncio.to_thread(get_mobile_video, entry, id)
        if mob:
            target = mob
    if not target or not os.path.isfile(target):
        return Response(status_code=404, media_type="text/plain")
    media_type = mimetypes.guess_type(target)[0] or "application/octet-stream"
    return FileResponse(target, media_type=media_type, headers={"Accept-Ranges": "bytes", "Cache-Control": "no-cache"})


@app.post("/api/wallpaper-software/apply")
async def api_wallpaper_apply(req: WallpaperApplyRequest):
    """一键切换系统壁纸到指定条目，并记录当前壁纸到设置以便回显。"""
    result = apply_wallpaper(req.software, req.id)
    if result.get("success"):
        try:
            with db_cursor() as cur:
                cur.execute("SELECT settings_json FROM settings WHERE id = 1")
                row = cur.fetchone()
                existing = json.loads(row[0]) if row else {}
                existing["wp_current_id"] = req.id
                cur.execute("UPDATE settings SET settings_json = ? WHERE id = 1", (json.dumps(existing),))
        except Exception:
            pass
    return {"data": result}


@app.get("/api/remote-url")
async def api_remote_url():
    """返回当前 cpolar 远程访问地址（由启动器写入 REMOTE_URL.txt）。"""
    url_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "REMOTE_URL.txt")
    try:
        if os.path.exists(url_file):
            content = open(url_file, "r", encoding="utf-8").read()
            for line in content.strip().splitlines():
                line = line.strip()
                if line.startswith("http"):
                    return {"url": line, "status": "ok"}
        return {"url": None, "status": "no_url_file"}
    except Exception as e:
        return {"url": None, "status": "error", "detail": str(e)}


@app.get("/api/health")
async def api_health():
    """启动器健康检查：确认这是带完整 API 的本项目服务。"""
    return {"status": "ok", "app": "quest-log", "remote_url_api": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)