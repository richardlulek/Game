#!/usr/bin/env python3
"""Trailerns ljudspår, byggt av spelets egna musik (Pixabay-licens, ok i video):
  0–12 s   Coffee Shop Jazz (spelets lugna läge) – cold open
  8.8–11   brus-riser
  11 s     Big City Big Dreams (spelets boom-läge) droppar på stadsavtäckningen,
           källa förskjuten så en stark downbeat träffar 11.0 och spårets egen
           breakdown (källa ~65 s) landar under loggan (~49.8 s).
  55–59.5  ut-fade under CTA.
"""
import wave
import numpy as np

SR = 44100
DUR = 60.0
N = int(DUR * SR)


def load(path):
    w = wave.open(path)
    assert w.getframerate() == SR
    x = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").reshape(-1, 2).astype(np.float64) / 32768
    return x


jazz = load("jazz.wav")
city = load("city.wav")

mix = np.zeros((N, 2))

# ── Jazz 0–12.2 s ───────────────────────────────────────────────────────
j_end = 12.2
seg = jazz[: int(j_end * SR)].copy()
env = np.full(len(seg), 0.80)
a = int(0.8 * SR)
env[:a] = np.linspace(0, 0.80, a)
f0, f1 = int(10.6 * SR), int(j_end * SR)
env[f0:f1] = np.linspace(0.80, 0.0, f1 - f0)
mix[: len(seg)] += seg * env[:, None]

# ── Riser 8.8–11.0 s ────────────────────────────────────────────────────
r0, r1 = int(8.8 * SR), int(11.0 * SR)
L = r1 - r0
rng = np.random.default_rng(7)
noise = rng.uniform(-1, 1, L)
# ljusna gradvis: blanda lågpassat (glidande medel) → rått brus
k = 24
lp = np.convolve(noise, np.ones(k) / k, mode="same")
bright = np.linspace(0, 1, L) ** 2
ris = (lp * (1 - bright) + noise * bright) * (np.linspace(0, 1, L) ** 2) * 0.5
mix[r0:r1] += np.stack([ris, ris], axis=1)

# ── Big City Big Dreams från 11.0 s (källa +15.34 s) ────────────────────
OFF = 15.34          # video_t + OFF = källtid; downbeat 26.34 → video 11.0
c0 = 11.0
src0 = int((c0 + OFF) * SR)
L = N - int(c0 * SR)
seg = city[src0 : src0 + L].copy()
env = np.full(len(seg), 0.95)
a = int(0.03 * SR)
env[:a] = np.linspace(0, 0.95, a)
# fade under CTA: 55 → 59.5 (i videotid)
f0 = int((55.0 - c0) * SR)
f1 = int((59.5 - c0) * SR)
env[f0:f1] = np.linspace(0.95, 0.0, f1 - f0)
env[f1:] = 0.0
mix[int(c0 * SR) : int(c0 * SR) + len(seg)] += seg * env[:, None]

# ── Master: global slutfade + mjuk limiter ──────────────────────────────
g0 = int(59.0 * SR)
mix[g0:] *= np.linspace(1, 0, N - g0)[:, None]
mix = np.tanh(mix * 1.15)
mix /= np.max(np.abs(mix)) + 1e-9
mix *= 0.95

with wave.open("trailer-audio.wav", "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
print("wrote trailer-audio.wav 60.0 s")
