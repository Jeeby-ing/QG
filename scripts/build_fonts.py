# -*- coding: utf-8 -*-
"""从客户端 APK 提取明日方舟原版字体，切子集并转为 WOFF2，供 Web 前端使用。

背景
----
原版 UI 正文/标题用的是 **思源黑体 CN Medium**（`assets/font/SourceHanSansCN-Medium.ttf`）。
APK 内一共只有 3 个字体文件：

    assets/font/SourceHanSansCN-Medium.ttf     思源黑体 CN Medium（正文/UI，本项目使用）
    assets/font/SourceHanSerifCN-Medium.ttf    思源宋体 CN Medium（装饰标题，暂未启用）
    res/font/taptap_ratings_bold.otf           TapTap 评分控件，与游戏 UI 无关

产物
----
    static/fonts/ak-sans-latin.woff2   拉丁字母 / 标点 / 符号 / 全角（小，首屏即用）
    static/fonts/ak-sans-cjk.woff2     中日韩表意文字（大，按 unicode-range 懒加载）
    static/fonts/ak-fonts.css          自动生成的 @font-face（含 unicode-range）

两个文件用 `unicode-range` 拆分：浏览器只为「页面上真正出现的字符」下载对应文件，
所以拉丁界面文字会立刻出字形，6MB 级的 CJK 部分随后补齐 —— 比塞一个整包体感好得多。

依赖
----
- `fontTools`（系统 Python 3.14 自带）
- `brotli`：本机没有 Python 版，但 Node 内置 brotli，故用自带 shim（见 _brotli_shim/brotli.py）
  把压缩/解压转发给 Node。WOFF2 强制要求 brotli，没有它只能退化成 WOFF（大 ~35%）。

用法
----
    C:\\Users\\MMCGA\\AppData\\Local\\Programs\\Python\\Python314\\python.exe scripts\\build_fonts.py
"""
import io
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT_DIR = os.path.join(ROOT, "static", "fonts")
APK = os.path.join(ROOT, "assets-source", "arknights-hg-2771.apk")
APK_FONT = "assets/font/SourceHanSansCN-Medium.ttf"

# 让 fontTools 能 import 到我们的 node 版 brotli
sys.path.insert(0, os.path.join(HERE, "_brotli_shim"))

FAMILY = "AK Sans CN"

# ---------------------------------------------------------------- 子集范围
# 拉丁 + 标点 + 符号 + 全角：界面骨架（数字、英文、括号、箭头、方舟常用的 ／ 等）
LATIN_RANGES = [
    (0x0020, 0x00FF),   # Basic Latin + Latin-1 Supplement
    (0x0100, 0x024F),   # Latin Extended-A/B
    (0x0250, 0x02AF),   # IPA
    (0x02B0, 0x02FF),   # 修饰字母
    (0x0300, 0x036F),   # 组合用附加符号
    (0x0370, 0x03FF),   # 希腊字母
    (0x0400, 0x04FF),   # 西里尔字母（方舟里有俄式地名）
    (0x2000, 0x206F),   # 常用标点（— – … “ ” ‘ ’ 等）
    (0x2070, 0x209F),   # 上下标
    (0x20A0, 0x20CF),   # 货币符号
    (0x2100, 0x214F),   # 字母式符号（№ ™ 等）
    (0x2150, 0x218F),   # 数字形式（½ ⅓ 等）
    (0x2190, 0x21FF),   # 箭头
    (0x2200, 0x22FF),   # 数学运算符
    (0x2460, 0x24FF),   # 带圈数字 / 字母
    (0x25A0, 0x25FF),   # 几何图形（■ ▲ ● 等，方舟 UI 大量使用）
    (0x2600, 0x27BF),   # 装饰符号（★ ✦ ✓ 等）
    (0x3000, 0x303F),   # CJK 标点（、。「」《》 等）
    (0xFE10, 0xFE1F),   # 竖排标点
    (0xFF00, 0xFFEF),   # 全角字符
]

# CJK 表意文字：用户任务名可能是任意汉字，故保留完整 URO，不做裁剪（避免豆腐块）
CJK_RANGES = [
    (0x2E80, 0x2EFF),   # CJK 部首补充
    (0x31C0, 0x31EF),   # CJK 笔画
    (0x3400, 0x4DBF),   # 扩展 A
    (0x4E00, 0x9FFF),   # 基本区（URO）
    (0xF900, 0xFAFF),   # 兼容表意文字
]

# 方舟 UI 中会用到、但不属于上面任何区间的零散符号
EXTRA_CODEPOINTS = [
    0x00B7, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026, 0x2030, 0x203B,
    0x2160, 0x2161, 0x2162, 0x2163, 0x2164, 0x2165, 0x2166, 0x2167,
    0x2168, 0x2169, 0x3005, 0x3013, 0x3231, 0x32A3, 0xFF01, 0xFF1F,
]


def _expand(ranges):
    out = []
    for a, b in ranges:
        out.extend(range(a, b + 1))
    return out


