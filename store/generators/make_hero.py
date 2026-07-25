#!/usr/bin/env python3
"""Bygg Steam library-hero (3840×1240) från stadspanoramat + logga-overlay."""
from PIL import Image, ImageDraw, ImageEnhance

W, H = 3840, 1240
city = Image.open("ig-city-wide.png").convert("RGB")

# 1) beskär bort de mörka banden (dold toolbar/statusrad) → ren stad
cw, ch = city.size
city = city.crop((0, 50, cw, ch - 56))  # ~2560×722

# 2) fyll heroramen: skala till höjd, center-beskär bredd
scale = H / city.height
nw = round(city.width * scale)
city = city.resize((nw, H), Image.LANCZOS)
left = (nw - W) // 2
hero = city.crop((left, 0, left + W, H))

# 3) svalka/mörka lätt för stämning så loggan poppar
hero = ImageEnhance.Brightness(hero).enhance(0.86)
hero = ImageEnhance.Color(hero).enhance(1.06)

hero_clean = hero.copy()
hero_clean.save("/home/user/Game/store/steam/library-hero-3840x1240.png")

# 4) burgundy-scrim till vänster för läsbarhet + vinjett
scrim = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sp = scrim.load()
for x in range(W):
    # stark till vänster, klingar ut vid ~58% bredd
    t = max(0.0, 1.0 - x / (W * 0.58))
    a = int(232 * (t ** 1.15))
    if a <= 0:
        continue
    for y in range(H):
        sp[x, y] = (0x1e, 0x0e, 0x18, a)
hero_rgba = hero.convert("RGBA")
hero_rgba.alpha_composite(scrim)

# lätt vinjett upptill/nedtill
vig = Image.new("RGBA", (W, H), (0, 0, 0, 0))
vd = ImageDraw.Draw(vig)
vd.rectangle([0, 0, W, 90], fill=(0x12, 0x08, 0x10, 150))
vd.rectangle([0, H - 90, W, H], fill=(0x12, 0x08, 0x10, 170))
hero_rgba.alpha_composite(vig)

# 5) logga-overlay (den transparenta library-loggan) till vänster
logo = Image.open("/home/user/Game/store/steam/library-logo-1280x720.png").convert("RGBA")
lw = int(W * 0.40)
lh = round(logo.height * lw / logo.width)
logo = logo.resize((lw, lh), Image.LANCZOS)
lx = int(W * 0.055)
ly = (H - lh) // 2
hero_rgba.alpha_composite(logo, (lx, ly))

hero_rgba.convert("RGB").save("/home/user/Game/store/steam/hero-with-logo-3840x1240.png")
print("wrote library-hero + hero-with-logo (3840x1240)")
