#!/usr/bin/env python3
"""Baka Signet-ikonen (koncept 1) till en skarp kvadratisk PNG.
Ritas i supersample och nedskalas för mjuka kanter. Guld/gräddvit på
en burgundy radial-gradient – matchar splashen/varumärket."""
import math
from PIL import Image, ImageDraw, ImageFont

OUT = "signet-1024.png"
N = 1024
SS = 2                      # supersampling
S = N * SS

GOLD = (214, 178, 94)
GOLD_FAINT = (214, 178, 94)
CREAM = (243, 237, 224)

# ── radial-gradient bakgrund ────────────────────────────────────────────
def lerp(a, b, t): return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))
C0, C1, C2 = (0x3a, 0x1c, 0x2a), (0x2a, 0x14, 0x20), (0x16, 0x0b, 0x12)
GN = 320
g = Image.new("RGB", (GN, GN))
gp = g.load()
cx, cy = 0.5 * GN, 0.38 * GN
maxr = math.hypot(max(cx, GN - cx), max(cy, GN - cy))
for y in range(GN):
    for x in range(GN):
        t = min(1.0, math.hypot(x - cx, y - cy) / maxr)
        col = lerp(C0, C1, t / 0.58) if t < 0.58 else lerp(C1, C2, (t - 0.58) / 0.42)
        gp[x, y] = col
img = g.resize((S, S), Image.BILINEAR).convert("RGB")
d = ImageDraw.Draw(img)

# ── koordinat-transform: svg viewBox 240, konst 820px centrerad i 1024 ──
scale = 820 / 240 * SS
ox = oy = (N - 820) / 2 * SS
def X(v): return ox + v * scale
def Y(v): return oy + v * scale
def L(v): return v * scale        # längd

def rrect(x, y, w, h, r, **kw):
    d.rounded_rectangle([X(x), Y(y), X(x + w), Y(y + h)], radius=L(r), **kw)

# yttre ram
rrect(26, 26, 188, 188, 30, outline=GOLD, width=round(L(5)))
# svag inre ram (50% opacitet → blanda mot medelbakgrund)
faint = lerp((0x2a, 0x14, 0x20), GOLD, 0.5)
rrect(40, 40, 160, 160, 20, outline=faint, width=max(1, round(L(1.5))))

# skyline-bas
for bx, by, bw, bh in [(66,168,14,20),(84,158,16,30),(104,150,12,38),
                       (124,158,16,30),(144,164,14,24),(162,170,12,18)]:
    d.rectangle([X(bx), Y(by), X(bx + bw), Y(by + bh)], fill=GOLD)

# ── "TL" serif – ritas på egen yta, beskärs till bläck-boxen och skalas
#    till exakt versalhöjd så den sitter rent ovanför skylinen ───────────
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
scratch = Image.new("RGBA", (S, S // 2), (0, 0, 0, 0))
sd = ImageDraw.Draw(scratch)
sd.text((round(L(20)), round(L(20))), "TL",
        font=ImageFont.truetype(FONT, round(L(140))), fill=CREAM)
glyph = scratch.crop(scratch.getbbox())
gh = round(L(82))                          # versalhöjd i svg-enheter → px
gw = round(glyph.width * gh / glyph.height)
glyph = glyph.resize((gw, gh), Image.LANCZOS)
px = round(X(120) - gw / 2)
py = round(Y(58))                          # versalernas ovankant (baslinje ~140)
img.paste(glyph, (px, py), glyph)

img.resize((N, N), Image.LANCZOS).save(OUT)
print("wrote", OUT)
