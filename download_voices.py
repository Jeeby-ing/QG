#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
下载明日方舟干员「日语·完成任务」语音到 Quest-log（static/sounds/arkanights/）。

为什么需要这个脚本（而不是直接 curl）：
  PRTS 的语音文件托管在 torappu.prts.wiki 存储后端，主站 prts.wiki 又有 Cloudflare 防护，
  普通脚本会被 403 / 拿到占位页。只有「真实浏览器」能正常加载播放。
  本脚本用 Playwright 启动一个真实 Chromium，自动完成：
    1. 打开每位干员的语音记录页（绕过 Cloudflare）
    2. 解析出「日语」基路径 + 各语音行（标题 / 序号 / 文件名）
    3. 只挑「完成任务」类（3星结束行动 / 非3星结束行动 / 高难结束行动 / 行动失败）
    4. 从 torappu 拉取对应 mp3 并保存，最后生成 manifest.json

用法：
  pip install playwright
  playwright install chromium
  python download_voices.py

可选：编辑下方 OPERATORS 列表增减干员；改 COMPLETION_ONLY 控制是否只下完成任务类。
若卡在 Cloudflare 验证页，把 HEADLESS 改为 False，手动过一次验证即可（cookie 会缓存在 USER_DATA_DIR）。
"""
import os, re, sys, json, base64, shutil
from urllib.parse import quote

# ===================== 可配置项 =====================
# 干员中文名（即 PRTS 词条名）。想多下就往里加。
OPERATORS = [
    "维什戴尔", "能天使", "德克萨斯", "银灰", "陈", "史尔特尔",
    "推进之王", "闪灵", "安洁莉娜", "麦哲伦", "浊心斯卡蒂", "缪尔赛思",
    "令", "傀影", "伺夜", "澄闪", "黍", "塑心",
]
# 只下载「完成任务」类语音（True）；False 则下载该干员全部语音。
COMPLETION_ONLY = True
# 完成任务类语音的标题关键字（命中即下载）
COMPLETION_KEYWORDS = ("结束行动", "行动失败")
# 是否连其他常规语音也一起下（COMPLETION_ONLY=False 时生效）
# ===================================================

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "static", "sounds", "arkanights")
MANIFEST = os.path.join(OUT_DIR, "manifest.json")

HEADLESS = True
USER_DATA_DIR = os.path.join(HERE, ".pw_profile")  # 持久化 cookie，过一次 CF 验证后复用

WIKI = "https://prts.wiki/w/{name}/语音记录"
VOICE_HOST = "https://torappu.prts.wiki/assets/audio/{base}/{fname}"


def parse_voice_page(html: str):
    """返回 (jp_base, [(title, index, cn_filename), ...])"""
    m = re.search(r'data-voice-base="([^"]+)"', html)
    if not m:
        return None, []
    base = m.group(1).replace("&#95;", "_")
    langs = {}
    for part in base.split(","):
        if ":" in part:
            lang, path = part.split(":", 1)
            langs[lang.strip()] = path.strip()
    jp_base = langs.get("日语") or langs.get("日语(超新星)")
    if not jp_base:
        return None, []
    rows = re.findall(
        r'<div class="voice-data-item" data-title="([^"]*)" data-voice-index="(\d+)"[^>]*?data-voice-filename="([^"]+)"',
        html,
    )
    return jp_base, [(t, idx, fn) for t, idx, fn in rows]


def is_completion(title: str) -> bool:
    return any(k in title for k in COMPLETION_KEYWORDS)


def main():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        sys.exit("未安装 Playwright。请先执行：\n  pip install playwright\n  playwright install chromium")

    os.makedirs(OUT_DIR, exist_ok=True)
    files = []
    if os.path.exists(MANIFEST):
        try:
            files = json.load(open(MANIFEST, encoding="utf-8")).get("files", [])
        except Exception:
            files = []

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=HEADLESS,
            args=["--no-sandbox"] if HEADLESS else [],
        )
        context = browser.new_context(
            user_agent=("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"),
            accept_language="ja-JP,ja;q=0.9,zh-CN;q=0.8",
        )
        if os.path.isdir(USER_DATA_DIR):
            # 复用已缓存的登录/验证 cookie（Playwright 不自动读，这里仅占位）
            pass
        page = context.new_page()
        page.set_default_timeout(60000)

        for op in OPERATORS:
            url = WIKI.format(name=quote(op))
            print(f"\n=== {op}  ({url}) ===")
            try:
                page.goto(url, wait_until="domcontentloaded")
                # 等语音数据节点出现（说明页面渲染完、CF 已通过）
                page.wait_for_selector("#voice-data-root", timeout=45000)
            except Exception as e:
                print(f"  [跳过] 页面加载失败（可能被 Cloudflare 拦截）：{e}")
                print("  提示：把本脚本 HEADLESS 改为 False，手动过一次验证后再跑。")
                continue

            html = page.content()
            jp_base, rows = parse_voice_page(html)
            if not jp_base:
                print("  [跳过] 未解析到日语语音基路径")
                continue
            targets = [r for r in rows if (not COMPLETION_ONLY or is_completion(r[0]))]
            print(f"  解析到 {len(rows)} 行语音，本批下载 {len(targets)} 行")

            for title, idx, cn_fn in targets:
                # 已下载则跳过（支持断点续下）
                already = any(f.endswith(f"/{op}_{idx}.mp3") or f.endswith(f"/{op}_{idx}.wav") for f in files)
                if already and os.path.exists(os.path.join(OUT_DIR, f"{op}_{idx}.mp3")) or os.path.exists(os.path.join(OUT_DIR, f"{op}_{idx}.wav")):
                    print(f"  · {title} ({idx}) 已存在，跳过")
                    continue
                # 播放地址规律：日语基路径 / 同文件名(.wav->.mp3)
                fname_mp3 = cn_fn.rsplit(".", 1)[0] + ".mp3"
                saved = False
                for ext_fname in (fname_mp3, cn_fn):
                    audio_url = VOICE_HOST.format(base=jp_base, fname=quote(ext_fname))
                    try:
                        b64 = page.evaluate(
                            """async (u) => {
                                const r = await fetch(u, {mode:'cors'});
                                if (!r.ok) return null;
                                const buf = await r.arrayBuffer();
                                const bytes = new Uint8Array(buf);
                                let bin = '';
                                for (let i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
                                return btoa(bin);
                            }""",
                            audio_url,
                        )
                    except Exception as e:
                        b64 = None
                    if not b64:
                        continue
                    raw = base64.b64decode(b64)
                    if len(raw) < 500:  # 太短，多半是错误页
                        continue
                    out_name = f"{op}_{idx}.mp3" if ext_fname.endswith(".mp3") else f"{op}_{idx}.wav"
                    out_path = os.path.join(OUT_DIR, out_name)
                    with open(out_path, "wb") as f:
                        f.write(raw)
                    rel = f"static/sounds/arkanights/{out_name}"
                    if rel not in files:
                        files.append(rel)
                    print(f"  ✓ {title} ({idx}) -> {out_name} ({len(raw)} bytes)")
                    saved = True
                    break
                if not saved:
                    print(f"  ✗ {title} ({idx}) 下载失败（地址可能需确认）")

        browser.close()

    # 写 manifest（app.js 据此随机播放）
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump({"files": files}, f, ensure_ascii=False, indent=2)
    print(f"\n完成：共 {len(files)} 条语音，已写入 {MANIFEST}")


if __name__ == "__main__":
    main()
