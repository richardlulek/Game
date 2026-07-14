/* ============================================================
   Ljud via Web Audio. Musiken är helt syntetiserad (reaktiv ambient);
   ett par nyckel-SFX spelas som CC0-samples (Kenney) med syntes som
   fallback tills de laddats. Två bussar under en master: SFX + musik.
   Allt no-op om ljud är avstängt eller Web Audio saknas.
   På/av + volym sparas i localStorage.
   ============================================================ */

import coinsUrl from "./samples/coins.ogg";
import chipsUrl from "./samples/chips.ogg";
import clickUrl from "./samples/click.ogg";
import buildUrl from "./samples/build.ogg";
import coffeeUrl from "./music/coffee-shop-jazz.mp3";
import bigcityUrl from "./music/big-city-big-dreams.mp3";
import deniedUrl from "./samples/denied.ogg";
import milestoneUrl from "./samples/milestone.ogg";
import discoverUrl from "./samples/discover.ogg";
import impactUrl from "./samples/impact.ogg";
import warnUrl from "./samples/warn.ogg";
import levelupUrl from "./samples/levelup.ogg";

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
let musicFilter: BiquadFilterNode | null = null;

/** Syntetiskt impulssvar för en mjuk hall (exponentiellt avklingande brus). */
function makeReverbIR(c: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.max(1, Math.floor(c.sampleRate * seconds));
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

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

    // ── Musikkedja: bus → sakta svept lågpass → torr + hall → master ──────────
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.0; // tonas upp när musiken startar
    musicFilter = ctx.createBiquadFilter();
    musicFilter.type = "lowpass";
    musicFilter.frequency.value = 1000; // basvärde; humör flyttar det
    musicFilter.Q.value = 0.5;
    musicBus.connect(musicFilter);
    // Mycket långsam LFO som andas liv i klangfärgen.
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = "sine";
    lfo.frequency.value = 0.05; // ~20 s per andetag
    lfoGain.gain.value = 320;
    lfo.connect(lfoGain);
    lfoGain.connect(musicFilter.frequency);
    lfo.start();
    // Torr väg.
    const dry = ctx.createGain();
    dry.gain.value = 0.82;
    musicFilter.connect(dry);
    dry.connect(master);
    // Hall-send: ger djup och gör att ackorden smälter in i varandra.
    const reverb = ctx.createConvolver();
    reverb.buffer = makeReverbIR(ctx, 2.8, 2.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.4;
    musicFilter.connect(reverb);
    reverb.connect(wet);
    wet.connect(master);

    loadSamples(ctx); // börja avkoda CC0-samples i bakgrunden
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

// ── CC0-samples (Kenney) med syntes som fallback ─────────────────────────────
// Laddas lazyt när AudioContext finns (efter första användargesten). Innan de
// hunnit avkodas faller varje SFX tillbaka på sin syntesvariant, så det aldrig
// blir tyst. I testmiljö (ingen AudioContext) laddas inget.

const SAMPLE_URLS: Record<string, string> = {
  coins: coinsUrl,
  chips: chipsUrl,
  click: clickUrl,
  build: buildUrl,
  denied: deniedUrl,
  milestone: milestoneUrl,
  discover: discoverUrl,
  impact: impactUrl,
  warn: warnUrl,
  levelup: levelupUrl,
};
const buffers: Record<string, AudioBuffer | undefined> = {};
let samplesRequested = false;

function loadSamples(c: AudioContext) {
  if (samplesRequested) return;
  samplesRequested = true;
  for (const [k, url] of Object.entries(SAMPLE_URLS)) {
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => c.decodeAudioData(b))
      .then((buf) => { buffers[k] = buf; })
      .catch(() => { /* faller tillbaka på syntes */ });
  }
}

/** Spelar ett laddat sample genom SFX-bussen. Returnerar false om det inte
    finns ännu (då spelar anroparen sin syntes-fallback i stället). */
function playSample(key: string, gain = 0.6): boolean {
  const c = audio();
  const buf = buffers[key];
  if (!c || !buf || !sfxBus) return false;
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(g);
  g.connect(sfxBus);
  src.start(c.currentTime);
  return true;
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

/** Kassaklirr – CC0-mynt (Kenney), annars två stigande toner. */
export function playIncome(): void {
  if (!enabled) return;
  if (playSample("coins", 0.5)) return;
  tone(660, 0, 0.12, "sine", 0.06);
  tone(880, 0.09, 0.16, "sine", 0.06);
}

/** Varning – dov CC0-felton (Kenney error5, mörkast i paketet), annars två
    mjuka klubbslag i fallande ters. */
export function playWarn(): void {
  if (!enabled) return;
  if (playSample("warn", 0.4)) return;
  const c = audio();
  if (!c || !sfxBus) return;
  for (const [f, at] of [[392, 0], [311, 0.17]] as const) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "triangle";
    const t0 = c.currentTime + at;
    osc.frequency.setValueAtTime(f, t0);
    osc.frequency.exponentialRampToValueAtTime(f * 0.94, t0 + 0.1);
    osc.connect(g);
    g.connect(sfxBus);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.045, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
    osc.start(t0);
    osc.stop(t0 + 0.3);
  }
}

/** Kort klick vid knapptryck – CC0-klick (Kenney), annars kort ton. */
export function playClick(): void {
  if (!enabled) return;
  if (playSample("click", 0.45)) return;
  tone(520, 0, 0.05, "square", 0.03);
}

/** Liten fanfar vid lyckad affär. */
export function playSuccess(): void {
  if (!enabled) return;
  tone(523, 0, 0.1, "sine", 0.06);
  tone(659, 0.08, 0.1, "sine", 0.06);
  tone(784, 0.16, 0.2, "sine", 0.06);
}

/** Köp – CC0-marker/chips (Kenney), annars varm dubbelton. */
export function playBuy(): void {
  if (!enabled) return;
  if (playSample("chips", 0.55)) return;
  tone(392, 0, 0.12, "triangle", 0.06);
  tone(587, 0.07, 0.18, "triangle", 0.06);
}

/** Byggstart – CC0-slag (Kenney) + låg ton, annars brus + låg ton. */
export function playBuild(): void {
  if (!enabled) return;
  if (playSample("build", 0.6)) {
    tone(120, 0, 0.22, "sine", 0.045); // låg botten under slaget
    return;
  }
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

/** Nivåhöjning – stigande CC0-svep (Kenney upgrade1, mjukast i paketet),
    annars varm mässingsfanfar i fyra stigande steg. */
export function playLevelUp(): void {
  if (!enabled) return;
  if (playSample("levelup", 0.55)) return;
  const steps: [number, number][] = [[523, 0], [659, 0.11], [784, 0.22], [1046, 0.34]];
  for (const [f, at] of steps) {
    tone(f, at, 0.32, "triangle", 0.055);
    tone(f / 2, at, 0.3, "sine", 0.028); // varm botten under varje ton
  }
  tone(1568, 0.36, 0.55, "sine", 0.018); // skimmer på toppen
}

/** Milstolpe – CC0-upptäcktsjingel (Kenney), annars klar bjällra. */
export function playMilestone(): void {
  if (!enabled) return;
  if (playSample("milestone", 0.45)) return;
  tone(1318, 0, 0.5, "sine", 0.05);
  tone(1046, 0.05, 0.4, "sine", 0.035);
}

/** Upptäckt – morfars minneslappar m.m. CC0-jingel (Kenney), annars bjällra. */
export function playDiscover(): void {
  if (!enabled) return;
  if (playSample("discover", 0.45)) return;
  tone(880, 0, 0.14, "sine", 0.05);
  tone(1175, 0.1, 0.25, "sine", 0.05);
}

/* ── Berättelselägets ljud ──────────────────────────────────────────── */

/** Pappersprassel när ett brev vecklas ut (filtrerat brus i två svep). */
export function playPaper(): void {
  if (!enabled) return;
  noise(0, 0.09, 0.035, 5200);
  noise(0.07, 0.13, 0.028, 3800);
  noise(0.16, 0.07, 0.02, 5600);
}

/** Rogges bil glider in: mullrande motor som saktar in och stannar. */
export function playCarArrive(): void {
  if (!enabled) return;
  // Motormuller – låg sågtand som sjunker i varv och tonas ut.
  const c = audio();
  if (!c || !sfxBus) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "sawtooth";
  osc.connect(g);
  g.connect(sfxBus);
  const t0 = c.currentTime;
  osc.frequency.setValueAtTime(88, t0);
  osc.frequency.exponentialRampToValueAtTime(46, t0 + 1.9);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(0.035, t0 + 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.1);
  osc.start(t0);
  osc.stop(t0 + 2.2);
  // Däck mot grus + dörr som stängs.
  noise(1.5, 0.25, 0.03, 900);
  noise(2.15, 0.05, 0.05, 1400);
}

/** Kapitelfanfar – tre stigande toner i mässing när ett kapitel klaras. */
export function playChapter(): void {
  if (!enabled) return;
  tone(523, 0, 0.16, "triangle", 0.055);
  tone(659, 0.14, 0.16, "triangle", 0.055);
  tone(784, 0.28, 0.34, "triangle", 0.06);
  tone(1046, 0.30, 0.3, "sine", 0.03);
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

/** Katastrof/skada – CC0-stenslag (Kenney) + bastryck, annars dov smäll. */
export function playImpact(): void {
  if (!enabled) return;
  if (playSample("impact", 0.55)) {
    tone(90, 0, 0.35, "sine", 0.05);
    return;
  }
  noise(0, 0.35, 0.08, 700);
  tone(90, 0, 0.4, "sine", 0.06);
}

/** Nekad åtgärd – kort CC0-felknäpp (Kenney), annars låg dubbelknäpp. */
export function playDenied(): void {
  if (!enabled) return;
  if (playSample("denied", 0.4)) return;
  tone(180, 0, 0.08, "square", 0.04);
  tone(150, 0.09, 0.1, "square", 0.04);
}

/** Månadstick – mjuk träklubba med litet tonhöjdsfall + gles överton. */
export function playTick(): void {
  if (!enabled) return;
  const c = audio();
  if (!c || !sfxBus) return;
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(330, t0);
  osc.frequency.exponentialRampToValueAtTime(188, t0 + 0.05);
  osc.connect(g);
  g.connect(sfxBus);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(0.05, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.13);
  osc.start(t0);
  osc.stop(t0 + 0.16);
  // Liten ljus överton ger klubban lite "trä".
  tone(1180, 0, 0.05, "sine", 0.01);
}

// ── Reaktiv bakgrundsmusik ───────────────────────────────────────────────────
// Standardstilen är 20-tals RAGTIME: stride-bas (oom-pah), synkoperad
// honky-tonk-melodi och lätt saloon-detune – helt syntetiserad, ingen
// ljudfil. Humöret följer konjunkturen (dur i boom, moll i bust) och
// tempot klockan. Den gamla ambient-bädden finns kvar som alternativ stil.

type Mood = "boom" | "stable" | "bust";
type MusicStyle = "track" | "ragtime" | "ambient";
const MUSIC_STYLE: MusicStyle = "track";

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

  // Pad: varje ackordton som ett par lätt detunade trianglar. Triangelns
  // övertoner ger det sakta svepande lågpasset (musicFilter + LFO) nåt att
  // forma – det är där ambientens "andning" hörs. Lång release → ackorden
  // överlappar sömlöst utan hörbar loop.
  for (const n of chord) {
    for (const det of [-4, 4]) {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = "triangle";
      osc.frequency.value = semi(n) * Math.pow(2, det / 1200);
      osc.connect(g);
      g.connect(musicBus);
      const peak = 0.05 / chord.length;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + chordDur * 0.4);
      g.gain.linearRampToValueAtTime(peak * 0.75, t0 + chordDur * 0.72);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + chordDur + 0.9);
      osc.start(t0);
      osc.stop(t0 + chordDur + 1.0);
    }
  }
  // Bas: grundtonen en oktav ned + en tyst sinus-sub för värme.
  for (const [type, oct, gain] of [["triangle", -12, 0.05], ["sine", -24, 0.03]] as const) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.value = semi(chord[0] + oct);
    osc.connect(g);
    g.connect(musicBus);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + chordDur + 0.5);
    osc.start(t0);
    osc.stop(t0 + chordDur + 0.6);
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

