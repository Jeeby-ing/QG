"""构建干员立绘 / 信物图标 / 皮肤立绘的前端图片资源。

源素材位于 assets-source/（体积很大，skin/ 约 2.9GB），不能直接给浏览器用，
这里统一转码成 webp 缩略图输出到 static/img/ 下。

产物：
  static/img/char/{charId}.webp      干员立绘（寻访卡片用，180x360 原尺寸转 webp）
  static/img/token/{charId}.webp     干员信物图标（信物 +N 徽章用）
  static/img/skin/{slug}.webp        皮肤立绘（时装商店卡片用，1024^2 缩到 512^2）
  static/img/char/_index.json        charId -> 立绘/信物图标文件名映射
  static/img/skin/_index.json        skinId -> {file, name, charId, portraitId}

用法： python build_char_assets.py [--force]
"""
import json
import os
import re
import sys
import time

from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'assets-source')
OUT = os.path.join(ROOT, 'static', 'img')
DIR_CHAR = os.path.join(OUT, 'char')
DIR_TOKEN = os.path.join(OUT, 'token')
DIR_SKIN = os.path.join(OUT, 'skin')

PORTRAIT = os.path.join(SRC, 'portrait')
SKINDIR = os.path.join(SRC, 'skin')
ITEMDIR = os.path.join(SRC, 'item')

CATALOG = os.path.join(ROOT, 'static', 'warehouse_catalog.json')
SKIN_TABLE = os.path.join(SRC, 'gamedata', 'excel', 'skin_table.json')
CHAR_TABLE = os.path.join(SRC, 'gamedata', 'excel', 'character_table.json')


def safe_slug(s: str) -> str:
    """把 skinId（含 @ 和 #）转成安全文件名。"""
    return s.replace('@', '__').replace('#', '-')


def load_token_char_ids():
    """从仓库信物目录取出全部干员 charId（mat_p_char_XXXX_YYYY -> char_XXXX_YYYY）。"""
    with open(CATALOG, encoding='utf-8') as f:
        items = json.load(f)['items']
    ids = []
    for it in items:
        if it.get('cat') != '信物':
            continue
        m = re.match(r'^mat_p_(char_[0-9a-zA-Z]+_[0-9a-zA-Z]+)$', it.get('key', ''))
        if m:
            ids.append((m.group(1), it.get('r', 3)))
    return ids


def pick_portrait(char_id):
    """挑选干员立绘：优先精一 _1，其次 _2 / _1+，再退化为任意同名前缀。"""
    for suffix in ('_1', '_2', '_1+', '_0'):
        fp = os.path.join(PORTRAIT, '%s%s.png' % (char_id, suffix))
        if os.path.exists(fp):
            return fp
    try:
        for f in sorted(os.listdir(PORTRAIT)):
            if f.startswith(char_id + '_') and f.endswith('.png'):
                return os.path.join(PORTRAIT, f)
    except FileNotFoundError:
        pass
    return None


def conv_portrait(src, dst):
    im = Image.open(src).convert('RGBA')
    im.save(dst, 'WEBP', quality=86, method=4)


