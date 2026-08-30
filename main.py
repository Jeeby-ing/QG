import json
import random
import sqlite3
import os
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

        # 初始资源
        resources = [
            ('exp', 0, None),
            ('source_stone', 0, None),
            ('lungmen', 0, None),
            ('orundum', 0, None),
            ('sanity', 120, 120)
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
            "username": "博士"
        }
        cur.execute("INSERT OR IGNORE INTO settings (id, settings_json) VALUES (1, ?)", (json.dumps(default_settings),))

        # 预置成就
        achievements = [
            ("first_task", "初次启程", "创建第一个任务", "task_count_created", 1, 10, 0, 0, 0, 0),
            ("create_10", "十全十美", "创建10个任务", "task_count_created", 10, 50, 0, 0, 0, 0),
            ("create_50", "任务大师", "创建50个任务", "task_count_created", 50, 200, 0, 0, 0, 0),
            ("complete_first", "初次完成", "完成第一个任务", "task_count_completed", 1, 20, 0, 0, 0, 0),
            ("complete_10", "小有成就", "完成10个任务", "task_count_completed", 10, 100, 0, 0, 0, 0),
            ("complete_50", "任务达人", "完成50个任务", "task_count_completed", 50, 500, 0, 0, 0, 0),
            ("complete_100", "百炼成钢", "完成100个任务", "task_count_completed", 100, 1000, 0, 0, 0, 0),
            ("main_10", "主线推进者", "完成10个主线任务", "task_count_completed_main", 10, 150, 0, 0, 0, 0),
            ("side_20", "支线探索者", "完成20个支线任务", "task_count_completed_side", 20, 150, 0, 0, 0, 0),
            ("track_1h", "专注一小时", "累计追踪1小时", "tracking_hours_total", 1, 30, 0, 0, 0, 0),
            ("track_10h", "专注十小时", "累计追踪10小时", "tracking_hours_total", 10, 100, 0, 0, 0, 0),
            ("track_50h", "专注大师", "累计追踪50小时", "tracking_hours_total", 50, 500, 0, 0, 0, 0),
            ("streak_3", "三日之约", "连续3天有完成任务", "streak_days", 3, 50, 0, 0, 0, 0),
            ("streak_7", "七日之约", "连续7天有完成任务", "streak_days", 7, 100, 0, 0, 0, 0),
            ("streak_30", "月度坚持", "连续30天有完成任务", "streak_days", 30, 500, 0, 0, 0, 0),
            ("pack_first", "初次购买", "购买第一个礼包", "gift_pack_purchased", 1, 20, 0, 0, 0, 0),
            ("level_5", "初露锋芒", "达到5级", "level_reached", 5, 100, 0, 0, 0, 0),
        ]
        for ach in achievements:
            cur.execute("""
                INSERT OR IGNORE INTO achievements 
                (id, name, description, condition_type, condition_value, reward_exp, reward_lungmen, reward_source_stone, reward_orundum, hidden)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, ach)

        generate_weekly_packs(cur)


def generate_weekly_packs(cur):
    now = datetime.now(timezone.utc)
    weekday = now.weekday()
    if weekday == 0 and now.hour < 4:
        monday = (now - timedelta(days=7)).replace(hour=4, minute=0, second=0, microsecond=0)
    else:
        monday = (now - timedelta(days=weekday)).replace(hour=4, minute=0, second=0, microsecond=0)
    next_monday = monday + timedelta(days=7)
    cur.execute("DELETE FROM gift_packs WHERE purchased = 0 AND available_until < ?", (now.isoformat(),))
    cur.execute("SELECT COUNT(*) FROM gift_packs WHERE available_from >= ? AND available_from < ?",
                (monday.isoformat(), next_monday.isoformat()))
    if cur.fetchone()[0] == 0:
        pack_count = random.randint(3, 5)
        packs = [
            {"name": "新兵训练包", "description": "包含龙门币和经验", "pack_type": "fixed",
             "content_config": json.dumps({"resources": {"lungmen": 1000, "exp": 100}}),
             "cost_source_stone": 2, "rarity": "common"},
            {"name": "进阶补给包", "description": "随机资源", "pack_type": "random",
             "content_config": json.dumps(
                 {"random_pool": ["lungmen:2000", "exp:200", "source_stone:1", "orundum:100"]}),
             "cost_source_stone": 4, "rarity": "rare"},
            {"name": "豪华混合包", "description": "固定+随机", "pack_type": "mixed",
             "content_config": json.dumps({"fixed": {"source_stone": 2}, "random": ["lungmen:5000", "orundum:500"]}),
             "cost_source_stone": 8, "rarity": "epic"},
            {"name": "传说礼包", "description": "丰厚奖励", "pack_type": "fixed",
             "content_config": json.dumps({"resources": {"source_stone": 5, "orundum": 1000, "lungmen": 10000}}),
             "cost_source_stone": 15, "rarity": "legendary"},
        ]
        for i in range(pack_count):
            pack = packs[i % len(packs)]
            cur.execute("""
                INSERT INTO gift_packs (name, description, pack_type, content_config, cost_source_stone, rarity, available_from, available_until)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (pack["name"], pack["description"], pack["pack_type"], pack["content_config"],
                  pack["cost_source_stone"], pack["rarity"], monday.isoformat(), next_monday.isoformat()))


