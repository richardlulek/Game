#!/usr/bin/env python3
"""Kontursätt wordmarken till SVG-paths så loggan ser identisk ut på alla
maskiner (inget font-beroende). Matchar exakt det renderade utseendet: den
generiska serifen här är DejaVu Serif Bold (= det Georgia-fallback som
skärmbilderna redan visade), descriptor i DejaVu Sans."""
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

SERIF = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
SANS = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def wordpath(font_path, text, fontsize, x_center, baseline, letterspacing=0.0):
    font = TTFont(font_path)
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    upm = font["head"].unitsPerEm
    scale = fontsize / upm

    names = [cmap[ord(c)] for c in text]
    advs = [hmtx[n][0] * scale for n in names]
    total = sum(advs) + letterspacing * (len(text) - 1)

    spen = SVGPathPen(gs)
    penx = x_center - total / 2
    for name, adv in zip(names, advs):
        tp = TransformPen(spen, (scale, 0, 0, -scale, penx, baseline))
        gs[name].draw(tp)
        penx += adv + letterspacing
    return spen.getCommands()


# samma koordinatrum som Wordmark-SVG:n (viewBox 0 0 620 160)
title = wordpath(SERIF, "THE LANDLORD", 58, 310, 72, letterspacing=1.0)
descriptor = wordpath(SANS, "PROPERTY TYCOON", 15, 310, 132, letterspacing=7.0)

with open("wordmark-paths.txt", "w") as f:
    f.write("TITLE:\n" + title + "\n\nDESCRIPTOR:\n" + descriptor + "\n")
print("title path chars:", len(title))
print("descriptor path chars:", len(descriptor))
