/* ============================================================
   Ljud – helt syntetiserat via Web Audio, inga ljudfiler/beroenden.
   Två bussar under en master: SFX och reaktiv ambient-musik.
   Allt no-op om ljud är avstängt eller Web Audio saknas.
   På/av + volym sparas i localStorage.
   ============================================================ */

const KEY = "fastighetsimperium:sound";
const VOL_KEY = "fastighetsimperium:volume";

let enabled = (() => {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
})();

let masterVol = (() => {
  try {
    const v = parseFloat(localStorage.getItem(VOL_KEY) ?? "0.7");
    return isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.7;
  } catch {
    return 0.7;
  }
})();

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    // Master → mjuk kompressor → utgång (håller nere klippning vid många ljud).
    master = ctx.createGain();
    master.gain.value = masterVol;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    master.connect(comp);
    comp.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.9;
    sfxBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.0; // tonas upp när musiken startar
    musicBus.connect(master);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

// ── Byggstenar ───────────────────────────────────────────────────────────────

/** En ton med attack/decay-envelope, ansluten till SFX-bussen. */
function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.07, bus: GainNode | null = sfxBus) {
  const c = audio();
  if (!c || !bus) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(g);
  g.connect(bus);
  const t0 = c.currentTime + start;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

/** Kort brusknäpp (perkussivt) – bygg, katastrof m.m. */
function noise(start: number, dur: number, gain = 0.05, lp = 1800) {
  const c = audio();
  if (!c || !sfxBus) return;
  const frames = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filt = c.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.value = lp;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(filt);
  filt.connect(g);
  g.connect(sfxBus);
  src.start(c.currentTime + start);
}

// ── Inställningar ────────────────────────────────────────────────────────────

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
  if (v) {
    playClick();
    if (musicOn) fadeMusic(true);
  } else {
    fadeMusic(false);
  }
}

export function getVolume(): number {
  return masterVol;
}

export function setVolume(v: number): void {
  masterVol = Math.max(0, Math.min(1, v));
  try {
    localStorage.setItem(VOL_KEY, String(masterVol));
  } catch {
    /* ignoreras */
  }
  const c = audio();
  if (c && master) master.gain.setTargetAtTime(masterVol, c.currentTime, 0.05);
}

// ── SFX-palett ───────────────────────────────────────────────────────────────

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
  tone(520, 0, 0.05, "square", 0.03);
}

/** Liten fanfar vid lyckad affär. */
export function playSuccess(): void {
  if (!enabled) return;
  tone(523, 0, 0.1, "sine", 0.06);
  tone(659, 0.08, 0.1, "sine", 0.06);
  tone(784, 0.16, 0.2, "sine", 0.06);
}

/** Köp – varm bekräftande dubbelton. */
export function playBuy(): void {
  if (!enabled) return;
  tone(392, 0, 0.12, "triangle", 0.06);
  tone(587, 0.07, 0.18, "triangle", 0.06);
}

/** Byggstart – hammarslag (brus) + låg ton. */
export function playBuild(): void {
  if (!enabled) return;
  noise(0, 0.09, 0.06, 1400);
  noise(0.14, 0.09, 0.05, 1400);
  tone(140, 0, 0.22, "sine", 0.05);
}

/** Signerat hyresavtal – mjuk uppåtgående ters. */
export function playLease(): void {
  if (!enabled) return;
  tone(494, 0, 0.1, "sine", 0.05);
  tone(622, 0.08, 0.16, "sine", 0.05);
}

/** Nivåhöjning – triumffanfar. */
export function playLevelUp(): void {
  if (!enabled) return;
  [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.1, 0.24, "triangle", 0.06));
}

/** Milstolpe – klar liten bjällra. */
export function playMilestone(): void {
  if (!enabled) return;
  tone(1318, 0, 0.5, "sine", 0.05);
  tone(1046, 0.05, 0.4, "sine", 0.035);
}

/** IPO-klocka – börsklockan ringer. */
export function playBell(): void {
  if (!enabled) return;
  for (let i = 0; i < 4; i++) tone(880, i * 0.18, 0.3, "sine", 0.05);
  tone(1760, 0, 0.6, "sine", 0.02);
}

/** Budkrig – spänt tvåtonslarm. */
export function playAlert(): void {
  if (!enabled) return;
  tone(740, 0, 0.14, "square", 0.045);
  tone(740, 0.2, 0.14, "square", 0.045);
}

/** Katastrof/skada – dov smäll. */
export function playImpact(): void {
  if (!enabled) return;
  noise(0, 0.35, 0.08, 700);
  tone(90, 0, 0.4, "sine", 0.06);
}

/** Nekad åtgärd – kort låg dubbelknäpp. */
export function playDenied(): void {
  if (!enabled) return;
  tone(180, 0, 0.08, "square", 0.04);
  tone(150, 0.09, 0.1, "square", 0.04);
}

/** Månadstick – nästan omärkbar mjuk puls. */
export function playTick(): void {
  if (!enabled) return;
  tone(440, 0, 0.04, "sine", 0.018);
}

