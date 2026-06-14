/* ============================================================
   Ljud – syntetiserat via WebAudio, inga ljudfiler/beroenden.
   Av/på sparas i localStorage. Allt no-op om ljud är avstängt
   eller WebAudio saknas.
   ============================================================ */

const KEY = "fastighetsimperium:sound";

let enabled = (() => {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
})();

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.07) {
  const c = audio();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(g);
  g.connect(c.destination);
  const t0 = c.currentTime + start;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

export function isSoundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(v: boolean): void {
  enabled = v;
  try {
    localStorage.setItem(KEY, v ? "on" : "off");
  } catch {
    /* ignoreras */
  }
  if (v) playClick();
}

/** Kassaklirr – två stigande toner. */
export function playIncome(): void {
  if (!enabled) return;
  tone(660, 0, 0.12, "sine", 0.06);
  tone(880, 0.09, 0.16, "sine", 0.06);
}

/** Varning – lågt fallande surr. */
export function playWarn(): void {
  if (!enabled) return;
  tone(300, 0, 0.16, "sawtooth", 0.05);
  tone(210, 0.12, 0.22, "sawtooth", 0.05);
}

/** Kort klick vid knapptryck. */
export function playClick(): void {
  if (!enabled) return;
  tone(520, 0, 0.05, "square", 0.035);
}

/** Liten fanfar vid lyckad affär. */
export function playSuccess(): void {
  if (!enabled) return;
  tone(523, 0, 0.1, "sine", 0.06);
  tone(659, 0.08, 0.1, "sine", 0.06);
  tone(784, 0.16, 0.2, "sine", 0.06);
}