def background_weekly_pack_refresh():
    while True:
        now = datetime.now(timezone.utc)
        days_ahead = (7 - now.weekday()) % 7
        if days_ahead == 0 and now.hour >= 4:
            days_ahead = 7
        next_monday = (now + timedelta(days=days_ahead)).replace(hour=4, minute=0, second=0, microsecond=0)
        sleep_seconds = (next_monday - now).total_seconds()
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


def calculate_level(exp: float) -> int:
    if exp < 0:
        exp = 0
    return int(exp / 100) + 1


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
        cur.execute("SELECT max_value, current_value FROM resources WHERE resource_type = 'sanity'")
        row = cur.fetchone()
        max_sanity = row["max_value"] if row else 120
        current_sanity = row["current_value"] if row else 0
        diff = max_sanity - current_sanity
        if diff > 0:
            add_resource(cur, 'sanity', diff, 'level_up')
        check_level_reached(cur, new_level)
        if new_level % 5 == 0:
            cur.execute("SELECT settings_json FROM settings WHERE id = 1")
            settings = json.loads(cur.fetchone()[0])
            claimed_levels = settings.get("level_rewards_claimed", [])
            if new_level not in claimed_levels:
                content = {"resources": {"source_stone": 2, "orundum": 300, "lungmen": 5000, "exp": 200}}
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


def calculate_random_drops(task_id: int, completed_at: str) -> List[str]:
    """使用系统随机源生成掉落，避免可预测性"""
    rng = random.SystemRandom()
    drops = []
    r = rng.random()
    if r < 0.02:
        drops.append("source_stone:1")
    elif r < 0.025:
        drops.append("source_stone:2")
    r = rng.random()
    if r < 0.05:
        drops.append("orundum:50")
    elif r < 0.06:
        drops.append("orundum:200")
    r = rng.random()
    if r < 0.10:
        drops.append("lungmen:2")
    elif r < 0.12:
        drops.append("lungmen:5")
    return drops


def parse_drop_config_to_rewards(drop_config: Optional[str]) -> Dict[str, float]:
    rewards = {'source_stone': 0, 'orundum': 0, 'lungmen': 0}
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
                    if res_type in rewards:
                        rewards[res_type] += amount
                except ValueError:
                    pass
            elif '_' in drop:
                parts = drop.rsplit('_', 1)
                if len(parts) == 2:
                    res_type, amount_str = parts
                    try:
                        amount = float(amount_str)
                        if res_type in rewards:
                            rewards[res_type] += amount
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
    if task["repeat_type"]:
        create_repeat_copy(cur, task_id)
    if task["parent_id"]:
        update_parent_progress(cur, task["parent_id"])


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