// ── Reaktiv ambient-musik ─────────────────────────────────────────────────────
// En långsam ackordbädd (pad + bas + gles arp) som böljar utan hörbar loop.
// Humöret följer konjunkturen (dur i boom, moll i bust) och tempot klockan.

type Mood = "boom" | "stable" | "bust";

// Ackordföljder som halvtonssteg från grundtonen, per humör (moll/dur-känsla).
const PROGRESSIONS: Record<Mood, number[][]> = {
  // dur, ljust och framåtlutat
  boom: [
    [0, 4, 7, 11], // Imaj7
    [9, 12, 16, 19], // vi
    [5, 9, 12, 16], // IV
    [7, 11, 14, 17], // V
  ],
  // neutral, öppet (sus/kvarter)
  stable: [
    [0, 7, 12, 16],
    [-3, 4, 9, 12],
    [2, 9, 14, 17],
    [-5, 7, 12, 15],
  ],
  // moll, dovt och eftertänksamt
  bust: [
    [0, 3, 7, 10], // i7
    [-4, 3, 8, 12], // VI
    [-1, 3, 7, 10],
    [-5, 2, 7, 10], // v
  ],
};

const ROOT = 130.81; // C3
const semi = (n: number) => ROOT * Math.pow(2, n / 12);

let musicOn = false;
let mood: Mood = "stable";
let tempo = 1;
let chordIx = 0;
let scheduler: ReturnType<typeof setTimeout> | null = null;

function fadeMusic(up: boolean) {
  const c = audio();
  if (!c || !musicBus) return;
  musicBus.gain.cancelScheduledValues(c.currentTime);
  musicBus.gain.setTargetAtTime(up && enabled ? 0.5 : 0.0, c.currentTime, 1.2);
}

/** Schemalägger ETT ackord (pad + bas + ev. arp) och pekar mot nästa. */
function scheduleChord() {
  const c = audio();
  if (!c || !musicBus || !musicOn) return;
  const prog = PROGRESSIONS[mood];
  const chord = prog[chordIx % prog.length];
  chordIx++;
  const chordDur = (mood === "boom" ? 5 : mood === "bust" ? 8 : 6.5) / Math.max(1, tempo * 0.6 + 0.4);
  const t0 = c.currentTime + 0.05;
  const bright = mood === "boom" ? 1600 : mood === "bust" ? 620 : 1000;

  // Pad: varje ackordton som en mjuk, lätt detunad röst genom lågpass.
  for (const n of chord) {
    for (const det of [-3, 3]) {
      const osc = c.createOscillator();
      const g = c.createGain();
      const filt = c.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.value = bright;
      osc.type = "sine";
      osc.frequency.value = semi(n) * Math.pow(2, det / 1200);
      osc.connect(filt);
      filt.connect(g);
      g.connect(musicBus);
      const peak = 0.045 / chord.length;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + chordDur * 0.35);
      g.gain.linearRampToValueAtTime(peak * 0.8, t0 + chordDur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + chordDur + 0.4);
      osc.start(t0);
      osc.stop(t0 + chordDur + 0.5);
    }
  }
  // Bas: grundtonen en oktav ned.
  {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "triangle";
    osc.frequency.value = semi(chord[0] - 12);
    osc.connect(g);
    g.connect(musicBus);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.05, t0 + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + chordDur + 0.3);
    osc.start(t0);
    osc.stop(t0 + chordDur + 0.4);
  }
  // Gles arp: ett par mjuka bjällror på ackordtoner (mer i boom).
  const arps = mood === "boom" ? 3 : mood === "bust" ? 1 : 2;
  for (let i = 0; i < arps; i++) {
    if (Math.random() > 0.7) continue;
    const n = chord[Math.floor(Math.random() * chord.length)] + 12;
    const at = chordDur * (0.2 + Math.random() * 0.6);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "sine";
    osc.frequency.value = semi(n);
    osc.connect(g);
    g.connect(musicBus);
    g.gain.setValueAtTime(0.0001, t0 + at);
    g.gain.linearRampToValueAtTime(0.03, t0 + at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.9);
    osc.start(t0 + at);
    osc.stop(t0 + at + 1.0);
  }

  scheduler = setTimeout(scheduleChord, chordDur * 1000);
}

/** Startar ambient-musiken (kräver en användargest först – AudioContext). */
export function startMusic(): void {
  if (musicOn) {
    if (enabled) fadeMusic(true);
    return;
  }
  const c = audio();
  if (!c) return;
  musicOn = true;
  fadeMusic(true);
  scheduleChord();
}

export function stopMusic(): void {
  musicOn = false;
  if (scheduler) clearTimeout(scheduler);
  scheduler = null;
  fadeMusic(false);
}

/** Sätter musikhumör efter konjunkturfas (boom/stable/bust). */
export function setMusicMood(phase: Mood): void {
  mood = phase;
}

/** Tempo följer klockan (1×/2×/4×) – snabbare progression vid högre fart. */
export function setMusicTempo(t: number): void {
  tempo = Math.max(0.5, Math.min(4, t));
}
