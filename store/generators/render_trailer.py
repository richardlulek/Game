#!/usr/bin/env python3
"""Renderar trailern (60 s, 1920×1080@30) som motion-graphics över riktiga
in-game-bilder: Ken Burns-rörelser, beat-snappade klipp (88 BPM från 11.0 s),
text-kort enligt trailer-manuset, logga + CTA. Muxas med trailer-audio.wav
(spelets egen musik). Skriver the-landlord-trailer-60s.mp4."""
import subprocess
import math
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFont
import imageio_ffmpeg

W, H = 1920, 1080
FPS = 30
DUR = 60.0

ROOT = "/home/user/Game/store/steam"
SERIF = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
SANS = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
CREAM = (243, 237, 224)
GOLD = (214, 178, 94)
MUTED = (185, 168, 148)

# ── Källor ──────────────────────────────────────────────────────────────
SRC = {
    "pano": Image.open(f"{ROOT}/library-hero-3840x1240.png").convert("RGB"),
    "p01": Image.open(f"{ROOT}/screenshots/01-city-map.png").convert("RGB"),
    "p02": Image.open(f"{ROOT}/screenshots/02-portfolio.png").convert("RGB"),
    "p03": Image.open(f"{ROOT}/screenshots/03-finance.png").convert("RGB"),
    "p04": Image.open(f"{ROOT}/screenshots/04-company-journey.png").convert("RGB"),
    "p05": Image.open(f"{ROOT}/screenshots/05-districts.png").convert("RGB"),
}
LOGO = Image.open(f"{ROOT}/library-logo-1280x720.png").convert("RGBA")

def ease(u):  # smoothstep
    u = max(0.0, min(1.0, u))
    return u * u * (3 - 2 * u)

# ── Klipplista: (t0, t1, src, rect0, rect1)  rect = (cx, cy, w) ─────────
B = 0.680  # beatlängd 88.2 BPM; grid från 11.0
def beat(k): return 11.0 + k * B

SHOTS = [
    (0.00,  4.00, "pano", (1340, 700, 640),  (1340, 700, 520)),
    (4.00,  4.77, "p02",  (270, 330, 520),   (270, 330, 495)),
    (4.77,  5.54, "p02",  (270, 590, 520),   (270, 590, 495)),
    (5.54,  6.30, "p02",  (600, 580, 520),   (600, 580, 495)),
    (6.30, 11.00, "p01",  (960, 540, 1920),  (1050, 560, 1700)),
    (11.00, beat(13), "pano", (2700, 800, 900), (1920, 620, 2204)),   # HERO-utzoomning
    (beat(13), beat(18), "p03", (390, 360, 760), (390, 410, 700)),
    (beat(18), beat(23), "p03", (760, 420, 720), (760, 450, 660)),
    (beat(23), beat(28), "p02", (960, 540, 1920), (960, 540, 1760)),
    (beat(28), beat(33), "p05", (520, 560, 1000), (520, 600, 940)),
    (beat(33), beat(38), "p05", (840, 520, 640), (840, 560, 600)),
    (beat(38), beat(43), "p04", (515, 585, 900), (515, 600, 840)),
    (beat(43), beat(50), "p04", (515, 800, 900), (515, 810, 840)),
    (beat(50), beat(57), "pano", (1920, 620, 2204), (1880, 610, 1980)),
    (beat(57), beat(66), "LOGO", None, None),
    (beat(66), DUR, "CTA", None, None),
]
XFADES = [(11.00, 0.5), (beat(57), 0.5), (beat(66), 0.4)]