def create_repeat_copy(cur, task_id: int):
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
    reward_exp = task["priority"] * 20 * (1.3 if task["task_line"] == 'main' else 1.0)
    reward_lungmen = task["priority"] * 100 * (1.2 if task["task_line"] == 'side' else 1.0)
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
        task["reward_source_stone"],
        task["reward_orundum"],
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
            reward_exp = task["priority"] * 20 * 1.3
        else:
            reward_exp = task["priority"] * 20
        reward_exp += child_count * 5
        task_dict["reward_exp"] = reward_exp
    if task_dict["reward_lungmen"] == 0:
        if task["task_line"] == 'side':
            reward_lungmen = task["priority"] * 100 * 1.2
        else:
            reward_lungmen = task["priority"] * 100
        task_dict["reward_lungmen"] = reward_lungmen
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
                reward_exp = t["priority"] * 20 * 1.3
            else:
                reward_exp = t["priority"] * 20
            reward_exp += child_count * 5
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
        if task.get("parent_id"):
            parent = task_dict_by_id.get(task["parent_id"])
            if parent and parent["status"] != 'done':
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
    target_type: str = Field(..., pattern='^(source_stone|orundum)$')
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
    if response.headers.get("content-type", "").startswith("application/json"):
        body = b""
        async for chunk in response.body_iterator:
            body += chunk
        try:
            data = json.loads(body)
        except:
            return response
        if isinstance(data, dict):
            if "code" in data:
                return response
            elif "data" in data:
                wrapped = {"code": 0, "message": "ok", "data": data["data"]}
                return JSONResponse(content=wrapped, status_code=response.status_code)
    return response


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
@app.get("/api/tasks/tree")
async def get_task_tree(include_archived: bool = False, include_deleted: bool = False):
    with db_cursor() as cur:
        tree = build_task_tree(cur, include_archived=include_archived, include_deleted=include_deleted)
    return {"data": tree}


@app.get("/api/tasks")
async def get_tasks(
        status: Optional[str] = None,
        priority: Optional[int] = None,
        tag: Optional[str] = None,
        task_line: Optional[str] = None,
        is_tracked: Optional[bool] = None,
        keyword: Optional[str] = None,
        include_archived: bool = False,
        include_deleted: bool = False,
):
    with db_cursor() as cur:
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
                    reward_exp = task["priority"] * 20 * 1.3
                else:
                    reward_exp = task["priority"] * 20
                reward_exp += child_count * 5
                task_dict["reward_exp"] = reward_exp
            if task_dict["reward_lungmen"] == 0:
                if task["task_line"] == 'side':
                    reward_lungmen = task["priority"] * 100 * 1.2
                else:
                    reward_lungmen = task["priority"] * 100
                task_dict["reward_lungmen"] = reward_lungmen
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
            if task.status == 'done' and parent["status"] != 'done':
                raise HTTPException(status_code=400, detail="父任务未完成，不能直接创建为已完成状态")
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
                parent_id, title, description, priority, task_line, status, progress_mode, progress,
                target_value, current_value, prerequisite_id, planned_start, planned_end, due_date,
                repeat_type, repeat_interval, repeat_next_date, created_at, updated_at,
                is_tracked, reward_exp, reward_lungmen, reward_source_stone, reward_orundum,
                drop_config, notes, sort_order, archived, deleted, completed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            task.parent_id,
            task.title,
            task.description,
            task.priority,
            task.task_line,
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
            final_status = update_fields.get('status', existing['status'])
            if final_status == 'done' and parent['status'] != 'done':
                raise HTTPException(status_code=400, detail="父任务未完成")
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
                if updated_task['parent_id']:
                    cur.execute("SELECT status FROM tasks WHERE id = ?", (updated_task['parent_id'],))
                    parent = cur.fetchone()
                    if parent and parent['status'] != 'done':
                        raise HTTPException(status_code=400, detail="父任务未完成")
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
            if task["parent_id"]:
                cur.execute("SELECT status FROM tasks WHERE id = ?", (task["parent_id"],))
                parent = cur.fetchone()
                if parent and parent["status"] != 'done':
                    raise HTTPException(status_code=400, detail="父任务未完成")
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
        if task["parent_id"]:
            cur.execute("SELECT status FROM tasks WHERE id = ?", (task["parent_id"],))
            parent = cur.fetchone()
            if parent and parent["status"] != 'done':
                raise HTTPException(status_code=400, detail="父任务未完成")
        cur.execute("""
            SELECT COUNT(*) FROM tasks 
            WHERE parent_id = ? AND deleted = 0 AND archived = 0 AND status != 'cancelled' AND status != 'done'
        """, (task_id,))
        unfinished_children = cur.fetchone()[0]
        if unfinished_children > 0:
            raise HTTPException(status_code=400, detail="存在未完成的子任务，不能直接完成该任务")
        if task["progress_mode"] == 'count' and (
                task["current_value"] is None or task["current_value"] < task["target_value"]):
            raise HTTPException(status_code=400, detail="计数任务未达到目标值")
        cur.execute("""
            UPDATE tasks SET status = 'done', progress = 100, completed_at = ?, updated_at = ?
            WHERE id = ?
        """, (now_iso(), now_iso(), task_id))
        handle_task_completion(cur, task_id)
    return {"data": {"id": task_id, "status": "done"}}


