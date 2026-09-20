"""把解包出来的 Spine 动态立绘转成前端可用资源。

源：assets-source/dyn_illust/DynPortrait/{dyn_portrait_XXX}/  (.atlas .png .skel)
出：static/img/dyn/{slug}/{slug}.atlas|.webp|.skel  +  _index.json

要点：
  * 目录名里的 `#` 在 URL 中会被当成 fragment，必须换掉（沿用 build_char_assets 的 safe_slug 规则）。
  * atlas 文本第一行/每个 page 段引用的 png 文件名要同步改成 .webp，否则运行时会去取不存在的 png。
  * 映射关系：skinId `char_003_kalts@boc#6` -> 目录 `dyn_portrait_char_003_kalts_boc#6`
    （即 'dyn_portrait_' + skinId.replace('@', '_')）。

用法： python build_dyn_assets.py [--force]
"""
import json
import os
import re
import sys
import time

from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
CATPATH = 'DynPortrait'
SRC_ROOT = os.path.join(ROOT, 'assets-source', 'dyn_illust', CATPATH)
OUT_ROOT = os.path.join(ROOT, 'static', 'img', 'dyn')
SKIN_TABLE = os.path.join(ROOT, 'assets-source', 'gamedata', 'excel', 'skin_table.json')
CHAR_TABLE = os.path.join(ROOT, 'assets-source', 'gamedata', 'excel', 'character_table.json')
# build_char_assets.py 产出的皮肤索引：skinId -> {file,name,group,charId,portraitId,rarity}
SKIN_INDEX = os.path.join(ROOT, 'static', 'img', 'skin', '_index.json')
# 给前端一次性消费的展示清单（卡片要的字段全在这里，省掉一次请求与拼装）
POOL_OUT = os.path.join(OUT_ROOT, '_pool.json')

ROOT_PREFIX = 'dyn_portrait_'


def safe_slug(s):
    """skinId / 目录名 -> 安全文件名（与 build_char_assets.safe_slug 保持一致）。"""
    return s.replace('@', '__').replace('#', '-')


