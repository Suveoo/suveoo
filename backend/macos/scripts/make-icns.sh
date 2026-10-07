#!/bin/bash
# Suveoo for macOS — favicon-1024 → build/icon.icns（iconutil，纯系统工具链，幂等）
# 用法：bash scripts/make-icns.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/../../frontend/favicon/favicon-1024x1024.png"
ICONSET="$ROOT/build/icon.iconset"
OUT="$ROOT/build/icon.icns"

[ -f "$SRC" ] || { echo "missing source: $SRC"; exit 1; }
mkdir -p "$ICONSET" "$ROOT/build"

resize() { # <目标像素> <输出文件>
  cp "$SRC" "$2"
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
