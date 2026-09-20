# -*- coding: utf-8 -*-
"""从游戏 APK 里挑出 UI 相关的 .ab 包，保持相对目录结构解到本地。

用法：python extract_ui_ab.py [目标目录]
默认目标 C:\\Users\\MMCGA\\.workbuddy\\tmp\\ui_ab

只取"做界面用得上"的几组（通用组件 / 抽卡 / 页面框架 / 通用特效），
不整包拉 178MB —— 先小样本打通管线，后面要更多再改 SELECT。
"""
import os
import sys
import zipfile

APK = r"C:\Users\MMCGA\Desktop\Quest-log\assets-source\arknights-hg-2771.apk"
DST = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\MMCGA\.workbuddy\tmp\ui_ab"

# 按前缀选包（相对 APK 根的路径前缀）
SELECT = [
    "assets/AB/Android/ui/[pack]metaui.ab",
    "assets/AB/Android/arts/ui/[uc]common.ab",
    "assets/AB/Android/ui/gacha/",
    "assets/AB/Android/ui/pages/",
    "assets/AB/Android/ui/handbook/",
    "assets/AB/Android/arts/ui/[uc]fxcommon.ab",
]


def main():
    z = zipfile.ZipFile(APK)
    names = [n for n in z.namelist() if not n.endswith("/")]
    picked = []
    for n in names:
        for s in SELECT:
            if n == s or n.startswith(s):
                picked.append(n)
                break
    picked.sort()
    total = 0
    written = 0
    for n in picked:
        info = z.getinfo(n)
        rel = n[len("assets/AB/Android/"):]
        out = os.path.join(DST, rel)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with z.open(n) as src, open(out, "wb") as dst:
            dst.write(src.read())
        written += 1
        total += info.file_size
    report = [
        "APK = %s" % APK,
        "DST = %s" % DST,
        "picked = %d files, %.1f MB" % (written, total / 1048576),
    ]
    for n in picked:
        report.append("  %s  %.0f KB" % (n, z.getinfo(n).file_size / 1024))
    with open(os.path.join(os.path.expanduser("~"), ".workbuddy", "tmp", "_ui_ab.txt"),
              "w", encoding="utf-8") as f:
        f.write("\n".join(report))
    print("\n".join(report[:3]))


if __name__ == "__main__":
    main()
