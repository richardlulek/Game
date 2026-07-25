#!/usr/bin/env python3
"""Steam-capsule-bilder för "The Landlord" med den nya loggan (Signet + wordmark).
Allt ritas i supersample och skalas ned för skarpa kanter. Samma DejaVu Serif
Bold / DejaVu Sans som den kontursatta loggan → konsekvent varumärke."""
import math, os, random
from PIL import Image, ImageDraw, ImageFont

OUTDIR = "/home/user/Game/store/steam"
os.makedirs(OUTDIR, exist_ok=True)
SS = 2

GOLD = (214, 178, 94)
CREAM = (243, 237, 224)
MUTED = (185, 168, 148)
BURG_HI = (0x3a, 0x1c, 0x2a)
BURG = (0x2a, 0x14, 0x20)
BURG_LO = (0x16, 0x0b, 0x12)
PLATE = (0x1e, 0x10, 0x1a)
SERIF = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
SANS = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

base_draw = None  # sätts per capsule


def lerp(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def radial_bg(w, h, cx=0.5, cy=0.40):
    gn = 160
    g = Image.new("RGB", (gn, gn))
    gp = g.load()
    px, py = cx * gn, cy * gn
    maxr = math.hypot(max(px, gn - px), max(py, gn - py))
    for y in range(gn):
        for x in range(gn):
            t = math.hypot(x - px, y - py) / maxr
            col = lerp(BURG_HI, BURG, t / 0.55) if t < 0.55 else lerp(BURG, BURG_LO, (t - 0.55) / 0.45)
            gp[x, y] = col
    return g.resize((w, h), Image.BILINEAR).convert("RGB")


def _aspect(text, font_path):
    layer = Image.new("RGBA", (5000, 1400), (0, 0, 0, 0))
    ImageDraw.Draw(layer).text((60, 60), text, font=ImageFont.truetype(font_path, 320), fill=(255, 255, 255, 255))
    b = layer.getbbox()
    return (b[2] - b[0]) / (b[3] - b[1])


def caps_h(base, text, font_path, cap_h, cx, top, color):
    """Rita versaler med exakt versalhöjd, centrerat i cx. Returnerar bredd."""
    layer = Image.new("RGBA", (base.width + 400, base.height + 400), (0, 0, 0, 0))
    ImageDraw.Draw(layer).text((60, 60), text, font=ImageFont.truetype(font_path, cap_h * 2), fill=color)
    g = layer.crop(layer.getbbox())
    w = max(1, round(g.width * cap_h / g.height))
    g = g.resize((w, cap_h), Image.LANCZOS)
    base.paste(g, (round(cx - w / 2), round(top)), g)
    return w


def caps_w(base, text, font_path, target_w, cx, top, color):
    """Rita versaler skalade så bredden == target_w."""
    cap_h = max(1, round(target_w / _aspect(text, font_path)))
    caps_h(base, text, font_path, cap_h, cx, top, color)
    return cap_h


def spaced_fit(base, text, font_path, target_w, cx, top, color, spacing_ratio=0.45):
    """Spärrad text som fyller target_w (storlek + spärr härleds)."""
    ref = 100
    font = ImageFont.truetype(font_path, ref)
    raw = sum(base_draw.textlength(c, font=font) for c in text) + spacing_ratio * ref * (len(text) - 1)
    size = max(6, int(ref * target_w / raw))
    spacing = spacing_ratio * size
    font = ImageFont.truetype(font_path, size)
    widths = [base_draw.textlength(c, font=font) for c in text]
    total = sum(widths) + spacing * (len(text) - 1)
    x = cx - total / 2
    for c, wch in zip(text, widths):
        base_draw.text((x, top), c, font=font, fill=color)
        x += wch + spacing
    return size


def skyline_rule(base, cx, y, width, bar_color):
    d = ImageDraw.Draw(base)
    d.rectangle([cx - width / 2, y, cx + width / 2, y + max(2, round(width * 0.006))], fill=bar_color)
    u = width / 480.0
    groups = [(-160, [(0, 12, 9), (14, 18, 11), (30, 8, 8)]),
              (-10, [(0, 16, 10), (14, 24, 12), (30, 14, 9)]),
              (130, [(0, 10, 9), (13, 18, 11), (28, 6, 8)])]
    for gx, bars in groups:
        for bx, bh, bw in bars:
            X = cx + (gx + bx) * u
            d.rectangle([X, y - bh * u, X + bw * u, y], fill=bar_color)


def draw_signet(base, cx, cy, size):
    d = ImageDraw.Draw(base, "RGBA")
    s = size / 240.0
    def X(v): return cx - size / 2 + v * s
    def Y(v): return cy - size / 2 + v * s
    def L(v): return v * s
    def rr(x, y, w, h, r, **k):
        d.rounded_rectangle([X(x), Y(y), X(x + w), Y(y + h)], radius=L(r), **k)
    rr(26, 26, 188, 188, 30, fill=(*PLATE, 235))
    rr(26, 26, 188, 188, 30, outline=GOLD, width=max(1, round(L(5))))
    rr(40, 40, 160, 160, 20, outline=lerp(PLATE, GOLD, 0.5), width=max(1, round(L(1.5))))
    for bx, by, bw, bh in [(66,168,14,20),(84,158,16,30),(104,150,12,38),
                           (124,158,16,30),(144,164,14,24),(162,170,12,18)]:
        d.rectangle([X(bx), Y(by), X(bx + bw), Y(by + bh)], fill=GOLD)
    caps_h(base, "TL", SERIF, round(L(82)), cx, Y(58), CREAM)


def base_skyline(base, y_top):
    d = ImageDraw.Draw(base, "RGBA")
    W = base.width
    random.seed(7)
    x = -20
    while x < W + 20:
        bw = random.randint(int(W * 0.03), int(W * 0.07))
        bh = random.randint(int((base.height - y_top) * 0.35), int((base.height - y_top) * 0.95))
        d.rectangle([x, base.height - bh, x + bw, base.height], fill=(0x12, 0x09, 0x0f, 210))
        for _ in range(random.randint(0, 3)):
            wx = random.randint(int(x + bw * 0.2), int(x + bw * 0.8))
            wy = random.randint(int(base.height - bh + 10), int(base.height - 20))
            if random.random() < 0.5:
                s = max(2, bw // 12)
                d.rectangle([wx, wy, wx + s, wy + s], fill=(*GOLD, 150))
        x += bw + random.randint(int(W * 0.005), int(W * 0.02))


def make(name, W, H, kind):
    global base_draw
    w, h = W * SS, H * SS
    if kind == "logo":
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    else:
        img = radial_bg(w, h)
    base_draw = ImageDraw.Draw(img)

    if kind == "landscape":
        base_skyline(img, int(h * 0.60))
        draw_signet(img, int(w * 0.155), h // 2, int(h * 0.56))
        tx = int(w * 0.615)
        tw = int(w * 0.62)
        ch = caps_w(img, "THE LANDLORD", SERIF, tw, tx, int(h * 0.28), CREAM)
        ry = int(h * 0.28) + ch + int(h * 0.05)
        skyline_rule(img, tx, ry, int(tw * 0.92), GOLD)
        spaced_fit(img, "PROPERTY TYCOON", SANS, int(tw * 0.62), tx, ry + int(h * 0.03), GOLD)

    elif kind == "wide":  # small capsule – kort & bred
        base_skyline(img, int(h * 0.66))
        draw_signet(img, int(w * 0.12), h // 2, int(h * 0.74))
        tx = int(w * 0.60)
        tw = int(w * 0.66)
        ch = caps_w(img, "THE LANDLORD", SERIF, tw, tx, int(h * 0.24), CREAM)
        skyline_rule(img, tx, int(h * 0.24) + ch + int(h * 0.08), int(tw * 0.9), GOLD)

    elif kind == "portrait":
        base_skyline(img, int(h * 0.70))
        draw_signet(img, w // 2, int(h * 0.28), int(w * 0.52))
        tw = int(w * 0.78)
        ch = caps_w(img, "THE LANDLORD", SERIF, tw, w // 2, int(h * 0.46), CREAM)
        ry = int(h * 0.46) + ch + int(h * 0.03)
        skyline_rule(img, w // 2, ry, int(tw * 0.92), GOLD)
        spaced_fit(img, "PROPERTY TYCOON", SANS, int(tw * 0.6), w // 2, ry + int(h * 0.02), GOLD)
        spaced_fit(img, "BUILD AN EMPIRE BLOCK BY BLOCK", SANS, int(tw * 0.96), w // 2, ry + int(h * 0.075), MUTED)

    elif kind == "logo":  # transparent library-logo
        draw_signet(img, w // 2, int(h * 0.26), int(w * 0.20))
        tw = int(w * 0.46)
        ch = caps_w(img, "THE LANDLORD", SERIF, tw, w // 2, int(h * 0.50), CREAM)
        ry = int(h * 0.50) + ch + int(h * 0.04)
        skyline_rule(img, w // 2, ry, int(tw * 0.92), GOLD)
        spaced_fit(img, "PROPERTY TYCOON", SANS, int(tw * 0.62), w // 2, ry + int(h * 0.03), GOLD)

    img.resize((W, H), Image.LANCZOS).save(os.path.join(OUTDIR, name))
    print("wrote", name, f"{W}x{H}")


make("header-capsule-460x215.png", 460, 215, "landscape")
make("main-capsule-1232x706.png", 1232, 706, "landscape")
make("small-capsule-462x174.png", 462, 174, "wide")
make("library-capsule-600x900.png", 600, 900, "portrait")
make("library-logo-1280x720.png", 1280, 720, "logo")
print("done")
