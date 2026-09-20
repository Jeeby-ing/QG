# -*- coding: utf-8 -*-
"""把从 APK 解出来的原生 UI 素材，挑一批转成前端可用的 webp。

输入：extract_ui_ab.py + ArkUnpacker 的产物（默认 C:\\Users\\MMCGA\\.workbuddy\\tmp\\ui_out）
输出：static/img/ui/*.webp + static/img/ui/_manifest.json

选取原则（L2 第一刀只碰"演出层"，不动日常组件结构，风险最低）：
  · FX      —— 原版的光/粒子/扫光/擦除贴图，替掉现在 CSS 手搓的渐变光柱
  · PRTS    —— 原版故障/泄漏光素材，给「授权过场」用
  · PARTS   —— 原版按钮图形/标签底板/职业图集/属性图标

变体规则：同一贴图 ArkUnpacker 可能吐出 `x.png` 与 `x$0.png` 两份
（bundle 内同名贴图），**取 alpha 覆盖率更高的那份**，不要盲目取不带 $0 的。
"""
import json
import os
import re

from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))   # 本脚本就在项目根，不要再上跳一层
SRC = r"C:\Users\MMCGA\.workbuddy\tmp\ui_out"
DST = os.path.join(ROOT, "static", "img", "ui")

# (源目录, 源文件名不带扩展, 输出名, 分组)
WANT = [
    # ---- FX：光 / 粒子 / 扫光 ----
    ("arts/ui", "img_uifx_basicglow_01", "glow_basic", "fx"),
    ("arts/ui", "img_uifx_basicglow_02", "glow_soft", "fx"),
    ("arts/ui", "img_uifx_lightpoint_01", "lightpoint_1", "fx"),
    ("arts/ui", "img_uifx_lightpoint_02", "lightpoint_2", "fx"),
    ("arts/ui", "img_uifx_lightpoint_03", "lightpoint_3", "fx"),
    ("arts/ui", "img_uifx_star_1", "star_1", "fx"),
    ("arts/ui", "img_uifx_star_2", "star_2", "fx"),
    ("arts/ui", "img_uifx_star_3", "star_3", "fx"),
    ("arts/ui", "img_uifx_star_4", "star_4", "fx"),
    ("arts/ui", "img_fx_rainbow_ray_01", "ray_rainbow_1", "fx"),
    ("arts/ui", "img_fx_rainbow_ray_02", "ray_rainbow_2", "fx"),
    ("arts/ui", "img_fx_rainbow_ray_03", "ray_rainbow_3", "fx"),
    ("arts/ui", "img_fx_ray_soft_01", "ray_soft_1", "fx"),
    ("arts/ui", "img_fx_ray_soft_02", "ray_soft_2", "fx"),
    ("arts/ui", "img_fx_light_sheet_soft", "light_sheet", "fx"),
    ("arts/ui", "img_uifx_sweep_01", "sweep_1", "fx"),
    ("arts/ui", "img_uifx_sweep_02", "sweep_2", "fx"),
    ("arts/ui", "img_uifx_sweep_03", "sweep_3", "fx"),
    ("arts/ui", "img_uifx_sweep_04", "sweep_4", "fx"),
    ("arts/ui", "img_uifx_wipe_tech_01", "wipe_tech_1", "fx"),
    ("arts/ui", "img_uifx_wipe_tech_02", "wipe_tech_2", "fx"),
    ("arts/ui", "img_uifx_wipe_circle_01", "wipe_circle", "fx"),
    ("arts/ui", "uifx_particle_flower_1", "particle_flower", "fx"),
    ("arts/ui", "uifx_particle_point_1", "particle_point_1", "fx"),
    ("arts/ui", "uifx_particle_point_2", "particle_point_2", "fx"),
    ("arts/ui", "img_uifx_smoke_01", "smoke_1", "fx"),
    ("arts/ui", "img_fx_particle_dust_01", "dust_1", "fx"),
    ("arts/ui", "img_fx_particle_gold_01", "dust_gold", "fx"),
    ("arts/ui", "img_fx_glow_triangle", "glow_triangle", "fx"),
    ("arts/ui", "img_uifx_flow_03", "flow_3", "fx"),
    ("arts/ui", "img_uifx_disturb_01", "disturb", "fx"),
    ("arts/ui", "img_card_cover_noise", "card_noise", "fx"),
    # ---- PRTS：故障 / 泄漏光 ----
    ("ui", "prts_error_logo_disturb", "prts_error_logo", "prts"),
    ("ui", "sprite_battle_meta_prts_error_bg", "prts_error_bg", "prts"),
    ("ui", "sprite_battle_meta_prts_error_btn", "prts_error_btn", "prts"),
    ("ui", "sprite_battle_meta_prts_error_btn2", "prts_error_btn2", "prts"),
    ("ui", "sprite_takeover_glitch", "glitch", "prts"),
    ("ui", "sprite_auto_battle_label_glitch", "glitch_label", "prts"),
    ("ui", "meta_auto_battle_leaklight_shape", "leaklight", "prts"),
    ("ui", "meta_auto_battle_leakedge", "leakedge", "prts"),
    # ---- PARTS：按钮图形 / 标签底板 / 职业 / 属性 ----
    ("arts/ui", "btn_close", "btn_close", "parts"),
    ("arts/ui", "btn_back", "btn_back", "parts"),
    ("arts/ui", "btn_shadow", "btn_shadow", "parts"),
    ("arts/ui", "image_char_tag_bkg", "char_tag_bkg", "parts"),
    ("arts/ui", "image_char_tag_bkg_2", "char_tag_bkg_2", "parts"),
    ("arts/ui", "sprite_profession", "profession_atlas", "parts"),
    ("arts/ui", "icon_atk", "icon_atk", "parts"),
    ("arts/ui", "icon_def", "icon_def", "parts"),
    ("arts/ui", "icon_hp", "icon_hp", "parts"),
    ("arts/ui", "icon_cost", "icon_cost", "parts"),
    ("arts/ui", "icon_res", "icon_res", "parts"),
    ("arts/ui", "icon_time", "icon_time", "parts"),
    ("arts/ui", "icon_block", "icon_block", "parts"),
    ("arts/ui", "icon_attack_speed", "icon_attack_speed", "parts"),
]


