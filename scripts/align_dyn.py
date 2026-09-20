"""对齐分析：skin_table 的 skinId 与已解包的 DynPortrait 目录能否一一对应。

只读，不改任何文件；结果写到 _dyn_align.txt。
"""
import json
import os
import re

ROOT = r'C:\Users\MMCGA\Desktop\Quest-log'
DYN = os.path.join(ROOT, 'assets-source', 'dyn_illust', 'DynPortrait')
DYN2 = os.path.join(ROOT, 'assets-source', 'dyn_illust', 'DynIllust')
ST = os.path.join(ROOT, 'assets-source', 'gamedata', 'excel', 'skin_table.json')
OUT = os.path.join(ROOT, '_dyn_align.txt')

log = []


def dirs_of(p):
    try:
        return sorted(d for d in os.listdir(p) if os.path.isdir(os.path.join(p, d)))
    except FileNotFoundError:
        return []


with open(ST, encoding='utf-8') as f:
    skin_table = json.load(f)['charSkins']

# skinId -> 目录名候选
by_key = {}
for sid in skin_table:
    key = 'dyn_portrait_' + sid.replace('@', '_')
    by_key[key] = sid

log.append('skin_table 皮肤数 = %d' % len(skin_table))

for label, d in (('DynPortrait', DYN), ('DynIllust', DYN2)):
    names = dirs_of(d)
    hit = [n for n in names if n in by_key]
    miss = [n for n in names if n not in by_key]
    log.append('')
    log.append('=== %s: %d 个目录，映射命中 %d' % (label, len(names), len(hit)))
    if miss:
        log.append('-- 未命中(%d) --' % len(miss))
        log.extend(miss)

# 有多少皮肤「有」动态立绘
skin_with_dyn = []
for sid in skin_table:
    key = 'dyn_portrait_' + sid.replace('@', '_')
    if key in by_key and os.path.isdir(os.path.join(DYN, key)):
        skin_with_dyn.append(sid)
log.append('')
log.append('有动态立绘的皮肤数 = %d' % len(skin_with_dyn))
log.append('样例: ' + ', '.join(skin_with_dyn[:8]))

with open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(log))
print('written', OUT)
