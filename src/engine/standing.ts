/* ============================================================
   Standing – ett bestående förhållande (favör ↔ agg) till varje
   rival, till bankerna och till kommunen. Relationer du bygger
   eller bränner: de böjer lånevillkor, budklimat och skandalrisk.
   Ren logik, inga React-beroenden. Neutralt (0) som utgångsläge, så
   ett tillstånd utan standing beter sig exakt som förut.
   ============================================================ */

import type { GameState, Standing } from "./types";

const clampS = (v: number): number => Math.max(-100, Math.min(100, +v.toFixed(1)));

export function rivalStanding(s: GameState, name: string): number {
  return s.standing?.rivals?.[name] ?? 0;
}
export function bankStanding(s: GameState): number {
  return s.standing?.bank ?? 0;
}
export function cityStanding(s: GameState): number {
  return s.standing?.city ?? 0;
}

export type StandingTarget =
  | { kind: "rival"; name: string }
  | { kind: "bank" }
  | { kind: "city" };

/** Rent uppdaterad standing-karta (klampad −100…100). */
export function adjustStanding(
  standing: Standing | undefined,
  target: StandingTarget,
  delta: number,
): Standing {
  const cur: Standing = { ...(standing ?? {}) };
  if (target.kind === "rival") {
    cur.rivals = { ...(cur.rivals ?? {}), [target.name]: clampS((cur.rivals?.[target.name] ?? 0) + delta) };
  } else if (target.kind === "bank") {
    cur.bank = clampS((cur.bank ?? 0) + delta);
  } else {
    cur.city = clampS((cur.city ?? 0) + delta);
  }
  return cur;
}

export interface StandingLabel {
  label: string;
  color: string;
}

/** Etikett + färg för en standing-nivå (för UI). */
export function standingLabel(v: number): StandingLabel {
  if (v >= 60) return { label: "Ally", color: "#2d8a2d" };
  if (v >= 25) return { label: "Cordial", color: "#6aa84f" };
  if (v > -25) return { label: "Neutral", color: "#9a8555" };
  if (v > -60) return { label: "Wary", color: "#c07a2a" };
  return { label: "Hostile", color: "#b23030" };
}

/** Bankernas standing böjer lånevillkoren: bättre relation → billigare
 *  ränta och något högre belåningsgrad. ±100 ⇒ ∓0,4 pp ränta / ±4 pp LTV. */
export function bankStandingTerms(s: GameState): { rateDelta: number; ltvDelta: number } {
  const bs = bankStanding(s);
  return {
    rateDelta: +(-(bs / 100) * 0.4).toFixed(3),
    ltvDelta: +((bs / 100) * 0.04).toFixed(3),
  };
}

/** Kommunens välvilja dämpar (eller göder) skandalrisken (0,6–1,4×). */
export function cityScandalMult(s: GameState): number {
  return Math.max(0.6, Math.min(1.4, 1 - (cityStanding(s) / 100) * 0.3));
}
