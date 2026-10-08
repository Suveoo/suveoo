#!/bin/bash
# Suveoo for macOS — favicon-1024 → build/icon.icns（iconutil，纯系统工具链，幂等）
# 第一百五十七轮：先经 pad-icon.swift 合成系统规范留白（内容 824/1024 网格居中）——
# 全幅图直接做图标会在 Dock/Applications 里比其他应用大一圈（队长实测 Bug1）。
# 用法：bash scripts/make-icns.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/../../frontend/favicon/favicon-1024x1024.png"
PADDED="$ROOT/build/icon-1024-padded.png"
ICONSET="$ROOT/build/icon.iconset"
OUT="$ROOT/build/icon.icns"

[ -f "$SRC" ] || { echo "missing source: $SRC"; exit 1; }
mkdir -p "$ICONSET" "$ROOT/build"

CONTENT_SIZE="${SUVEOO_ICON_CONTENT:-824}"
# 本机 swift 解释模式（JIT）不可用——编译一次缓存为二进制后执行
PAD_BIN="$ROOT/build/.pad-icon-bin"
[ -x "$PAD_BIN" ] || swiftc -O "$ROOT/scripts/pad-icon.swift" -o "$PAD_BIN" >/dev/null
"$PAD_BIN" "$SRC" "$PADDED" "$CONTENT_SIZE" >/dev/null

resize() { # <目标像素> <输出文件>
  cp "$PADDED" "$2"
  sips -z "$1" "$1" "$2" >/dev/null
}

resize 16   "$ICONSET/icon_16x16.png"
resize 32   "$ICONSET/icon_16x16@2x.png"
resize 32   "$ICONSET/icon_32x32.png"
resize 64   "$ICONSET/icon_32x32@2x.png"
resize 128  "$ICONSET/icon_128x128.png"
resize 256  "$ICONSET/icon_128x128@2x.png"
resize 256  "$ICONSET/icon_256x256.png"
resize 512  "$ICONSET/icon_256x256@2x.png"
resize 512  "$ICONSET/icon_512x512.png"
resize 1024 "$ICONSET/icon_512x512@2x.png"

iconutil -c icns -o "$OUT" "$ICONSET"
rm -rf "$ICONSET"
echo "ok → $OUT ($(stat -f%z "$OUT") bytes)"