# ── Text-kort ───────────────────────────────────────────────────────────
def statement(text, size=68):
    """Prerendera ett text-kort (centrerad serif med skugga) som RGBA-remsa."""
    img = Image.new("RGBA", (W, 220), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(SERIF, size)
    tw = d.textlength(text, font=f)
    x, y = (W - tw) / 2, 60
    for dx, dy in [(3, 3), (2, 2)]:
        d.text((x + dx, y + dy), text, font=f, fill=(0, 0, 0, 150))
    d.text((x, y), text, font=f, fill=(*CREAM, 255))
    return img

TEXTS = [
    (1.0, 3.8, 0.35, statement("It starts with one building.")),
    (4.02, 4.77, 0.10, statement("Buy it.", 76)),
    (4.79, 5.54, 0.10, statement("Fix it.", 76)),
    (5.56, 6.30, 0.10, statement("Rent it.", 76)),
    (6.7, 8.7, 0.30, statement("Then do it again.")),
    (8.9, 10.7, 0.30, statement("And again.")),
    (beat(13) + 0.3, beat(18) - 0.3, 0.35, statement("A real economy.")),
    (beat(18) + 0.3, beat(23) - 0.3, 0.35, statement("Rates. Risk. Yield.")),
    (beat(28) + 0.3, beat(33) - 0.3, 0.35, statement("Rivals want the same blocks.", 62)),
    (beat(33) + 0.4, beat(38) - 0.2, 0.35, statement("Outbid them. Or take them over.", 62)),
    (beat(38) + 0.4, beat(43) - 0.2, 0.35, statement("Hire managers. Build the company.", 58)),
    (beat(43) + 0.4, beat(48), 0.35, statement("From one flat…")),
    (beat(50) + 0.3, beat(56), 0.35, statement("…to a listed empire.")),
]

# Scrim bakom text (nedre tredjedelen)
scrim = Image.new("RGBA", (W, 340), (0, 0, 0, 0))
sp = scrim.load()
for y in range(340):
    a = int(130 * (y / 340) ** 1.2)
    for x in (0,):
        pass
    ImageDraw.Draw(scrim).line([(0, y), (W, y)], fill=(6, 4, 8, a))
SCRIM_Y = H - 340

# Vinjett (förberäknad)
yy, xx = np.mgrid[0:H, 0:W]
r = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
va = np.clip((r - 0.62) / 0.38, 0, 1) ** 1.5 * 88
VIG = Image.fromarray(
    np.dstack([np.zeros((H, W, 3), np.uint8), va.astype(np.uint8)]), "RGBA"
)

# ── Slutkort ────────────────────────────────────────────────────────────
def radial_bg():
    gn = 160
    g = Image.new("RGB", (gn, gn))
    gp = g.load()
    C0, C1, C2 = (0x3a, 0x1c, 0x2a), (0x2a, 0x14, 0x20), (0x16, 0x0b, 0x12)
    def lerp(a, b, t):
        t = max(0.0, min(1.0, t))
        return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))
    cx, cy = 0.5 * gn, 0.42 * gn
    mr = math.hypot(gn, gn) / 1.35
    for y in range(gn):
        for x in range(gn):
            t = math.hypot(x - cx, y - cy) / mr
            gp[x, y] = lerp(C0, C1, t / 0.55) if t < 0.55 else lerp(C1, C2, (t - 0.55) / 0.45)
    return g.resize((W, H), Image.BILINEAR)

BG = radial_bg()

def spaced_text(d, text, font, cx, y, fill, tracking):
    widths = [d.textlength(c, font=font) for c in text]
    total = sum(widths) + tracking * (len(text) - 1)
    x = cx - total / 2
    for c, wc in zip(text, widths):
        d.text((x, y), c, font=font, fill=fill)
        x += wc + tracking

CTA_TXT = Image.new("RGBA", (W, H), (0, 0, 0, 0))
_d = ImageDraw.Draw(CTA_TXT)
_f1 = ImageFont.truetype(SERIF, 62)
_t1 = "Build an empire block by block"
_w1 = _d.textlength(_t1, font=_f1)
_d.text(((W - _w1) / 2 + 3, 433), _t1, font=_f1, fill=(0, 0, 0, 140))
_d.text(((W - _w1) / 2, 430), _t1, font=_f1, fill=(*CREAM, 255))
spaced_text(_d, "WISHLIST ON STEAM  ·  EARLY ACCESS", ImageFont.truetype(SANS, 30), W / 2, 570, (*GOLD, 255), 10)
spaced_text(_d, "© 2026 The Landlord Interactive", ImageFont.truetype(SANS, 22), W / 2, 660, (*MUTED, 220), 2)

