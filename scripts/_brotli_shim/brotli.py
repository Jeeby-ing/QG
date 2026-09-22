# -*- coding: utf-8 -*-
"""`brotli` 的最小替身 —— 把压缩/解压转发给 Node.js 内置的 brotli。

本机没有可用的 Python brotli（无网络装不上），但 Node 22 自带 brotli 绑定。
fontTools 写 WOFF2 时强依赖 brotli，于是这里做一个同名模块放到 sys.path 前面，
fontTools `import brotli` 时就会拿到本模块。**只用于构建，不随前端发布。**

fontTools 实际只用到这些入口：
    brotli.compress(data, mode=brotli.MODE_FONT)
    brotli.compress(data, mode=brotli.MODE_TEXT)
    brotli.decompress(data)
"""
import os
import subprocess
import sys

MODE_GENERIC = 0
MODE_TEXT = 1
MODE_FONT = 2

# 与 /binary_context 中登记的托管 Node 保持一致
_NODE_CANDIDATES = [
    r"C:\Users\MMCGA\.workbuddy\binaries\node\versions\22.22.2-3\node.exe",
    r"C:\Program Files\nodejs\node.exe",
    "node",
]


def _find_node():
    for c in _NODE_CANDIDATES:
        if c == "node" or os.path.exists(c):
            return c
    raise RuntimeError("找不到 node，可执行文件：%s" % _NODE_CANDIDATES)


_COMPRESS_JS = r"""
const z = require('zlib');
const mode = parseInt(process.argv[1], 10);
const quality = parseInt(process.argv[2], 10);
const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  const buf = Buffer.concat(chunks);
  const params = {};
  params[z.constants.BROTLI_PARAM_MODE] = mode;
  params[z.constants.BROTLI_PARAM_QUALITY] = quality;
  params[z.constants.BROTLI_PARAM_SIZE_HINT] = buf.length;
  const out = z.brotliCompressSync(buf, { params });
  process.stdout.write(out);
});
"""

_DECOMPRESS_JS = r"""
const z = require('zlib');
const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  process.stdout.write(z.brotliDecompressSync(Buffer.concat(chunks)));
});
"""


def _pipe(js, args, data):
    node = _find_node()
    p = subprocess.run([node, "-e", js] + [str(a) for a in args],
                       input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if p.returncode != 0:
        raise RuntimeError("node brotli 失败(%d): %s" % (p.returncode, p.stderr.decode("utf-8", "replace")))
    return p.stdout


def compress(data, mode=MODE_GENERIC, quality=11, lgwin=22, **kwargs):
    """mode: MODE_GENERIC / MODE_TEXT / MODE_FONT。quality=11 是最小体积。"""
    if isinstance(data, str):
        data = data.encode("utf-8")
    return _pipe(_COMPRESS_JS, [mode, quality], data)


def decompress(data):
    return _pipe(_DECOMPRESS_JS, [], data)


class error(Exception):  # noqa: N801 - 与 brotli 官方模块同名
    pass


if __name__ == "__main__":
    sample = b"arknights quest-log font pipeline " * 200
    packed = compress(sample, mode=MODE_FONT)
    back = decompress(packed)
    print("shim self-test:", len(sample), "->", len(packed), "->", len(back),
          "OK" if back == sample else "FAIL")
    sys.exit(0 if back == sample else 1)
