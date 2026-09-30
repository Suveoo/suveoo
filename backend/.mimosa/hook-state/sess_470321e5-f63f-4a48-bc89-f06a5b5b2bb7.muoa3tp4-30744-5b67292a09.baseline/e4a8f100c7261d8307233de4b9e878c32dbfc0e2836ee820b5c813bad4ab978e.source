# subset-cjk.py — 把 Noto Sans SC 可变字体实例化并子集化为 PDF 报告专用字体
# 产物：noto-sans-sc-report.ttf（静态 Regular 实例 + 常用 3500 字 + ASCII + 标点，约 1-2MB）
# 用法：python subset-cjk.py <src.ttf> <out.ttf>
import sys
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

src, out = sys.argv[1], sys.argv[2]

# 1) 可变字体 → 静态 wght=400 实例（pdf-lib/fontkit 对 variable TTF 子集化会丢字形）
vf = TTFont(src)
if "fvar" in vf:
    instantiateVariableFont(vf, {"wght": 400}, inplace=True)

# 2) 子集化：ASCII + 常用汉字（GB2312 一级二级全部覆盖报告文案与用户数据）
chars = set(chr(c) for c in range(0x20, 0x7F))
chars |= set("·—…“”‘’、。，；：？！（）【】《》¥％＋－×÷")
# GB2312 全部汉字（一二级 6763 字，涵盖日常交易对手/备注）
for hi in range(0xB0, 0xF8):
    for lo in range(0xA1, 0xFF):
        try:
            chars.add(bytes([hi, lo]).decode("gb2312"))
        except UnicodeDecodeError:
            pass
unicodes = sorted(ord(c) for c in chars)

opt = subset.Options()
opt.flavor = None
opt.layout_features = ["*"]
opt.name_IDs = ["*"]
opt.notdef_outline = True
opt.recalc_bounds = True
opt.drop_tables += ["FFTM"]
sub = subset.Subsetter(options=opt)
sub.populate(unicodes=unicodes)
sub.subset(vf)
vf.save(out)
print("saved", out, "glyphs:", vf["maxp"].numGlyphs)