def extract_from_apk(dest_dir):
    """从 APK 里解出原版 TTF（幂等：已存在则跳过）。"""
    import zipfile

    os.makedirs(dest_dir, exist_ok=True)
    dst = os.path.join(dest_dir, os.path.basename(APK_FONT))
    if os.path.exists(dst) and os.path.getsize(dst) > 1_000_000:
        return dst
    if not os.path.exists(APK):
        raise SystemExit("找不到 APK: %s" % APK)
    with zipfile.ZipFile(APK) as z:
        data = z.read(APK_FONT)
    with open(dst, "wb") as f:
        f.write(data)
    return dst


def build_subset(src_ttf, unicodes, out_path):
    """切子集 → WOFF2。返回 (字节数, 命中字形数)。"""
    from fontTools import subset
    from fontTools.ttLib import TTFont

    font = TTFont(src_ttf, lazy=True)
    available = set(font.getBestCmap().keys())
    keep = sorted(set(unicodes) & available)

    opts = subset.Options()
    opts.layout_features = ["*"]        # 保留 kern / liga 等排版特性
    opts.name_IDs = ["*"]               # 保留字体名表
    opts.name_legacy = True
    opts.name_languages = ["*"]
    opts.notdef_outline = True          # 保留 .notdef，缺失字符仍可见
    opts.recalc_bounds = True
    opts.drop_tables = ["DSIG"]         # 签名表对 Web 无用
    opts.desubroutinize = False
    opts.hinting = True                 # 屏幕显示保留 hinting

    subsetter = subset.Subsetter(options=opts)
    subsetter.populate(unicodes=keep)
    subsetter.subset(font)

    font.flavor = "woff2"
    font.save(out_path)
    size = os.path.getsize(out_path)
    font.close()
    return size, len(keep)


def _range_css(ranges, extras):
    parts = ["U+%X-%X" % (a, b) for a, b in ranges]
    parts += ["U+%X" % c for c in extras]
    return ", ".join(parts)


def _covered(ranges):
    s = set()
    for a, b in ranges:
        s.update(range(a, b + 1))
    return s


def main():
    t0 = time.time()
    os.makedirs(OUT_DIR, exist_ok=True)

    work = os.path.join(ROOT, "assets-source", "_font_src")
    src = extract_from_apk(work)
    print("[1/3] 原版字体: %s (%.2f MB)" % (os.path.basename(src), os.path.getsize(src) / 1048576))
    src_mtime = os.path.getmtime(src)

    # 零散符号（½ № ① ㈱ 等）只让「两个子集都没覆盖」的那些进 CJK 文件，
    # 否则拉丁区里已有的字形会被重复打包，白增体积。
    covered = _covered(LATIN_RANGES) | _covered(CJK_RANGES)
    cjk_extras = [c for c in EXTRA_CODEPOINTS if c not in covered]
    jobs = [
        ("ak-sans-latin", _expand(LATIN_RANGES), _range_css(LATIN_RANGES, [])),
        ("ak-sans-cjk", _expand(CJK_RANGES), _range_css(CJK_RANGES, cjk_extras)),
    ]

    css_blocks = []
    manifest = {"family": FAMILY, "source": APK_FONT, "files": {}}
    for i, (name, unicodes, urange) in enumerate(jobs, 1):
        out = os.path.join(OUT_DIR, name + ".woff2")
        # 缓存：产物比源字体新就直接复用，省掉 70s 的 brotli q11
        if os.path.exists(out) and os.path.getmtime(out) > src_mtime:
            size = os.path.getsize(out)
            n = -1  # 复用时不重算字形数，下面从 cmap 试算
            from fontTools.ttLib import TTFont
            f = TTFont(src, lazy=True)
            n = len(set(unicodes) & set(f.getBestCmap().keys()))
            f.close()
            print("[2/3] %-14s %7.1f KB  字形 %5d  (缓存命中，跳过压缩)" % (name, size / 1024, n))
        else:
            size, n = build_subset(src, unicodes, out)
            print("[2/3] %-14s %7.1f KB  字形 %5d  (%.1fs)" % (name, size / 1024, n, time.time() - t0))
        manifest["files"][name] = {"bytes": size, "glyphs": n, "unicodeRange": urange}
        css_blocks.append(
            "@font-face {\n"
            "  font-family: '%s';\n"
            "  font-style: normal;\n"
            "  font-weight: 100 900;\n"
            "  font-display: swap;\n"
            "  src: url('%s.woff2') format('woff2');\n"
            "  unicode-range: %s;\n"
            "}" % (FAMILY, name, urange)
        )

    header = (
        "/* 自动生成 —— 请勿手改。\n"
        " * 源: %s 里的 %s（明日方舟原版 UI 字体：思源黑体 CN Medium）\n"
        " * 生成: scripts/build_fonts.py\n"
        " * 拆分: unicode-range 把拉丁与 CJK 分开，浏览器按需下载。\n"
        " */\n\n" % (os.path.basename(APK), APK_FONT)
    )
    css_path = os.path.join(OUT_DIR, "ak-fonts.css")
    with open(css_path, "w", encoding="utf-8") as f:
        f.write(header + "\n\n".join(css_blocks) + "\n")

    with open(os.path.join(OUT_DIR, "_font_manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print("[3/3] -> static/fonts/ak-fonts.css  (+2 woff2, 总 %.2f MB)"
          % (sum(v["bytes"] for v in manifest["files"].values()) / 1048576))
    print("耗时 %.1fs" % (time.time() - t0))


if __name__ == "__main__":
    main()