def alpha_ratio(im):
    """alpha 覆盖率；没有 alpha 通道就当 1。"""
    if im.mode not in ("RGBA", "LA"):
        im = im.convert("RGBA")
    a = im.getchannel("A")
    hist = a.histogram()
    total = sum(hist)
    if not total:
        return 0.0
    opaque = sum(hist[16:])          # alpha < 16 视为全透明
    return opaque / total


def pick(sub, base):
    """在 sub 目录里找 base.png / base$0.png / ...，返回 alpha 覆盖最高的那个。"""
    d = os.path.join(SRC, sub)
    if not os.path.isdir(d):
        return None
    pat = re.compile(r"^" + re.escape(base) + r"(\$\d+)?\.png$")
    cands = [f for f in os.listdir(d) if pat.match(f)]
    if not cands:
        return None
    best, best_r = None, -1.0
    for f in cands:
        try:
            with Image.open(os.path.join(d, f)) as im:
                r = alpha_ratio(im)
        except Exception:
            r = -1.0
        if r > best_r:
            best, best_r = f, r
    return os.path.join(d, best), best_r


def main():
    os.makedirs(DST, exist_ok=True)
    manifest = []
    missing = []
    total = 0
    for sub, base, out, group in WANT:
        got = pick(sub, base)
        if not got:
            missing.append("%s/%s" % (sub, base))
            continue
        path, cov = got
        with Image.open(path) as im:
            im = im.convert("RGBA")
            w, h = im.size
            op = os.path.join(DST, out + ".webp")
            # UI 元素要保留干净的边缘：alpha 不掉质量，颜色走高质量有损
            im.save(op, "WEBP", quality=92, alpha_quality=100, exact=True, method=6)
        sz = os.path.getsize(op)
        total += sz
        manifest.append({
            "name": out, "group": group, "file": out + ".webp",
            "w": w, "h": h, "kb": round(sz / 1024, 1),
            "src": os.path.relpath(path, SRC).replace("\\", "/"),
        })
    manifest.sort(key=lambda m: (m["group"], m["name"]))
    with open(os.path.join(DST, "_manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    lines = ["converted %d files, %.2f MB" % (len(manifest), total / 1048576)]
    for m in manifest:
        lines.append("  %-9s %-20s %4dx%-4d %6.1f KB" % (m["group"], m["file"], m["w"], m["h"], m["kb"]))
    if missing:
        lines.append("MISSING %d:" % len(missing))
        lines += ["  " + m for m in missing]
    with open(os.path.join(os.path.expanduser("~"), ".workbuddy", "tmp", "_ui_build.txt"),
              "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(lines[0])
    if missing:
        print("missing:", len(missing))


if __name__ == "__main__":
    main()