def main():
    force = '--force' in sys.argv
    os.makedirs(OUT_ROOT, exist_ok=True)

    # skinId -> 目录名
    skin_ids = {}
    if os.path.exists(SKIN_TABLE):
        with open(SKIN_TABLE, encoding='utf-8') as f:
            for sid in json.load(f).get('charSkins', {}):
                skin_ids[ROOT_PREFIX + sid.replace('@', '_')] = sid

    # charId -> 干员中文名（前端卡片要显示「谁 · 哪件皮肤」）
    char_names = {}
    if os.path.exists(CHAR_TABLE):
        with open(CHAR_TABLE, encoding='utf-8') as f:
            for cid, v in json.load(f).items():
                char_names[cid] = (v or {}).get('name') or ''

    # skinId -> 本地皮肤索引（中文名/系列/稀有度/缩略图）
    local_skins = {}
    if os.path.exists(SKIN_INDEX):
        with open(SKIN_INDEX, encoding='utf-8') as f:
            local_skins = json.load(f)
    else:
        raise SystemExit('缺少 %s —— 先跑 build_char_assets.py' % SKIN_INDEX)

    log = []
    index = {}
    pool = []
    ok = skip = miss = 0
    t0 = time.time()

    for name in sorted(os.listdir(SRC_ROOT)):
        d = os.path.join(SRC_ROOT, name)
        if not os.path.isdir(d):
            continue
        slug = safe_slug(name)
        out_dir = os.path.join(OUT_ROOT, slug)
        atlas_src = os.path.join(d, name + '.atlas')
        skel_src = os.path.join(d, name + '.skel')
        if not (os.path.exists(atlas_src) and os.path.exists(skel_src)):
            miss += 1
            log.append('MISS %s' % name)
            continue

        os.makedirs(out_dir, exist_ok=True)
        atlas_dst = os.path.join(out_dir, slug + '.atlas')
        skel_dst = os.path.join(out_dir, slug + '.skel')

        # --- skel 直接拷贝 ---
        if force or not os.path.exists(skel_dst):
            with open(skel_src, 'rb') as f:
                data = f.read()
            with open(skel_dst, 'wb') as f:
                f.write(data)

        # --- 所有 .png 转 .webp ---
        # 图集可能被拆成多页（page_a / page_b / _1 / _2），先列全再统一命名，
        # 保证「写出的文件名」与「atlas 里改写的名字」一一对应。
        pages = sorted(fn for fn in os.listdir(d) if fn.lower().endswith('.png'))
        rename_pairs = []
        for i, fn in enumerate(pages):
            new_name = (slug + '.webp') if len(pages) == 1 else (slug + '_p%d.webp' % i)
            rename_pairs.append((fn, new_name))
            out_png = os.path.join(out_dir, new_name)
            if force or not os.path.exists(out_png):
                try:
                    im = Image.open(os.path.join(d, fn)).convert('RGBA')
                    im.save(out_png, 'WEBP', quality=92, method=5)
                except Exception as e:
                    log.append('ERR webp %s: %s' % (fn, e))

        # --- atlas 文本改写：引用的 png 名 -> 实际写出的 webp 名 ---
        with open(atlas_src, encoding='utf-8', errors='replace') as f:
            txt = f.read()
        for old, new in rename_pairs:
            txt = txt.replace(old, new)
        with open(atlas_dst, 'w', encoding='utf-8', newline='') as f:
            f.write(txt)

        size_kb = sum(os.path.getsize(os.path.join(out_dir, x)) for x in os.listdir(out_dir)) / 1024.0
        sid = skin_ids.get(name)
        m = re.match(r'^char_\d+_[0-9a-zA-Z]+', name[len(ROOT_PREFIX):])
        char_id = m.group(0) if m else ''
        ls = (local_skins.get(sid) or {}) if sid else {}
        # 目录名里的形态 id 不一定在 character_table 里（阿米娅的 sale 皮肤就是），
        # 那就退一步用皮肤索引记录的「归属干员」去查名字。
        op = char_names.get(char_id) or char_names.get(ls.get('charId') or '') or ''
        entry = {
            'dir': 'img/dyn/' + slug + '/',
            'prefix': slug,
            'charId': char_id,
            'op': op,
            'pid': len(pages),
            'sizeKB': round(size_kb),
        }
        if sid:
            entry['skinId'] = sid
            index[sid] = entry
            if ls:
                pool.append({
                    'skin_id': sid,
                    'skin_name': ls.get('name') or '',
                    'operator_name': entry['op'],
                    'series': ls.get('group') or '',
                    'rarity': ls.get('rarity') or 0,
                    'image': ls.get('file') or '',
                    'charId': ls.get('charId') or char_id,
                    'dir': entry['dir'],
                    'prefix': slug,
                    'sizeKB': entry['sizeKB'],
                })
            else:
                log.append('NO_LOCAL_SKIN %s' % sid)
        else:
            log.append('NO_SKIN_ID %s' % name)
        ok += 1

    with open(os.path.join(OUT_ROOT, '_index.json'), 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, sort_keys=True, indent=0)

    # 展示清单：按「干员名 + 皮肤名」排序，前端直接铺卡片
    pool.sort(key=lambda x: (x['operator_name'], x['skin_name']))
    with open(POOL_OUT, 'w', encoding='utf-8') as f:
        json.dump(pool, f, ensure_ascii=False, indent=0)

    total_mb = sum(os.path.getsize(os.path.join(dp, x))
                   for dp, _, fs in os.walk(OUT_ROOT) for x in fs) / 1048576.0
    log.insert(0, 'ok=%d miss=%d 输出 %.1fMB 耗时 %.1fs' % (ok, miss, total_mb, time.time() - t0))
    log.insert(1, '索引条目 %d / 展示清单 %d' % (len(index), len(pool)))
    with open(os.path.join(ROOT, '_build_dyn.log'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(log))


if __name__ == '__main__':
    main()