@app.post("/api/tasks/{task_id}/claim-reward")
async def claim_reward(task_id: int):
    with db_cursor() as cur:
        cur.execute("SELECT * FROM tasks WHERE id = ? AND deleted = 0", (task_id,))
        task = cur.fetchone()
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        if task["status"] != 'done':
            raise HTTPException(status_code=400, detail="任务未完成")
        if task["reward_claimed"]:
            raise HTTPException(status_code=400, detail="奖励已领取")
        # 基础奖励
        if task["reward_exp"] != 0:
            reward_exp = task["reward_exp"]
        else:
            reward_exp = task["priority"] * 20 * (1.3 if task["task_line"] == 'main' else 1.0)
            cur.execute(
                "SELECT COUNT(*) FROM tasks WHERE parent_id = ? AND deleted = 0 AND archived = 0 AND status != 'cancelled'",
                (task_id,))
            child_count = cur.fetchone()[0]
            reward_exp += child_count * 5
        if task["reward_lungmen"] != 0:
            reward_lungmen = task["reward_lungmen"]
        else:
            reward_lungmen = task["priority"] * 100 * (1.2 if task["task_line"] == 'side' else 1.0)
        rewards = {
            'exp': reward_exp,
            'lungmen': reward_lungmen,
            'source_stone': task["reward_source_stone"],
            'orundum': task["reward_orundum"],
        }
        drop_rewards = parse_drop_config_to_rewards(task["drop_config"])
        rewards['source_stone'] += drop_rewards['source_stone']
        rewards['orundum'] += drop_rewards['orundum']
        rewards['lungmen'] += drop_rewards['lungmen']
        # 没有奖励也标记为已领取
        for res_type, amount in rewards.items():
            if amount > 0:
                add_resource(cur, res_type, amount, f'task_reward_{task_id}', task_id)
        cur.execute("UPDATE tasks SET reward_claimed = 1, updated_at = ? WHERE id = ?", (now_iso(), task_id))
        old_exp = get_resource(cur, 'exp') - rewards['exp']
        new_exp = get_resource(cur, 'exp')
        check_and_apply_level_up(cur, old_exp, new_exp)
    return {"data": {"id": task_id, "claimed": True, "rewards": rewards}}


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
        claimed_count = 0
        for task in tasks:
            if task["reward_exp"] != 0:
                reward_exp = task["reward_exp"]
            else:
                reward_exp = task["priority"] * 20 * (1.3 if task["task_line"] == 'main' else 1.0)
                cur.execute(
                    "SELECT COUNT(*) FROM tasks WHERE parent_id = ? AND deleted = 0 AND archived = 0 AND status != 'cancelled'",
                    (task["id"],))
                child_count = cur.fetchone()[0]
                reward_exp += child_count * 5
            if task["reward_lungmen"] != 0:
                reward_lungmen = task["reward_lungmen"]
            else:
                reward_lungmen = task["priority"] * 100 * (1.2 if task["task_line"] == 'side' else 1.0)
            rewards = {
                'exp': reward_exp,
                'lungmen': reward_lungmen,
                'source_stone': task["reward_source_stone"],
                'orundum': task["reward_orundum"],
            }
            drop_rewards = parse_drop_config_to_rewards(task["drop_config"])
            rewards['source_stone'] += drop_rewards['source_stone']
            rewards['orundum'] += drop_rewards['orundum']
            rewards['lungmen'] += drop_rewards['lungmen']
            for res_type, amount in rewards.items():
                if amount > 0:
                    add_resource(cur, res_type, amount, f'task_reward_{task["id"]}', task["id"])
                    total_rewards[res_type] += amount
            cur.execute("UPDATE tasks SET reward_claimed = 1, updated_at = ? WHERE id = ?", (now_iso(), task["id"]))
            claimed_count += 1
        if claimed_count > 0:
            old_exp = get_resource(cur, 'exp') - total_rewards['exp']
            new_exp = get_resource(cur, 'exp')
            check_and_apply_level_up(cur, old_exp, new_exp)
    return {"data": {"claimed": claimed_count, "rewards": total_rewards}}


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
    return {"data": resources}