// ── Ragtime-motorn ───────────────────────────────────────────────────────────
// Allt spelas genom musicBus (lågpass + LFO + hall) så humörfiltret och
// volymtoningen fungerar som förut. En TAKT schemaläggs i taget.

/** Honky-tonk-pianoton: två lätt detunade oscillatorer + svag oktavpartial,
    skarp attack och exponentiellt utklingande – saloon-karaktären sitter i
    detunen (4–9 cent) och den snabba dämpningen. */
function pianoNote(freq: number, at: number, dur: number, vel: number) {
  const c = ctx;
  if (!c || !musicBus) return;
  const det = 4 + Math.random() * 5; // cent – honky-tonk!
  for (const [type, mult, g0] of [["triangle", 1, 1], ["square", 1, 0.22], ["sine", 2, 0.3]] as const) {
    for (const sign of type === "triangle" ? [-1, 1] : [1]) {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type;
      osc.frequency.value = freq * mult * Math.pow(2, (sign * det) / 1200);
      osc.connect(g);
      g.connect(musicBus);
      const peak = vel * g0 * (type === "triangle" ? 0.5 : 1) * 0.05;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(peak, at + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.start(at);
      osc.stop(at + dur + 0.03);
    }
  }
}

// Ackordföljder som halvtonssteg (grundton + treklang/septima), per humör.
const RAG_PROGRESSIONS: Record<Mood, number[][]> = {
  // Klassisk glad rag i dur: I I IV I · V7 V7 I V7
  boom: [
    [0, 4, 7], [0, 4, 7], [5, 9, 12], [0, 4, 7],
    [7, 11, 14, 17], [7, 11, 14, 17], [0, 4, 7], [7, 11, 14, 17],
  ],
  // Mjukare vardagsrag: I vi IV V
  stable: [
    [0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14],
    [0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14, 17],
  ],
  // Moll-rag i kristider: i iv i V7 (långsammare, dovare)
  bust: [
    [0, 3, 7], [5, 8, 12], [0, 3, 7], [7, 11, 14],
    [0, 3, 7], [5, 8, 12], [7, 11, 14], [0, 3, 7],
  ],
};

// Synkoperade melodirytmer i 16-delsrutnät (klassiska 3+3+2-mönster).
const RAG_RHYTHMS: number[][] = [
  [0, 3, 6, 8, 11, 14],
  [0, 2, 4, 7, 10, 12, 14],
  [0, 3, 4, 8, 11, 12],
  [2, 4, 7, 8, 12, 14],
  [0, 4, 6, 10, 12],
];

let barIx = 0;

/** Schemalägger EN takt ragtime (stride-bas + stab + synkoperad melodi). */
function scheduleRagBar() {
  const c = ctx;
  if (!c || !musicBus || !musicOn) return;
  const prog = RAG_PROGRESSIONS[mood];
  const chord = prog[barIx % prog.length];
  barIx++;
  const bpm = (mood === "boom" ? 112 : mood === "bust" ? 76 : 94) * (1 + Math.min(0.16, (tempo - 1) * 0.08));
  const beat = 60 / bpm;
  const bar = beat * 4;
  const t0 = c.currentTime + 0.06;

  // Stride: bas på slag 1 & 3 (grundton/kvint om lott), stab på 2 & 4.
  const bassRoot = semi(chord[0] - 24);
  const bassFifth = semi(chord[0] - 24 + (barIx % 2 === 0 ? 7 : -5));
  pianoNote(bassRoot, t0, 0.42, 1.0);
  pianoNote(bassFifth, t0 + 2 * beat, 0.42, 0.9);
  for (const off of [1, 3]) {
    for (const n of chord.slice(0, 3)) pianoNote(semi(n - 12), t0 + off * beat, 0.16, 0.55);
  }

  // Melodi: ett synkoperat mönster på ackordtoner en oktav upp, med
  // grannton-krydda och liten anslagsvariation – aldrig samma takt två gånger.
  const rhythm = RAG_RHYTHMS[Math.floor(Math.random() * RAG_RHYTHMS.length)];
  const pool = [...chord.map((n) => n + 12), chord[0] + 24, chord[1 % chord.length] + 24];
  let prev = Math.floor(Math.random() * pool.length);
  for (const six of rhythm) {
    if (mood === "bust" && Math.random() < 0.3) continue; // glesare i moll
    const step = Math.random() < 0.7 ? (Math.random() < 0.5 ? 1 : -1) : 2;
    prev = Math.max(0, Math.min(pool.length - 1, prev + step));
    let n = pool[prev];
    if (Math.random() < 0.12) n += Math.random() < 0.5 ? 1 : -1; // blue note-grannton
    pianoNote(semi(n), t0 + (six / 4) * beat, 0.32, 0.6 + Math.random() * 0.3);
  }

  scheduler = setTimeout(scheduleRagBar, bar * 1000);
}

// ── Riktiga musikspår (Pixabay) ──────────────────────────────────────────────
// Två loopade spår genom samma buskedja (lågpass + volymtoning): uppåt i
// högkonjunktur, kafé-jazz annars – kristider dämpar filtret i stället för
// att byta låt. Crossfade vid humörbyte. Ragtimen är kvar som fallback-stil.

const TRACK_URLS: Record<string, string> = { lugn: coffeeUrl, fart: bigcityUrl };
const trackBuf: Record<string, AudioBuffer | undefined> = {};
let tracksRequested = false;
let curTrack: { key: string; src: AudioBufferSourceNode; gain: GainNode } | null = null;

const trackKeyFor = (m: Mood) => (m === "boom" ? "fart" : "lugn");

function loadTracks(c: AudioContext) {
  if (tracksRequested) return;
  tracksRequested = true;
  for (const [k, url] of Object.entries(TRACK_URLS)) {
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => c.decodeAudioData(b))
      .then((buf) => {
        trackBuf[k] = buf;
        // Startа direkt när rätt spår blivit klart och musiken väntar.
        if (musicOn && !curTrack && k === trackKeyFor(mood)) startTrack(k);
      })
      .catch(() => { /* spåret uteblir – tystnad hellre än krasch */ });
  }
}

