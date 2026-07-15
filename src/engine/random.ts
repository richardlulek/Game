/* ============================================================
   Slump- och id-hjälpare.

   Slumpen är SEEDAD: när ett frö är aktivt (seedRng) kommer alla
   dragningar ur en deterministisk PRNG (mulberry32) vars tillstånd
   lever i GameState.rng. Boundaryn i store/gameStore seedar före varje
   action och läser tillbaka tillståndet efteråt, så samma frö + samma
   händelsesekvens ger identiskt utfall (möjliggör replay/undo).

   Utan aktivt frö faller random01 tillbaka på Math.random(). Det är
   avsiktligt: testerna anropar reducer/advanceMonth direkt (utan
   boundaryn) och mockar Math.random – de fortsätter fungera orörda.
   ============================================================ */

import type { GameState } from "./types";

// ── Seedad PRNG (mulberry32) ──────────────────────────────────────────
let _rngState = 0;
let _seeded = false;

/** Aktiverar det seedade läget med ett heltalsfrö (PRNG-tillstånd). */
export function seedRng(n: number): void {
  _rngState = n >>> 0;
  _seeded = true;
}
/** Läser PRNG-tillståndet (skrivs tillbaka till GameState.rng av boundaryn). */
export function readRng(): number {
  return _rngState;
}
/** Stänger av det seedade läget → random01 använder Math.random igen. */
export function clearRng(): void {
  _seeded = false;
}

function nextPrng(): number {
  _rngState = (_rngState + 0x6d2b79f5) >>> 0;
  let t = _rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Slumptal i [0, 1). Seedat när ett frö är aktivt, annars Math.random. */
export function random01(): number {
  return _seeded ? nextPrng() : Math.random();
}

/** Slumptal i intervallet [a, b). */
export const rnd = (a: number, b: number): number => a + random01() * (b - a);

/** Slumpar ett element ur en array. */
export const pick = <T>(arr: T[]): T => arr[Math.floor(random01() * arr.length)];

let _id = 1;

/** Genererar ett nytt unikt id. */
export const newId = (): number => _id++;

/**
 * Synkar id-räknaren efter att ett sparat tillstånd laddats, så att nya id:n
 * inte krockar med redan existerande. Behövs för persistens mellan sessioner
 * (id-räknaren nollställs vid sidladdning).
 */
export function syncIdCounter(state: GameState): void {
  let max = 0;
  const consider = (n: number | undefined): void => {
    if (typeof n === "number" && n > max) max = n;
  };
  state.portfolio?.forEach((p) => {
    consider(p.id);
    p.tenants?.forEach((t) => consider(t.id));
  });
  state.listings?.forEach((p) => {
    consider(p.id);
    p.tenants?.forEach((t) => consider(t.id));
  });
  state.lots?.forEach((l) => consider(l.id));
  _id = max + 1;
}

/** Endast för test: nollställer id-räknaren. */
export function _resetIdCounter(start = 1): void {
  _id = start;
}