@app.get("/api/resources/transactions")
async def get_transactions(limit: int = 50, offset: int = 0):
    with db_cursor() as cur:
        cur.execute("SELECT * FROM resource_transactions ORDER BY created_at DESC LIMIT ? OFFSET ?", (limit, offset))
        transactions = [dict(row) for row in cur.fetchall()]
    return {"data": transactions}


@app.post("/api/resources/exchange")
async def exchange_resource(request: ExchangeRequest):
    if request.target_type == 'source_stone':
        cost = request.amount * 1000
    elif request.target_type == 'orundum':
        cost = request.amount * 2
    else:
        raise HTTPException(status_code=400, detail="不支持的目标资源类型")
    with db_cursor() as cur:
        lungmen = get_resource(cur, 'lungmen')
        if lungmen < cost:
            raise HTTPException(status_code=400, detail="龙门币不足")
        add_resource(cur, 'lungmen', -cost, f'exchange_{request.target_type}', None)
        add_resource(cur, request.target_type, request.amount, f'exchange_lungmen', None)
    return {"data": {"exchanged": request.amount, "target_type": request.target_type, "cost": cost}}


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
        cur.execute("SELECT * FROM gift_packs WHERE purchased = 0 AND available_from <= ? AND available_until >= ?",
                    (now, now))
        packs = [dict(row) for row in cur.fetchall()]
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
        if pack["pack_type"] == 'fixed':
            resources = content_config.get("resources", {})
            for res_type, amount in resources.items():
                add_resource(cur, res_type, amount, f'gift_pack_content_{pack_id}', pack_id)
        elif pack["pack_type"] == 'random':
            random_pool = content_config.get("random_pool", [])
            if random_pool:
                chosen = random.choice(random_pool)
                if ':' in chosen:
                    res_type, amount_str = chosen.split(':', 1)
                    try:
                        amount = float(amount_str)
                        add_resource(cur, res_type, amount, f'gift_pack_content_{pack_id}', pack_id)
                    except ValueError:
                        pass
        elif pack["pack_type"] == 'mixed':
            fixed = content_config.get("fixed", {})
            for res_type, amount in fixed.items():
                add_resource(cur, res_type, amount, f'gift_pack_content_{pack_id}', pack_id)
            random_pool = content_config.get("random", [])
            if random_pool:
                chosen = random.choice(random_pool)
                if ':' in chosen:
                    res_type, amount_str = chosen.split(':', 1)
                    try:
                        amount = float(amount_str)
                        add_resource(cur, res_type, amount, f'gift_pack_content_{pack_id}', pack_id)
                    except ValueError:
                        pass
        cur.execute("UPDATE gift_packs SET purchased = 1 WHERE id = ?", (pack_id,))
        cur.execute("SELECT COUNT(*) FROM gift_packs WHERE purchased = 1")
        purchased_count = cur.fetchone()[0]
        check_achievement(cur, 'gift_pack_purchased', purchased_count, None)
        new_exp = get_resource(cur, 'exp')
        check_and_apply_level_up(cur, old_exp, new_exp)
    return {"data": {"id": pack_id, "purchased": True}}