/** Startar (eller crossfadar till) ett loopat spår genom musikbussen. */
function startTrack(key: string) {
  const c = ctx;
  const buf = trackBuf[key];
  if (!c || !musicBus || !buf) return;
  if (curTrack?.key === key) return;
  const old = curTrack;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.linearRampToValueAtTime(1, c.currentTime + 2.5);
  src.connect(g);
  g.connect(musicBus);
  src.start(c.currentTime);
  curTrack = { key, src, gain: g };
  if (old) {
    old.gain.gain.cancelScheduledValues(c.currentTime);
    old.gain.gain.setValueAtTime(old.gain.gain.value, c.currentTime);
    old.gain.gain.linearRampToValueAtTime(0.0001, c.currentTime + 2.5);
    old.src.stop(c.currentTime + 2.7);
  }
}

/** Startar bakgrundsmusiken (kräver en användargest först – AudioContext). */
export function startMusic(): void {
  if (musicOn) {
    if (enabled) fadeMusic(true);
    return;
  }
  const c = audio();
  if (!c) return;
  musicOn = true;
  fadeMusic(true);
  if (MUSIC_STYLE === "track") {
    loadTracks(c);
    if (trackBuf[trackKeyFor(mood)]) startTrack(trackKeyFor(mood));
  } else if (MUSIC_STYLE === "ragtime") {
    scheduleRagBar();
  } else {
    scheduleChord();
  }
}

