#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Suveoo for Windows — 应用图标生成
==================================
源：frontend/favicon/favicon-1024x1024.png
出：backend/windows/build/icon.ico（16/24/32/48/64/128/256 七尺寸，Pillow 原生编码）
用法：python scripts/make-ico.py（或经 release.mjs 自动调用）
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent          # backend/windows
SRC = ROOT.parent.parent / "frontend" / "favicon" / "favicon-1024x1024.png"
OUT = ROOT / "build" / "icon.ico"

def main() -> None:
    img = Image.open(SRC).convert("RGBA")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, format="ICO", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print(f"[ok] {OUT} ({OUT.stat().st_size / 1024:.1f} KB, sizes 16-256)")

if __name__ == "__main__":
    main()