def shot_frame(shot, t):
    t0, t1, src, r0, r1 = shot
    u = ease((t - t0) / (t1 - t0)) if t1 > t0 else 0.0
    if src == "LOGO":
        img = BG.copy()
        s = 1.28 + 0.06 * ease((t - t0) / (t1 - t0))
        lw = int(1280 * s)
        lg = LOGO.resize((lw, int(720 * s)), Image.LANCZOS)
        a = ease((t - t0) / 0.5)
        if a < 1.0:
            al = lg.getchannel("A").point(lambda v: int(v * a))
            lg.putalpha(al)
        img.paste(lg, ((W - lg.width) // 2, (H - lg.height) // 2 - 20), lg)
        return img
    if src == "CTA":
        img = BG.copy()
        a = ease((t - t0) / 0.4)
        card = CTA_TXT if a >= 1.0 else Image.eval(CTA_TXT, lambda v: v)  # kopieras nedan
        if a < 1.0:
            card = CTA_TXT.copy()
            card.putalpha(card.getchannel("A").point(lambda v: int(v * a)))
        img.paste(card, (0, 0), card)
        return img
    im = SRC[src]
    cx = r0[0] + (r1[0] - r0[0]) * u
    cy = r0[1] + (r1[1] - r0[1]) * u
    w = r0[2] + (r1[2] - r0[2]) * u
    h = w * 9 / 16
    x0 = max(0, min(im.width - w, cx - w / 2))
    y0 = max(0, min(im.height - h, cy - h / 2))
    fr = im.crop((int(x0), int(y0), int(x0 + w), int(y0 + h))).resize((W, H), Image.LANCZOS)
    if src == "pano":
        fr = ImageEnhance.Brightness(fr).enhance(1.06)
    fr = ImageEnhance.Color(fr).enhance(1.08)
    fr = ImageEnhance.Contrast(fr).enhance(1.03)
    fr.paste(VIG, (0, 0), VIG)
    return fr

def frame_at(t):
    # aktivt klipp + ev. crossfade
    cur = next(s for s in SHOTS if s[0] <= t < s[1] or s is SHOTS[-1] and t >= s[0])
    img = shot_frame(cur, t)
    for (bt, wdt) in XFADES:
        if abs(t - bt) < wdt / 2:
            prev = next(s for s in SHOTS if s[1] == bt)
            nxt = next(s for s in SHOTS if s[0] == bt)
            a = ease((t - (bt - wdt / 2)) / wdt)
            img = Image.blend(shot_frame(prev, min(t, prev[1] - 1e-3)), shot_frame(nxt, max(t, nxt[0])), a)
            break
    img = img.convert("RGB")
    # text-kort
    for (t0, t1, fade, card) in TEXTS:
        if t0 - fade <= t <= t1 + fade:
            a = ease((t - (t0 - fade)) / fade) * ease(((t1 + fade) - t) / fade)
            a = max(0.0, min(1.0, a))
            if a > 0.01:
                sc = scrim.copy()
                sc.putalpha(sc.getchannel("A").point(lambda v: int(v * a)))
                img.paste(sc, (0, SCRIM_Y), sc)
                cd = card.copy()
                cd.putalpha(cd.getchannel("A").point(lambda v: int(v * a)))
                img.paste(cd, (0, H - 300), cd)
    # in/ut-fade mot svart
    g = 1.0
    if t < 0.6:
        g = ease(t / 0.6)
    if t > 59.3:
        g = min(g, ease((60.0 - t) / 0.7))
    if g < 1.0:
        img = Image.eval(img, lambda v: int(v * g))
    return img

# ── Rendera → ffmpeg ────────────────────────────────────────────────────
FF = imageio_ffmpeg.get_ffmpeg_exe()
OUT = "the-landlord-trailer-60s.mp4"
cmd = [
    FF, "-y", "-hide_banner", "-loglevel", "error",
    "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
    "-i", "trailer-audio.wav",
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", OUT,
]
proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
NF = int(DUR * FPS)
for i in range(NF):
    t = i / FPS
    proc.stdin.write(frame_at(t).tobytes())
    if i % 300 == 0:
        print(f"frame {i}/{NF} (t={t:.1f}s)", flush=True)
proc.stdin.close()
proc.wait()
print("done:", OUT, "rc=", proc.returncode)