export function stopMusic(): void {
  musicOn = false;
  if (scheduler) clearTimeout(scheduler);
  scheduler = null;
  fadeMusic(false);
}

/** Sätter musikhumör efter konjunkturfas (boom/stable/bust). Humöret byter
    ackordföljd (dur/moll) och flyttar lågpassets grundklang – ljust i boom,
    dovt i bust. LFO:n andas fortfarande runt det värdet. */
export function setMusicMood(phase: Mood): void {
  mood = phase;
  const c = audio();
  if (c && musicFilter) {
    const base = MUSIC_STYLE === "track"
      ? (phase === "boom" ? 9000 : phase === "bust" ? 1500 : 6500)
      : MUSIC_STYLE === "ragtime"
        ? (phase === "boom" ? 3200 : phase === "bust" ? 1300 : 2300)
        : (phase === "boom" ? 1750 : phase === "bust" ? 640 : 1050);
    musicFilter.frequency.setTargetAtTime(base, c.currentTime, 2.5);
  }
  // Konjunkturen väljer spår: uppåt-låten i boom, kafé-jazzen annars.
  if (MUSIC_STYLE === "track" && musicOn) startTrack(trackKeyFor(phase));
}

/** Tempo följer klockan (1×/2×/4×) – snabbare progression vid högre fart. */
export function setMusicTempo(t: number): void {
  tempo = Math.max(0.5, Math.min(4, t));
}