def conv_token(src, dst, size=(96, 96)):
    im = Image.open(src).convert('RGBA')
    im.thumbnail(size, Image.LANCZOS)
    canvas = Image.new('RGBA', size, (0, 0, 0, 0))
    canvas.paste(im, ((size[0] - im.width) // 2, (size[1] - im.height) // 2), im)
    canvas.save(dst, 'WEBP', quality=90, method=4)


def conv_skin(src, dst, size=(512, 512)):
    """皮肤立绘是 1024x1024 的方形全身图，卡片里只需要上半身：
    取上方 62% 区域再缩放到目标尺寸，避免人物被压得太小。"""
    im = Image.open(src).convert('RGBA')
    w, h = im.size
    crop_h = int(h * 0.62)
    tl, br = (0, 0), (w, crop_h)
    if crop_h < w:  # 细长图：按宽度居中裁
        crop_h = min(h, int(w / (size[0] / size[1])))
        tl, br = (0, 0), (w, crop_h)
    im = im.crop(tl + br)
    im.thumbnail(size, Image.LANCZOS)
    canvas = Image.new('RGBA', size, (0, 0, 0, 0))
    canvas.paste(im, ((size[0] - im.width) // 2, size[1] - im.height), im)
    canvas.save(dst, 'WEBP', quality=82, method=4)


def main():
    force = '--force' in sys.argv
    for d in (DIR_CHAR, DIR_TOKEN, DIR_SKIN):
        os.makedirs(d, exist_ok=True)

    t0 = time.time()
    log = []

    # ---------- 1. 干员立绘 + 信物图标 ----------
    pairs = load_token_char_ids()
    log.append('信物干员: %d' % len(pairs))
    char_index = {}
    ok_c = miss_c = ok_t = miss_t = 0
    for char_id, _r in pairs:
        # 立绘
        dst = os.path.join(DIR_CHAR, char_id + '.webp')
        if force or not os.path.exists(dst):
            src = pick_portrait(char_id)
            if src:
                try:
                    conv_portrait(src, dst)
                except Exception as e:
                    log.append('ERR portrait %s: %s' % (char_id, e))
        if os.path.exists(dst):
            ok_c += 1
            char_index[char_id] = {'portrait': 'img/char/%s.webp' % char_id}
        else:
            miss_c += 1

        # 信物图标
        dst_t = os.path.join(DIR_TOKEN, char_id + '.webp')
        src_t = os.path.join(ITEMDIR, 'p_%s.png' % char_id)
        if force or not os.path.exists(dst_t):
            if os.path.exists(src_t):
                try:
                    conv_token(src_t, dst_t)
                except Exception as e:
                    log.append('ERR token %s: %s' % (char_id, e))
        if os.path.exists(dst_t):
            ok_t += 1
            char_index.setdefault(char_id, {})['token'] = 'img/token/%s.webp' % char_id
        else:
            miss_t += 1

    log.append('立绘 ok=%d miss=%d / 信物图标 ok=%d miss=%d' % (ok_c, miss_c, ok_t, miss_t))

    # ---------- 2. 皮肤立绘 ----------
    skin_index = {}
    ok_s = miss_s = 0
    if os.path.exists(SKIN_TABLE):
        with open(SKIN_TABLE, encoding='utf-8') as f:
            st = json.load(f)
        char_skins = st.get('charSkins', {})
        # 稀有度表（用于定价分档）
        rar = {}
        if os.path.exists(CHAR_TABLE):
            with open(CHAR_TABLE, encoding='utf-8') as f:
                ct = json.load(f)
            for k, v in ct.items():
                rar[k] = v.get('rarity')  # 官方 0~5

        for _sid, v in char_skins.items():
            ds = v.get('displaySkin') or {}
            name = ds.get('skinName')
            gid = ds.get('skinGroupId') or ''
            # 只要正式售卖皮肤（有名字、非默认、非内置进化）
            if not name or gid == 'ILLUST_0' or str(gid).startswith('ILLUST_'):
                continue
            char_id = v.get('charId')
            if not char_id or char_id not in char_index:
                continue
            portrait_id = v.get('portraitId') or v.get('avatarId')
            if not portrait_id:
                continue
            src = os.path.join(SKINDIR, '%sb.png' % portrait_id)
            if not os.path.exists(src):
                miss_s += 1
                continue
            slug = safe_slug(v.get('skinId') or portrait_id)
            dst = os.path.join(DIR_SKIN, slug + '.webp')
            if force or not os.path.exists(dst):
                try:
                    conv_skin(src, dst)
                except Exception as e:
                    log.append('ERR skin %s: %s' % (slug, e))
                    continue
            if os.path.exists(dst):
                ok_s += 1
                skin_index[v.get('skinId') or portrait_id] = {
                    'file': 'img/skin/%s.webp' % slug,
                    'name': name,
                    'group': ds.get('skinGroupName') or '',
                    'charId': char_id,
                    'portraitId': portrait_id,
                    'rarity': (rar.get(char_id) or 0) + 1,
                }
    else:
        log.append('NO skin_table.json')

    log.append('皮肤 ok=%d miss=%d' % (ok_s, miss_s))

    with open(os.path.join(DIR_CHAR, '_index.json'), 'w', encoding='utf-8') as f:
        json.dump(char_index, f, ensure_ascii=False)
    with open(os.path.join(DIR_SKIN, '_index.json'), 'w', encoding='utf-8') as f:
        json.dump(skin_index, f, ensure_ascii=False)

    log.append('done in %.1fs' % (time.time() - t0))
    with open(os.path.join(ROOT, '_build_assets.log'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(log))


if __name__ == '__main__':
    main()
