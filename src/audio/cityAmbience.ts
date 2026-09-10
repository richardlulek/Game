import { QUIET_CITY, type AmbientLayer, type AmbientMix } from "./ambientMix";

const KEY = "fastighetsimperium:cityAmbience";
let volume = (() => { try { const stored = localStorage.getItem(KEY); const n = stored === null ? 0.45 : Number(stored); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.45; } catch { return 0.45; } })();
export function getCityAmbienceVolume() { return volume; }
export function setCityAmbienceVolume(v: number) {
  volume = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
  try { localStorage.setItem(KEY, String(volume)); } catch { /* private browsing */ }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("game-audio-settings"));
}

export interface CitySoundscape { update: (mix: AmbientMix) => void; silence: () => void; dispose: () => void; }

/** Quiet procedural environmental beds. Reuses the game's master/compressor;
 * no external sound downloads, extra AudioContexts or unbounded one-shot nodes. */
export function createCitySoundscape(c: AudioContext, output: AudioNode): CitySoundscape {
  const bus = c.createGain(); bus.gain.value = 0; bus.connect(output);
  const buffer = c.createBuffer(1, c.sampleRate * 4, c.sampleRate);
  const samples = buffer.getChannelData(0);
  let seed = 74981, low = 0;
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const white = seed / 2147483648 - 1;
    low = (low + 0.035 * white) / 1.035;
    samples[i] = low * 3.5;
  }
  // Bring both ends to zero so the four-second loop has no hard seam.
  const fade = Math.floor(c.sampleRate * 0.015);
  for (let i = 0; i < fade; i++) {
    samples[i] *= i / fade;
    samples[samples.length - 1 - i] *= i / fade;
  }
  const source = c.createBufferSource(); source.buffer = buffer; source.loop = true;
  const nodes: AudioNode[] = [source, bus];
  const gains = {} as Record<AmbientLayer, GainNode>;
  const frequencies: Record<AmbientLayer, [BiquadFilterType, number, number]> = {
    wind: ["lowpass", 850, 0.25], traffic: ["bandpass", 180, 0.6],
    crowd: ["bandpass", 650, 0.6], water: ["lowpass", 1800, 0.3],
    industry: ["bandpass", 100, 1.4], works: ["bandpass", 1200, 1.1],
  };
  for (const key of Object.keys(frequencies) as AmbientLayer[]) {
    const filter = c.createBiquadFilter(), gain = c.createGain();
    [filter.type, filter.frequency.value, filter.Q.value] = frequencies[key];
    gain.gain.value = 0;
    source.connect(filter); filter.connect(gain); gain.connect(bus);
    gains[key] = gain; nodes.push(filter, gain);
  }
  // Slow surf motion and a subdued rhythmic construction layer.
  const surf = c.createOscillator(), surfDepth = c.createGain();
  surf.frequency.value = 0.17; surfDepth.gain.value = 0;
  surf.connect(surfDepth); surfDepth.connect(gains.water.gain);
  const work = c.createOscillator(), workDepth = c.createGain();
  work.type = "square"; work.frequency.value = 5; workDepth.gain.value = 0;
  work.connect(workDepth); workDepth.connect(gains.works.gain);
  nodes.push(surf, surfDepth, work, workDepth);
  source.start(); surf.start(); work.start();
  let disposed = false;
  const update = (mix: AmbientMix) => {
    if (disposed) return;
    const audible = Object.values(mix).some(v => v > 0);
    bus.gain.setTargetAtTime(audible ? volume * 0.16 : 0, c.currentTime, audible && volume > 0 ? 0.3 : 0.03);
    for (const key of Object.keys(gains) as AmbientLayer[]) gains[key].gain.setTargetAtTime(mix[key], c.currentTime, 0.8);
    surfDepth.gain.setTargetAtTime(mix.water * 0.2, c.currentTime, 0.8);
    workDepth.gain.setTargetAtTime(mix.works * 0.35, c.currentTime, 0.4);
  };
  return {
    update,
    silence: () => update(QUIET_CITY),
    dispose: () => {
      if (disposed) return;
      disposed = true; source.stop(); surf.stop(); work.stop();
      nodes.forEach(node => node.disconnect());
    },
  };
}