@app.get("/api/achievements")
async def get_achievements():
    with db_cursor() as cur:
        cur.execute("SELECT * FROM achievements")
        achievements = [dict(row) for row in cur.fetchall()]
    return {"data": achievements}


@app.get("/api/achievements/unlocked")
async def get_unlocked_achievements():
    with db_cursor() as cur:
        cur.execute("""
            SELECT a.*, au.unlocked_at, au.task_id
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


@app.post("/api/achievements/draw")
async def draw_achievement():
    DRAW_COST_ORUNDUM = 300
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
                now = datetime.now(timezone.utc)
                if repeat_type == 'daily':
                    repeat_next_date = (now + timedelta(days=1)).isoformat()
                elif repeat_type == 'weekly':
                    repeat_next_date = (now + timedelta(weeks=1)).isoformat()
                elif repeat_type == 'monthly':
                    month = now.month + 1
                    year = now.year
                    if month > 12:
                        month = 1
                        year += 1
                    repeat_next_date = now.replace(year=year, month=month).isoformat()
                elif repeat_type == 'custom':
                    repeat_next_date = (now + timedelta(days=repeat_interval or 1)).isoformat()

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
                    parent_id, title, description, priority, task_line, status, progress_mode, progress,
                    target_value, current_value, prerequisite_id, planned_start, planned_end, due_date,
                    repeat_type, repeat_interval, repeat_next_date, created_at, updated_at,
                    is_tracked, reward_exp, reward_lungmen, reward_source_stone, reward_orundum,
                    drop_config, notes, sort_order, archived, deleted, completed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                parent_id,  # 1
                title,  # 2
                description,  # 3
                priority,  # 4
                task_line,  # 5
                status,  # 6
                progress_mode,  # 7
                progress_value,  # 8
                target_value,  # 9
                current_value,  # 10
                None,  # 11 - prerequisite_id (稍后设置)
                planned_start,  # 12
                planned_end,  # 13
                due_date,  # 14
                repeat_type,  # 15
                repeat_interval,  # 16
                repeat_next_date,  # 17
                now_iso(),  # 18 - created_at
                now_iso(),  # 19 - updated_at
                1 if is_tracked else 0,  # 20
                reward_exp,  # 21
                reward_lungmen,  # 22
                reward_source_stone,  # 23
                reward_orundum,  # 24
                provided_drop_config if status != 'done' else None,  # 25
                notes,  # 26
                sort_order,  # 27
                0,  # 28 - archived
                0,  # 29 - deleted
                completed_at  # 30
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
                drops = calculate_random_drops(new_task_id, completed_at)
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

        cur.execute("SELECT id, parent_id, prerequisite_id FROM tasks WHERE status = 'done' AND deleted = 0")
        for row in cur.fetchall():
            if row["parent_id"]:
                cur.execute("SELECT status FROM tasks WHERE id = ?", (row["parent_id"],))
                parent = cur.fetchone()
                if parent and parent["status"] != 'done':
                    raise HTTPException(status_code=400, detail=f"任务 {row['id']} 已完成但父任务未完成")
            if row["prerequisite_id"]:
                cur.execute("SELECT status FROM tasks WHERE id = ?", (row["prerequisite_id"],))
                prereq = cur.fetchone()
                if prereq and prereq["status"] != 'done':
                    raise HTTPException(status_code=400, detail=f"任务 {row['id']} 已完成但前置任务未完成")

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
                ("sanity", 120, 120),
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


@app.get("/api/wallpaper-software/media")
async def api_wallpaper_media(id: str):
    """提供壁纸实际媒体文件（视频 > 预览图 > 应用路径），供前端作为动态背景播放。"""
    entry = get_wallpaper_entry(id)
    if not entry:
        return Response(status_code=404, media_type="text/plain")
    target = entry.get("video_file") or entry.get("preview_file") or entry.get("apply_path")
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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)